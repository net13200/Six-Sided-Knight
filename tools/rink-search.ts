/**
 * Authoring aid: searches random ice rinks for ones with long optimal
 * solutions (classic sliding puzzles). Prints the best grids found.
 *   npx tsx tools/rink-search.ts <seed> <tries> [extra glyphs e.g. "k*"] [base tile] [loadout]
 * Base tile '=' (default) makes ice rinks; '.' makes plain rooms. An optional
 * comma-separated loadout swaps the die's faces.
 */
import { defaultRules } from '../src/content/register';
import {
  Rng,
  createState,
  leadingFace,
  step,
  validateLevel,
  type Dir,
  type GameState,
  type LevelData,
} from '../src/engine';
import { rate } from '../src/solver/rate';
import { analyze } from '../src/solver/solve';

const rules = defaultRules();
const [seedArg, triesArg, extraArg = '', base = '=', loadoutArg] = process.argv.slice(2);
const loadout = loadoutArg ? loadoutArg.split(',') : undefined;
const rng = new Rng(Number(seedArg ?? 1) >>> 0);
const tries = Number(triesArg ?? 200);
const found: Array<{ grid: string[]; min: number; score: number; gold: number; uses: string }> = [];
/** Only keep levels whose best solutions use this face (e.g. REQUIRE=Freeze). */
const require = process.env.REQUIRE;

/** Faces that did something along a path: attacked, froze or pulled. */
function facesUsed(start: GameState, path: readonly Dir[]): Set<string> {
  const used = new Set<string>();
  let s = start;
  for (const dir of path) {
    const face = leadingFace(s.player.die, dir);
    const r = step(rules, s, { type: 'move', dir });
    if (r.events.some((e) => e.type === 'attacked' || e.type === 'pulled')) used.add(face);
    s = r.state;
  }
  return used;
}

for (let t = 0; t < tries; t++) {
  const g = Array.from({ length: 9 }, (_, y) =>
    Array.from({ length: 8 }, (_, x) => (x === 0 || x === 7 || y === 0 || y === 8 ? '#' : base)),
  );
  // Shrink the rink a bit sometimes.
  if (rng.next() < 0.5) for (let x = 0; x < 8; x++) g[7]![x] = '#';
  const cells: Array<[number, number]> = [];
  for (let y = 1; y < 8; y++) for (let x = 1; x < 7; x++) if (g[y]![x] === base) cells.push([x, y]);
  const pick = () => cells.splice(rng.int(cells.length), 1)[0]!;
  const [px, py] = pick();
  g[py]![px] = '@';
  const [ex, ey] = pick();
  g[ey]![ex] = '>';
  const walls = 4 + rng.int(6);
  for (let i = 0; i < walls; i++) {
    const [x, y] = pick();
    g[y]![x] = '#';
  }
  const floors = base === '=' ? 1 + rng.int(4) : 0;
  for (let i = 0; i < floors; i++) {
    const [x, y] = pick();
    g[y]![x] = '.';
  }
  for (const ch of extraArg) {
    const [x, y] = pick();
    g[y]![x] = ch;
  }
  const grid = g.map((r) => r.join(''));
  const level: LevelData = {
    schema: 1,
    id: 'rink',
    name: 'Rink',
    grid,
    ...(loadout ? { loadout } : {}),
  };
  if (validateLevel(rules, level).length) continue;
  const s = createState(rules, level);
  const a = analyze(rules, s, 60_000);
  if (a.any.status !== 'solved' || a.noDamage.status !== 'solved' || a.allGold.status !== 'solved')
    continue;
  const used = new Set([
    ...facesUsed(s, a.any.path),
    ...facesUsed(s, a.noDamage.path),
    ...facesUsed(s, a.allGold.path),
  ]);
  if (require && !used.has(require)) continue;
  found.push({
    grid,
    min: a.any.moves,
    score: rate(rules, s).score,
    gold: a.allGold.moves,
    uses: [...used].join(','),
  });
}
found.sort((a, b) => b.min - a.min || b.score - a.score);
for (const f of found.slice(0, 6)) {
  console.log(`min ${f.min} gold ${f.gold} rate ${f.score} uses ${f.uses}\n${f.grid.join('\n')}\n`);
}
