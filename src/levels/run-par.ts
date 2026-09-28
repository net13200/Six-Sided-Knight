/**
 * ★★★ for a gauntlet: the fewest moves for the whole run, with HP carried
 * over and no healing between floors. Each floor's own par assumes full HP,
 * so a fast floor that costs HP can make the next floor slower; this tries
 * every "leave the floor with at least N HP" split and keeps the best total.
 */
import { createState, type LevelData, type Rules } from '../engine';
import { solve } from '../solver/solve';

export function runPar(rules: Rules, floors: readonly LevelData[], startHp: number): number | null {
  const memo = new Map<string, number | null>();
  const best = (i: number, hp: number): number | null => {
    if (i === floors.length) return 0;
    const key = `${i}:${hp}`;
    if (memo.has(key)) return memo.get(key)!;
    let result: number | null = null;
    for (let leave = hp; leave >= 1; leave--) {
      const r = solve(rules, createState(rules, floors[i]!, { hp }), {
        maxNodes: 400_000,
        accept: (s) => s.player.hp >= leave,
        keyExtra: (s) => s.player.hp,
      });
      if (r.status !== 'solved') continue;
      const rest = best(i + 1, leave);
      if (rest !== null && (result === null || r.moves + rest < result)) result = r.moves + rest;
    }
    memo.set(key, result);
    return result;
  };
  return best(0, startHp);
}
