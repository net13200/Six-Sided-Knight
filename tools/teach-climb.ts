/**
 * Authoring aid: hill-climbs rooms toward levels that can't be won without a
 * tool (Freeze by default), much faster than random search when such levels
 * are rare. Each step changes one cell; a change is kept when the gap between
 * par and par without the tool doesn't shrink. A room is done when it's
 * proven unwinnable without the tool and passes every `--teach` check.
 *
 *   npx tsx tools/teach-climb.ts --teach freeze --palette ".#k^a|" [options]
 *
 * Options:
 *   --teach a,b        ideas the par route must use (see src/levels/teaches.ts)
 *   --off freeze       the tool that must be essential (default freeze)
 *   --palette ".#k^"   glyphs a cell may become (repeat a glyph to weight it)
 *   --base . | =       floor or ice for fresh rooms (default .)
 *   --template t.txt   start from this level instead of a fresh room
 *   --par 8-14         par range to keep
 *   --loadout a,b,...  die faces by home slot
 *   --floor            a later gauntlet floor: must be winnable from 1 HP
 *   --steps 400        steps per climb   --climbs 20   --seed 1   --want 3
 */
import { readFileSync } from 'node:fs';
import { defaultRules } from '../src/content/register';
import { Rng, createState, parseTextLevel, validateLevel, type LevelData } from '../src/engine';
import { MIN_ARRIVAL_HP } from '../src/meta/daily';
import { checkTeach, routeFacts, rulesWithout, type Teach } from '../src/levels/teaches';
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
const off = opt('off', 'freeze') as Parameters<typeof rulesWithout>[0];
const without = rulesWithout(off);
const teaches = opt('teach', '').split(',').filter(Boolean) as Teach[];
const palette = opt('palette', '.#k^');
const base = opt('base', '.');
const [pMin, pMax] = range(opt('par', '8-16'));
const loadout = opt('loadout', '') ? opt('loadout', '').split(',') : undefined;
const floorMode = flag('floor');
const steps = Number(opt('steps', '400'));
const climbs = Number(opt('climbs', '20'));
const want = Number(opt('want', '3'));
const rng = new Rng(Number(opt('seed', '1')) >>> 0);
const templatePath = opt('template', '');
const template = templatePath ? parseTextLevel(readFileSync(templatePath, 'utf8')) : null;

type Grid = string[][];

function freshRoom(): Grid {
  const g = Array.from({ length: 9 }, (_, y) =>
    Array.from({ length: 8 }, (_, x) => (x === 0 || x === 7 || y === 0 || y === 8 ? '#' : base)),
  );
  const cell = (): [number, number] => [1 + rng.int(6), 1 + rng.int(7)];
  const [px, py] = cell();
  g[py]![px] = '@';
  let [ex, ey] = cell();
  while (ex === px && ey === py) [ex, ey] = cell();
  g[ey]![ex] = '>';
  for (let i = 0; i < 6; i++) mutate(g);
  return g;
}

function mutate(g: Grid): void {
  const x = 1 + rng.int(6);
  const y = 1 + rng.int(7);
  const here = g[y]![x]!;
  if (here === '@' || here === '>') {
    // Occasionally move the start or the stairs to a plain cell.
    const tx = 1 + rng.int(6);
    const ty = 1 + rng.int(7);
    if ('.='.includes(g[ty]![tx]!)) {
      g[ty]![tx] = here;
      g[y]![x] = base;
    }
    return;
  }
  const ch = palette[rng.int(palette.length)]!;
  g[y]![x] = ch === '.' ? base : ch;
}

function levelOf(g: Grid): LevelData {
  return {
    ...(template ?? { schema: 1, name: 'Climb' }),
    schema: 1,
    id: 'climb',
    name: template?.name ?? 'Climb',
    grid: g.map((r) => r.join('')),
    ...(loadout ? { loadout } : {}),
    enemies: undefined,
  } as LevelData;
}

interface Scored {
  score: number;
  done: boolean;
  par: number;
  path: string;
}

/** Higher is better; `done` = essential and every check passes. */
function score(level: LevelData): Scored {
  const bad = { score: -1e9, done: false, par: 0, path: '' };
  if (validateLevel(rules, level).length) return bad;
  const r = solve(rules, createState(rules, level), { maxNodes: 80_000 });
  if (r.status !== 'solved') return bad;
  const outOfRange = r.moves < pMin ? pMin - r.moves : r.moves > pMax ? r.moves - pMax : 0;
  const f = routeFacts(rules, level, r.path);
  const uses = off === 'freeze' ? f.freezes.length > 0 : true;
  const w = solve(without, createState(without, level), { maxNodes: 150_000 });
  const gap = w.status === 'unsolvable' ? 40 : w.status === 'budget' ? 20 : w.moves - r.moves;
  const s = gap * 10 - outOfRange * 15 + (uses ? 30 : 0) + r.moves * 0.1;
  const res = { score: s, done: false, par: r.moves, path: r.path.join('') };
  if (w.status !== 'unsolvable' || outOfRange || !uses) return res;
  if (floorMode) {
    const low = solve(rules, createState(rules, level, { hp: MIN_ARRIVAL_HP }), {
      maxNodes: 200_000,
    });
    if (low.status !== 'solved') return res;
  }
  for (const t of teaches) if (checkTeach(rules, level, r.path, t).length) return res;
  return { ...res, done: true };
}

const found: Array<{ grid: string[]; par: number; path: string }> = [];
for (let c = 0; c < climbs && found.length < want; c++) {
  let g: Grid = template ? template.grid.map((row) => row.split('')) : freshRoom();
  let cur = score(levelOf(g));
  for (let i = 0; i < steps && !cur.done; i++) {
    const next = g.map((row) => [...row]);
    const n = 1 + (rng.next() < 0.3 ? 1 : 0);
    for (let k = 0; k < n; k++) mutate(next);
    const s = score(levelOf(next));
    if (s.score >= cur.score) {
      g = next;
      cur = s;
    }
  }
  if (cur.done) {
    // Tidy up: drop every wall, enemy and hazard the level doesn't need.
    for (let changed = true; changed;) {
      changed = false;
      for (let y = 1; y < 8; y++) {
        for (let x = 1; x < 7; x++) {
          if ('@>'.includes(g[y]![x]!) || g[y]![x] === base) continue;
          const next = g.map((row) => [...row]);
          next[y]![x] = base;
          const s = score(levelOf(next));
          if (s.done) {
            g = next;
            cur = s;
            changed = true;
          }
        }
      }
    }
    const grid = g.map((r) => r.join(''));
    found.push({ grid, par: cur.par, path: cur.path });
    console.log(`\nclimb ${c + 1}: par ${cur.par} ${cur.path}\n${grid.join('\n')}`);
  } else console.log(`climb ${c + 1}: no (best score ${cur.score.toFixed(0)}, par ${cur.par})`);
}
console.log(`\n${found.length} found`);
