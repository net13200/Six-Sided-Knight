/**
 * Turn resolution: step(rules, state, action) -> { state, events, consumed }.
 * Pure and deterministic. See SPEC.md section 3 for the turn order.
 * This file must never refer to a specific face, tile or enemy.
 */
import { TurnContext } from './context';
import { leadingFace } from './dice';
import type { LeadInfo, LeadResult, Rules } from './registry';
import { DIR_DELTA, type Action, type GameState, type StepResult } from './types';

export function step(rules: Rules, state: GameState, action: Action): StepResult {
  if (state.status !== 'playing') return { state, events: [], consumed: false };

  const ctx = new TurnContext(rules, state);
  const { dir } = action;
  const p = state.player;
  const from = { x: p.x, y: p.y };
  const to = { x: p.x + DIR_DELTA[dir].dx, y: p.y + DIR_DELTA[dir].dy };
  const face = leadingFace(p.die, dir);
  const info: LeadInfo = { from, to, dir, face };

  const invalid = (reason: string): StepResult => ({
    state,
    events: [{ type: 'bumped', at: to, dir, reason }],
    consumed: false,
  });

  if (!ctx.inBounds(to.x, to.y)) return invalid('edge');

  // 1. Player action.
  const target = ctx.enemyAt(to.x, to.y);
  if (target) {
    const faceDef = ctx.face(face);
    const killed = faceDef.onAttack
      ? faceDef.onAttack(ctx, target, info)
      : ctx.damageEnemy(target.id, faceDef.attack, face);
    if (killed && !ctx.over) ctx.rollPlayer(dir);
  } else {
    const tileDef = ctx.tileDefAt(to.x, to.y)!;
    let result: LeadResult | undefined = ctx.face(face).onLeadInto?.(ctx, info);
    result ??= tileDef.onLeadInto?.(ctx, info);
    result ??= tileDef.passable ? 'enter' : 'block';
    if (result === 'block') return invalid(tileDef.id);
    if (result === 'enter') ctx.rollPlayer(dir);
  }
  ctx.countMove();

  // 2. Reaching the goal ends the level before enemies act.
  if (ctx.status === 'won') {
    ctx.emit({ type: 'won', moves: state.stats.moves + 1 });
    return { state: ctx.finish(true), events: ctx.events, consumed: true };
  }

  // 3. Enemy phase, in reading order of positions at the start of the phase.
  if (!ctx.over) runEnemyPhase(ctx);

  // 4. End of turn hooks.
  if (!ctx.over) runTurnEnd(ctx);

  ctx.emit({ type: 'turnEnd', turn: state.turn + 1 });
  return { state: ctx.finish(true), events: ctx.events, consumed: true };
}

function runEnemyPhase(ctx: TurnContext): void {
  const order = [...ctx.enemies].sort((a, b) => a.y - b.y || a.x - b.x).map((e) => e.id);
  for (const id of order) {
    if (ctx.over) return;
    const enemy = ctx.enemyById(id);
    if (!enemy) continue; // died earlier this phase
    let skip = false;
    for (const eff of enemy.effects) {
      if (ctx.rules.effects.get(eff.id).onEnemyTurn?.(ctx, enemy)) skip = true;
    }
    if (skip) continue;
    const current = ctx.enemyById(id);
    if (current) ctx.rules.enemies.get(current.kind).onEnemyTurn(ctx, current);
  }
}

function runTurnEnd(ctx: TurnContext): void {
  for (let y = 0; y < ctx.height && !ctx.over; y++) {
    for (let x = 0; x < ctx.width && !ctx.over; x++) {
      ctx.tileDefAt(x, y)?.onTurnEnd?.(ctx, { x, y });
    }
  }
  for (const [slot, face] of ctx.dieSlots()) {
    if (ctx.over) return;
    ctx.face(face).onTurnEnd?.(ctx, slot);
  }
  for (const enemy of [...ctx.enemies]) {
    if (ctx.over) return;
    const current = ctx.enemyById(enemy.id);
    if (!current) continue;
    ctx.rules.enemies.get(current.kind).onTurnEnd?.(ctx, current);
    const after = ctx.enemyById(enemy.id);
    if (!after || after.effects.length === 0) continue;
    for (const eff of after.effects) ctx.rules.effects.get(eff.id).onTurnEnd?.(ctx, after);
    const latest = ctx.enemyById(enemy.id);
    if (latest) {
      ctx.setEnemyEffects(
        latest.id,
        latest.effects.map((e) => ({ ...e, turns: e.turns - 1 })).filter((e) => e.turns > 0),
      );
    }
  }
}
