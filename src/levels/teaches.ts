/**
 * "Does this level teach what it says?" Each campaign level names the idea
 * it's about (`teaches:` in its file). The par solution (fewest moves) must
 * actually use that idea, and where the idea is a tool (a face, a tile), the
 * level must need it: with the tool switched off, par gets longer or the level
 * can't be won. Freeze is stricter: a Freeze level can't be won without it. For hazards (archers, spikes) it's the reverse: without the
 * hazard par gets shorter, so the hazard really shapes the route.
 *
 * Used by the campaign test and the level tools; not part of the game bundle.
 */
import { defaultRules } from '../content/register';
import {
  DIR_DELTA,
  createState,
  step,
  type Dir,
  type GameState,
  type LevelData,
  type Rules,
} from '../engine';
import { solve } from '../solver/solve';

export const TEACHES = [
  'move',
  'strike',
  'sword',
  'block',
  'key',
  'coin',
  'guard',
  'heal',
  'slime',
  'splash',
  'slide',
  'slide-floor',
  'slide-enemy',
  'slide-spikes',
  'golem',
  'golem-splash',
  'archer',
  'cover',
  'freeze',
  'freeze-archer',
  'freeze-stopper',
  'hook-gem',
  'hook-enemy',
] as const;
export type Teach = (typeof TEACHES)[number];

/** Mechanics that can be switched off to see whether a level needs them. */
type Switch =
  'block' | 'guard' | 'heal' | 'splash' | 'freeze' | 'freeze-archer' | 'hook' | 'arrows' | 'spikes';

/** Rules with one mechanic switched off. */
export function rulesWithout(off: Switch): Rules {
  const r = defaultRules();
  const face = (id: string) => r.faces.get(id);
  switch (off) {
    case 'block':
      r.faces.replace({ ...face('Shield'), modifyIncomingDamage: undefined });
      break;
    case 'guard':
      r.faces.replace({
        ...face('Shield'),
        tags: face('Shield').tags.filter((t) => t !== 'guard'),
      });
      break;
    case 'heal':
      r.faces.replace({ ...face('Heart'), tags: face('Heart').tags.filter((t) => t !== 'heal') });
      break;
    case 'splash':
      r.faces.replace({
        ...face('Bomb'),
        onAttack: (ctx, target) => ctx.damageEnemy(target.id, 2, 'Bomb'),
      });
      break;
    case 'freeze':
      r.faces.replace({
        ...face('Freeze'),
        onAttack: (ctx, target) => (ctx.damageEnemy(target.id, 0, 'Freeze'), false),
      });
      break;
    case 'freeze-archer': {
      // Freeze still works, just not on archers.
      const freeze = face('Freeze');
      r.faces.replace({
        ...freeze,
        onAttack: (ctx, target, info) =>
          target.kind === 'archer'
            ? (ctx.damageEnemy(target.id, 0, 'Freeze'), false)
            : freeze.onAttack!(ctx, target, info),
      });
      break;
    }
    case 'hook':
      r.faces.replace({ ...face('Hook'), onLeadInto: undefined });
      break;
    case 'arrows':
      r.enemies.replace({ ...r.enemies.get('archer'), onEnemyTurn: () => {} });
      break;
    case 'spikes':
      r.tiles.replace({ ...r.tiles.get('spikes'), onLand: undefined });
      break;
  }
  return r;
}

/** What a route does, move by move (the facts the checks below look at). */
export interface RouteFacts {
  kills: Array<{ face: string; kind: string; splash: boolean }>;
  splashHits: string[]; // kinds hit by splash
  blocked: number;
  doors: number;
  chests: number;
  shieldSpikeLandings: number;
  heals: number;
  slimeWaitsNextToYou: number;
  slides: number;
  slideStops: string[]; // 'floor' | 'spikes' | 'enemy' | 'frozen-enemy' | 'wall' | 'exit' | tile id
  freezes: string[]; // kinds frozen
  hookGems: number;
  hookEnemies: number;
  covered: number; // turns an enemy stood between you and an archer that had you in line
}

export function routeFacts(rules: Rules, level: LevelData, path: readonly Dir[]): RouteFacts {
  const f: RouteFacts = {
    kills: [],
    splashHits: [],
    blocked: 0,
    doors: 0,
    chests: 0,
    shieldSpikeLandings: 0,
    heals: 0,
    slimeWaitsNextToYou: 0,
    slides: 0,
    slideStops: [],
    freezes: [],
    hookGems: 0,
    hookEnemies: 0,
    covered: 0,
  };
  let s: GameState = createState(rules, level);
  // Where and when each enemy was frozen: it stays put until it acts again
  // (the move after its freeze wears off), so it's still a frozen stopper then.
  const frozenAt = new Map<number, { move: number; x: number; y: number }>();
  let move = 0;
  for (const dir of path) {
    move++;
    const before = s;
    const r = step(rules, s, { type: 'move', dir });
    s = r.state;
    const kindOf = (id: number) => before.enemies.find((e) => e.id === id)?.kind ?? '?';
    const hitBy = new Map<number, { face: string; splash: boolean }>();
    let slid = false;
    let end = { x: before.player.x, y: before.player.y };
    let spikeHurt = false;
    for (const e of r.events) {
      if (e.type === 'attacked') {
        hitBy.set(e.target, { face: e.face, splash: !!e.splash });
        if (e.splash) f.splashHits.push(kindOf(e.target));
      } else if (e.type === 'killed') {
        const h = hitBy.get(e.enemyId);
        f.kills.push({ face: h?.face ?? '?', kind: e.kind, splash: !!h?.splash });
      } else if (e.type === 'enemyAttacked' && e.blocked) f.blocked++;
      else if (e.type === 'unlocked') f.doors++;
      else if (e.type === 'opened') f.chests++;
      else if (e.type === 'healed') f.heals++;
      else if (e.type === 'effectApplied') {
        f.freezes.push(kindOf(e.enemyId));
        const en = before.enemies.find((x) => x.id === e.enemyId);
        if (en) frozenAt.set(e.enemyId, { move, x: en.x, y: en.y });
      } else if (e.type === 'pulled') {
        if (e.enemyId !== undefined) f.hookEnemies++;
        else f.hookGems++;
      } else if (e.type === 'moved') end = e.to;
      else if (e.type === 'slid') {
        slid = true;
        end = e.to;
      } else if (e.type === 'hurt' && e.source.kind === 'tile' && e.source.tile === 'spikes') {
        spikeHurt = true;
      } else if (e.type === 'enemyWaited') {
        const en = s.enemies.find((x) => x.id === e.enemyId);
        if (en?.kind === 'slime' && Math.abs(en.x - s.player.x) + Math.abs(en.y - s.player.y) === 1)
          f.slimeWaitsNextToYou++;
      }
    }
    const moved = end.x !== before.player.x || end.y !== before.player.y;
    const tileHere = before.tiles[end.y * before.width + end.x];
    if (moved && tileHere === 'spikes' && !spikeHurt) f.shieldSpikeLandings++;
    if (slid) {
      f.slides++;
      const here = rules.tiles.get(tileHere!);
      const { dx, dy } = DIR_DELTA[dir];
      const enemy = before.enemies.find((x) => x.x === end.x + dx && x.y === end.y + dy);
      f.slideStops.push(
        here.goal
          ? 'exit'
          : !here.carries
            ? here.id === 'spikes'
              ? 'spikes'
              : 'floor'
            : enemy
              ? stillFrozen(frozenAt.get(enemy.id), enemy, move)
                ? 'frozen-enemy'
                : 'enemy'
              : 'wall',
      );
    }
    if (s.status === 'playing') f.covered += coverCount(rules, s);
  }
  return f;
}

/**
 * Was frozen and hasn't moved since (a slow golem or slime stays put a while
 * after the freeze wears off). Whether the freeze was really needed is checked
 * separately: without Freeze, par must be longer.
 */
function stillFrozen(
  at: { move: number; x: number; y: number } | undefined,
  enemy: { x: number; y: number },
  move: number,
): boolean {
  return !!at && move > at.move && at.x === enemy.x && at.y === enemy.y;
}

/** Archers that have you in line but for an enemy standing in between. */
function coverCount(rules: Rules, s: GameState): number {
  let n = 0;
  for (const a of s.enemies) {
    if (a.kind !== 'archer' || a.effects.length) continue;
    const dx = Math.sign(s.player.x - a.x);
    const dy = Math.sign(s.player.y - a.y);
    if ((dx !== 0 && dy !== 0) || (dx === 0 && dy === 0)) continue;
    if (dx !== 0 && s.player.y !== a.y) continue;
    if (dy !== 0 && s.player.x !== a.x) continue;
    let x = a.x + dx;
    let y = a.y + dy;
    let enemyBetween = false;
    let clear = true;
    while (x !== s.player.x || y !== s.player.y) {
      if (!rules.tiles.get(s.tiles[y * s.width + x]!).passable) {
        clear = false;
        break;
      }
      if (s.enemies.some((e) => e.x === x && e.y === y)) enemyBetween = true;
      x += dx;
      y += dy;
    }
    if (clear && enemyBetween) n++;
  }
  return n;
}

/** Par (fewest moves) with a mechanic switched off, or null if the level can't be won. */
function parWithout(level: LevelData, off: Switch): number | null {
  const r = rulesWithout(off);
  const res = solve(r, createState(r, level), { maxNodes: 400_000 });
  return res.status === 'solved' ? res.moves : null;
}

/** The tool is needed: without it par is longer, or the level can't be won. */
function needs(level: LevelData, par: number, off: Switch): string | null {
  const p = parWithout(level, off);
  return p === null || p > par ? null : `still ${p} moves without ${off}`;
}

/** The tool is essential: without it the level is proven unwinnable. */
function essential(level: LevelData, off: Switch): string | null {
  const r = rulesWithout(off);
  const res = solve(r, createState(r, level), { maxNodes: 2_000_000 });
  if (res.status === 'unsolvable') return null;
  return res.status === 'solved'
    ? `winnable without ${off} (${res.moves} moves)`
    : `couldn't prove it needs ${off} (${res.status})`;
}

/** The hazard shapes the route: without it par would be shorter. */
function shapes(level: LevelData, par: number, off: Switch): string | null {
  const p = parWithout(level, off);
  return p !== null && p < par ? null : `par isn't shorter without ${off}`;
}

/**
 * Checks one idea against a level's par solution. Returns the problems found
 * (empty = the level teaches it).
 */
export function checkTeach(
  rules: Rules,
  level: LevelData,
  path: readonly Dir[],
  teach: Teach,
): string[] {
  const f = routeFacts(rules, level, path);
  const par = path.length;
  const out: string[] = [];
  const want = (ok: boolean, what: string) => {
    if (!ok) out.push(`par route doesn't ${what}`);
  };
  const also = (problem: string | null) => {
    if (problem) out.push(problem);
  };
  switch (teach) {
    case 'move':
      break;
    case 'strike':
      want(f.kills.length > 0, 'knock anything out');
      break;
    case 'sword':
      want(
        f.kills.some((k) => k.face === 'Sword'),
        'knock anything out with the Sword',
      );
      break;
    case 'block':
      want(f.blocked > 0, 'block a hit with the Shield on top');
      if (f.blocked > 0) also(needs(level, par, 'block'));
      break;
    case 'key':
      want(f.doors > 0, 'open a door');
      break;
    case 'coin':
      want(f.chests > 0, 'open a chest');
      break;
    case 'guard':
      want(f.shieldSpikeLandings > 0, 'land Shield-down on spikes');
      if (f.shieldSpikeLandings > 0) also(needs(level, par, 'guard'));
      break;
    case 'heal':
      want(f.heals > 0, 'heal on a pool');
      if (f.heals > 0) also(needs(level, par, 'heal'));
      break;
    case 'slime':
      want(f.slimeWaitsNextToYou > 0, 'use a slime waiting its turn');
      break;
    case 'splash':
      want(f.splashHits.length > 0, 'hit anything with a Bomb splash');
      if (f.splashHits.length > 0) also(needs(level, par, 'splash'));
      break;
    case 'slide':
      want(f.slides > 0, 'slide on ice');
      break;
    case 'slide-floor':
      want(f.slideStops.includes('floor'), 'end a slide on plain floor');
      break;
    case 'slide-enemy':
      want(f.slideStops.includes('enemy'), 'stop a slide against an enemy');
      break;
    case 'slide-spikes':
      want(f.slideStops.includes('spikes'), 'slide onto spikes');
      break;
    case 'golem':
      want(
        f.kills.some((k) => k.kind === 'golem'),
        'knock out a golem',
      );
      break;
    case 'golem-splash':
      want(f.splashHits.includes('golem'), 'splash a golem');
      if (f.splashHits.includes('golem')) also(needs(level, par, 'splash'));
      break;
    case 'archer':
      also(shapes(level, par, 'arrows'));
      break;
    case 'cover':
      want(f.covered > 0, 'hide behind an enemy from an archer');
      also(shapes(level, par, 'arrows'));
      break;
    case 'freeze':
      want(f.freezes.length > 0, 'freeze anything');
      if (f.freezes.length > 0) also(essential(level, 'freeze'));
      break;
    case 'freeze-archer':
      want(f.freezes.includes('archer'), 'freeze an archer');
      // Freezing the archer itself must be essential, not just Freeze in general.
      if (f.freezes.includes('archer')) also(essential(level, 'freeze-archer'));
      break;
    case 'freeze-stopper':
      want(f.slideStops.includes('frozen-enemy'), 'stop a slide against a frozen enemy');
      if (f.slideStops.includes('frozen-enemy')) also(essential(level, 'freeze'));
      break;
    case 'hook-gem':
      want(f.hookGems > 0, 'hook a gem');
      if (f.hookGems > 0) also(needs(level, par, 'hook'));
      break;
    case 'hook-enemy':
      want(f.hookEnemies > 0, 'hook an enemy');
      if (f.hookEnemies > 0) also(needs(level, par, 'hook'));
      break;
  }
  return out;
}
