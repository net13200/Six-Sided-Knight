/**
 * Authoring aid for Ranger stages: hill-climbs triangle rooms toward stages
 * that can't be won without a face, then drops every tree, water cell and
 * enemy the stage doesn't need (like tools/teach-climb.ts for the Knight).
 *
 *   npx tsx tools/ranger-climb.ts --teach bow --palette "..##~w" [options]
 *
 * Options: --teach a,b  --palette glyphs  --par 6-14  --loadout "Bow Knife ..."
 *          --template file.txt  --width 9 --height 6  --steps 400 --climbs 20
 *          --want 3 --seed 1
 */
import { readFileSync } from 'node:fs';
import { Rng } from '../src/engine';
import { parseRangerLevel, startState, type RLevel } from '../src/ranger/rules';
import { solveRanger } from '../src/ranger/solve';
import {
  checkRangerTeach,
  rangerFacts,
  withoutFace,
  type RangerTeach,
} from '../src/ranger/teaches';

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? def) : def;
};
const [pMin, pMax] = opt('par', '6-14').split('-').map(Number) as [number, number];
const teaches = opt('teach', '').split(',').filter(Boolean) as RangerTeach[];
const palette = opt('palette', '..##~w');
const W = Number(opt('width', '9'));
const H = Number(opt('height', '6'));
const loadout = opt('loadout', 'Leaf Leaf Bow Knife Trap Rope Cloak Boots');
const rng = new Rng(Number(opt('seed', '1')) >>> 0);
const template = opt('template', '');
const FACE: Record<string, string> = {
  bow: 'Bow',
  knife: 'Knife',
  trap: 'Trap',
  rope: 'Rope',
  boots: 'Boots',
  cloak: 'Cloak',
  herb: 'Herb',
};

type Grid = string[][];
const toText = (g: Grid) =>
  `id: climb\nname: Climb\nloadout: ${loadout}\n---\n${g.map((r) => r.join('')).join('\n')}`;
const level = (g: Grid): RLevel | null => {
  try {
    return parseRangerLevel(toText(g));
  } catch {
    return null;
  }
};

function fresh(): Grid {
  const g = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));
  // The die on an up triangle, the exit anywhere else.
  let x: number, y: number;
  do {
    x = rng.int(W);
    y = rng.int(H);
  } while ((x + y) % 2);
  g[y]![x] = '@';
  let ex: number, ey: number;
  do {
    ex = rng.int(W);
    ey = rng.int(H);
  } while (ex === x && ey === y);
  g[ey]![ex] = '>';
  for (let i = 0; i < 8; i++) mutate(g);
  return g;
}

function mutate(g: Grid): void {
  const x = rng.int(W);
  const y = rng.int(H);
  const here = g[y]![x]!;
  if (here === '@' || here === '>') {
    const tx = rng.int(W);
    const ty = rng.int(H);
    if (g[ty]![tx] === '.' && (here !== '@' || (tx + ty) % 2 === 0)) {
      g[ty]![tx] = here;
      g[y]![x] = '.';
    }
    return;
  }
  g[y]![x] = palette[rng.int(palette.length)]!;
}

interface Scored {
  score: number;
  done: boolean;
  par: number;
  path: string;
}

function score(g: Grid): Scored {
  const bad = { score: -1e9, done: false, par: 0, path: '' };
  const lv = level(g);
  if (!lv) return bad;
  const r = solveRanger(startState(lv), { maxNodes: 40_000 });
  if (r.status !== 'solved') return bad;
  const out = r.moves < pMin ? pMin - r.moves : r.moves > pMax ? r.moves - pMax : 0;
  let s = -out * 15 + r.moves * 0.1;
  const f = rangerFacts(lv, r.path);
  for (const t of teaches) {
    if (t === 'roll') continue;
    const used = {
      bow: f.shots,
      knife: f.stabs,
      trap: f.snares,
      rope: f.swings,
      boots: f.leaps,
      cloak: f.cloaked,
      herb: f.heals,
    }[t];
    if (used) s += 30;
    const w = solveRanger(startState(withoutFace(lv, FACE[t]!)), { maxNodes: 60_000 });
    s += (w.status === 'unsolvable' ? 40 : w.status === 'budget' ? 20 : w.moves - r.moves) * 10;
  }
  const res = { score: s, done: false, par: r.moves, path: r.path.join('') };
  if (out) return res;
  for (const t of teaches) if (checkRangerTeach(lv, r.path, t).length) return res;
  return { ...res, done: true };
}

const found: string[] = [];
const climbs = Number(opt('climbs', '20'));
const steps = Number(opt('steps', '400'));
for (let c = 0; c < climbs && found.length < Number(opt('want', '3')); c++) {
  let g: Grid = template ? parseTemplate(readFileSync(template, 'utf8')) : fresh();
  let cur = score(g);
  for (let i = 0; i < steps && !cur.done; i++) {
    const next = g.map((r) => [...r]);
    mutate(next);
    if (rng.next() < 0.3) mutate(next);
    const s = score(next);
    if (s.score >= cur.score) {
      g = next;
      cur = s;
    }
  }
  if (!cur.done) {
    console.log(`climb ${c + 1}: no (par ${cur.par})`);
    continue;
  }
  // Tidy: drop anything the stage doesn't need.
  for (let changed = true; changed;) {
    changed = false;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if ('.@>'.includes(g[y]![x]!)) continue;
        const next = g.map((r) => [...r]);
        next[y]![x] = '.';
        const s = score(next);
        if (s.done) {
          g = next;
          cur = s;
          changed = true;
        }
      }
  }
  const text = g.map((r) => r.join('')).join('\n');
  found.push(text);
  console.log(`\nclimb ${c + 1}: par ${cur.par} ${cur.path}\n${text}`);
}
console.log(`\n${found.length} found`);

function parseTemplate(text: string): Grid {
  const body = text.split(/^---\s*$/m)[1] ?? text;
  return body
    .split('\n')
    .map((r) => r.trimEnd())
    .filter(Boolean)
    .map((r) => r.split(''));
}
