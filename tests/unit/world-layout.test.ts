import { describe, expect, it } from 'vitest';
import { buildWorld, COLS, findPath, key, stepFrom, type Pos } from '../../src/game/world/layout';

const world = buildWorld(60, 10);
const inside = (p: Pos) => p.c >= 0 && p.c < COLS && p.r >= 0 && p.r < world.rows;
const adjacent = (a: Pos, b: Pos) => Math.abs(a.c - b.c) + Math.abs(a.r - b.r) === 1;

describe('the world map layout', () => {
  it('has a district per chapter and a pedestal per level, all on the board', () => {
    expect(world.bands).toHaveLength(6);
    expect(world.pedestals).toHaveLength(60);
    for (const p of world.pedestals) expect(inside(p)).toBe(true);
    // Level 1 at the bottom, level 60 at the top.
    expect(world.pedestals[0]!.r).toBeGreaterThan(world.pedestals[59]!.r);
  });

  it('each road is a connected line of tiles from one pedestal to the next', () => {
    for (let i = 1; i < 60; i++) {
      const line = [world.pedestals[i - 1]!, ...world.segments[i]!, world.pedestals[i]!];
      for (let k = 1; k < line.length; k++) expect(adjacent(line[k - 1]!, line[k]!)).toBe(true);
      for (const t of world.segments[i]!) expect(inside(t)).toBe(true);
    }
  });

  it('no two roads or pedestals share a tile', () => {
    const seen = new Set<string>();
    const add = (p: Pos) => {
      expect(seen.has(key(p)), key(p)).toBe(false);
      seen.add(key(p));
    };
    world.pedestals.forEach(add);
    world.segments.forEach((s) => s.forEach(add));
    for (const l of world.landmarks) add(l.pos);
  });

  it('landmarks hang off the road', () => {
    for (const l of world.landmarks) {
      const line = [...l.road, l.pos];
      for (let k = 1; k < line.length; k++) expect(adjacent(line[k - 1]!, line[k]!)).toBe(true);
      for (const t of line) expect(inside(t)).toBe(true);
    }
    const byId = Object.fromEntries(world.landmarks.map((l) => [l.id, l]));
    expect(adjacent(byId.smith!.road[0]!, world.pedestals[0]!)).toBe(true);
    expect(adjacent(byId.well!.road[0]!, world.pedestals[59]!)).toBe(true);
  });

  it('finds the way along open tiles, and not through closed ones', () => {
    const open = new Set<string>();
    world.pedestals.slice(0, 5).forEach((p) => open.add(key(p)));
    world.segments.slice(0, 5).forEach((s) => s.forEach((p) => open.add(key(p))));
    const path = findPath(open, world.pedestals[0]!, world.pedestals[4]!)!;
    let at = world.pedestals[0]!;
    for (const d of path) {
      at = stepFrom(at, d);
      expect(open.has(key(at))).toBe(true);
    }
    expect(key(at)).toBe(key(world.pedestals[4]!));
    expect(findPath(open, world.pedestals[0]!, world.pedestals[5]!)).toBeNull();
    expect(findPath(open, world.pedestals[2]!, world.pedestals[2]!)).toEqual([]);
  });
});
