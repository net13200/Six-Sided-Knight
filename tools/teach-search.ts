/**
 * Authoring aid: searches random rooms for levels whose par solution uses a
 * given idea (the same checks as `teaches:` in the campaign tests).
 *
 *   npx tsx tools/teach-search.ts --teach splash --extras "kkk^^" [options]
 *
 * Options:
 *   --teach a,b        ideas the par route must use (see src/levels/teaches.ts)
 *   --extras "kk$^"    glyphs placed at random (repeat a glyph for several)
 *   --base . | = | mix floor, ice, or a mix (default .)
 *   --walls 4-9        how many inner walls
 *   --par 8-14         par range to keep
 *   --loadout a,b,...  die faces by home slot (e.g. Shield,Heart,Bomb,Key,Sword,Freeze)
 *   --floor            a later gauntlet floor: must be winnable from 1 HP
 *   --tidy             every enemy, treasure and hazard must matter (removing it changes par)
 *   --clean            drop inner walls the solution doesn't need (cleaner rooms)
 *   --tries 400 --seed 1 --top 5
 */
import { defaultRules } from '../src/content/register';
import { Rng, createState, validateLevel, type LevelData } from '../src/engine';
import { MIN_ARRIVAL_HP } from '../src/meta/daily';
import { checkTeach, type Teach } from '../src/levels/teaches';
import { rate } from '../src/solver/rate';
import { solve } from '../src/solver/solve';

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? def) : def;
};
const flag = (name: string) => args.includes(`--${name}`);
const range = (s: string): [number, number] => {
  const [a, b] = s.split('-').map(Number);
  return [a!, b ?? a!];
};

const rules = defaultRules();
const teaches = opt('teach', '').split(',').filter(Boolean) as Teach[];
const extras = opt('extras', '');
const base = opt('base', '.');
const [wMin, wMax] = range(opt('walls', '4-9'));
const [pMin, pMax] = range(opt('par', '6-16'));
const loadout = opt('loadout', '') ? opt('loadout', '').split(',') : undefined;
const floorMode = flag('floor');
const tidy = flag('tidy');
const clean = flag('clean');
const tries = Number(opt('tries', '400'));
const rng = new Rng(Number(opt('seed', '1')) >>> 0);
const top = Number(opt('top', '5'));

/** Glyphs that are "content" (tidy mode checks each one matters). */
const CONTENT = new Set(['k', 's', 'a', 'g', '$', '*', '^', '~', '|']);

function fits(level: LevelData): { par: number; path: string; score: number } | null {
  if (validateLevel(rules, level).length) return null;
  const r = solve(rules, createState(rules, level), { maxNodes: 60_000 });
  if (r.status !== 'solved' || r.moves < pMin || r.moves > pMax) return null;
  if (floorMode) {
    const low = solve(rules, createState(rules, level, { hp: MIN_ARRIVAL_HP }), {
      maxNodes: 60_000,
    });
    if (low.status !== 'solved') return null;
  }
  for (const t of teaches) if (checkTeach(rules, level, r.path, t).length) return null;
  if (tidy) {
    for (let y = 0; y < level.grid.length; y++) {
      for (let x = 0; x < 8; x++) {
        const ch = level.grid[y]![x]!;
        if (!CONTENT.has(ch)) continue;
        const grid = level.grid.map((row, yy) =>
          yy === y ? row.slice(0, x) + (base === '=' ? '=' : '.') + row.slice(x + 1) : row,
        );
        const without = { ...level, grid };
        if (validateLevel(rules, without).length) continue;
        const w = solve(rules, createState(rules, without), { maxNodes: 60_000 });
        if (w.status === 'solved' && w.moves === r.moves) return null; // this piece doesn't matter
      }
    }
  }
  return {
    par: r.moves,
    path: r.path.join(''),
    score: rate(rules, createState(rules, level)).score,
  };
}

const found: Array<{ grid: string[]; par: number; path: string; score: number }> = [];
const seen = new Set<string>();
for (let t = 0; t < tries; t++) {
  const g = Array.from({ length: 9 }, (_, y) =>
    Array.from({ length: 8 }, (_, x) => {
      if (x === 0 || x === 7 || y === 0 || y === 8) return '#';
      if (base === 'mix') return rng.next() < 0.5 ? '=' : '.';
      return base;
    }),
  );
  if (rng.next() < 0.4) for (let x = 0; x < 8; x++) g[rng.next() < 0.5 ? 1 : 7]![x] = '#';
  const cells: Array<[number, number]> = [];
  for (let y = 1; y < 8; y++) for (let x = 1; x < 7; x++) if (g[y]![x] !== '#') cells.push([x, y]);
  const pick = () => cells.splice(rng.int(cells.length), 1)[0]!;
  const place = (ch: string) => {
    const [x, y] = pick();
    g[y]![x] = ch;
  };
  place('@');
  place('>');
  const walls = wMin + rng.int(wMax - wMin + 1);
  for (let i = 0; i < walls; i++) place('#');
  for (const ch of extras) place(ch);
  const grid = g.map((r) => r.join(''));
  const key = grid.join('');
  if (seen.has(key)) continue;
  seen.add(key);
  const level: LevelData = {
    schema: 1,
    id: 'search',
    name: 'Search',
    grid,
    ...(loadout ? { loadout } : {}),
  };
  const f = fits(level);
  if (!f) continue;
  let best = { grid, ...f };
  if (clean) {
    // Greedily remove inner walls while the level still fits with the same par.
    for (let y = 1; y < 8; y++) {
      for (let x = 1; x < 7; x++) {
        if (best.grid[y]![x] !== '#') continue;
        const g2 = best.grid.map((row, yy) =>
          yy === y ? row.slice(0, x) + (base === '=' ? '=' : '.') + row.slice(x + 1) : row,
        );
        const f2 = fits({ ...level, grid: g2 });
        if (f2 && f2.par === best.par) best = { grid: g2, ...f2 };
      }
    }
  }
  found.push(best);
}
found.sort((a, b) => b.score - a.score || b.par - a.par);
console.log(`${found.length} of ${tries} fit`);
for (const f of found.slice(0, top)) {
  console.log(`\npar ${f.par} rate ${f.score} ${f.path}\n${f.grid.join('\n')}`);
}
