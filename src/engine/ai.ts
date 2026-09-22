/** Reusable enemy behaviours. Enemy definitions compose these in onEnemyTurn. */
import type { TurnContext } from './context';
import { DIR_DELTA, DIRS, type Dir, type EnemyState, type Pos } from './types';

export type Intent =
  | { readonly kind: 'attack'; readonly dir: Dir }
  | { readonly kind: 'move'; readonly dir: Dir; readonly to: Pos }
  | { readonly kind: 'idle' };

export function isAdjacentToPlayer(ctx: TurnContext, e: EnemyState): boolean {
  return Math.abs(e.x - ctx.player.x) + Math.abs(e.y - ctx.player.y) === 1;
}

/**
 * What a chasing enemy would do right now (SPEC 7): attack if adjacent,
 * otherwise step to the unoccupied neighbour with the smallest BFS distance
 * that is strictly closer, ties broken N, E, S, W.
 */
export function chaseIntent(ctx: TurnContext, e: EnemyState): Intent {
  if (isAdjacentToPlayer(ctx, e)) {
    const dir = DIRS.find(
      (d) => e.x + DIR_DELTA[d].dx === ctx.player.x && e.y + DIR_DELTA[d].dy === ctx.player.y,
    )!;
    return { kind: 'attack', dir };
  }
  const dist = ctx.distanceFromPlayer();
  const here = dist[e.y * ctx.width + e.x]!;
  let best: { dir: Dir; to: Pos; d: number } | null = null;
  for (const dir of DIRS) {
    const to = { x: e.x + DIR_DELTA[dir].dx, y: e.y + DIR_DELTA[dir].dy };
    if (!ctx.inBounds(to.x, to.y)) continue;
    const d = dist[to.y * ctx.width + to.x]!;
    if (d < 0) continue;
    if (here >= 0 && d >= here) continue;
    if (ctx.enemyAt(to.x, to.y)) continue;
    if (!best || d < best.d) best = { dir, to, d };
  }
  // `here < 0` means the enemy stands somewhere the BFS can't reach (walled off): stay.
  if (!best || here < 0) return { kind: 'idle' };
  return { kind: 'move', dir: best.dir, to: best.to };
}

export function performIntent(ctx: TurnContext, e: EnemyState, intent: Intent, damage = 1): void {
  if (intent.kind === 'attack') ctx.enemyAttack(e, damage);
  else if (intent.kind === 'move') ctx.moveEnemy(e.id, intent.to);
}

export function chase(ctx: TurnContext, e: EnemyState, damage = 1): void {
  performIntent(ctx, e, chaseIntent(ctx, e), damage);
}
