/**
 * Lesson clips: a mechanic shown, not explained. Each is a tiny scripted
 * level played with the real rules and animations, looping on the lesson
 * card. Each is a full 8x9 level (the board renderer needs that), mostly
 * wall, cropped to `view` (x, y, w, h in tiles) when drawn. Some show the
 * wrong way beside the right one.
 */
import type { Dir } from '../engine';

export type FocusKind = 'lead' | 'bottom' | 'top' | 'up';

/**
 * The face that matters, lit before the roll:
 * - 'lead': the side it rolls with;
 * - 'bottom': the side it rolls with, which then lands under the die;
 * - 'top': the top face (it stays put while sliding);
 * - 'up': the side behind, which comes up on top.
 */
export interface Focus {
  move: number;
  kind: FocusKind;
}

/** One played level: a clip shows one, or two side by side. */
export interface Reel {
  level: string;
  /** The moves, in order. */
  moves: Dir[];
  /** Which move earns the mark (index into moves), and where it pops. */
  check?: { after: number; at: 'die' | 'event' };
  focus?: Focus[];
  /** Starting HP, when it isn't full (shown above the board). */
  hp?: number;
  /**
   * More floors after this one (a gauntlet): each starts once the last is
   * won, with HP carried over. Their moves count on from this reel's.
   */
  floors?: { level: string; moves: Dir[] }[];
}

export interface Clip extends Reel {
  id: string;
  /** The campaign levels whose lesson this replaces. */
  levels: string[];
  /** For the review page only; the game shows no title. */
  name: string;
  view: [number, number, number, number];
  check: { after: number; at: 'die' | 'event' };
  /** The other way, played on the left at the same time: it gets a cross. */
  beside?: Reel;
  /** Draws the die's HP above the board (it changes in this clip). */
  hearts?: boolean;
}

const head = (id: string, extra = '') => `id: lesson-${id}\nname: ${id}\n${extra}---\n`;

/** A level from a few rows placed at row `y0`; every other row is wall. */
function board(id: string, extra: string, y0: number, rows: string[]): string {
  const grid = Array.from({ length: 9 }, (_, y) => rows[y - y0] ?? '########');
  return head(id, extra) + grid.join('\n');
}

/** A gauntlet's three floors, one above the other, with the die on floor `die`. */
const tower = (die: number) => {
  const row = (k: number) => {
    const r = k < 2 ? '#..^.>##' : '#....>##';
    return k === die ? '#@' + r.slice(2) : r;
  };
  return [row(0), '########', row(1), '########', row(2)];
};
const PIPS = 'loadout: Pip1 Pip6 Pip2 Pip5 Pip3 Pip4\n';

export const CLIPS: Clip[] = [
  {
    id: 'rolling',
    levels: ['c1-01'],
    name: '1 · Rolling',
    level: board('rolling', '', 4, ['#@...>##']),
    moves: ['E', 'E', 'E', 'E'],
    view: [0, 3, 7, 3],
    check: { after: 3, at: 'die' },
  },
  {
    id: 'leading',
    levels: ['c1-02'],
    name: '2 · The leading side',
    level: board('leading', 'enemies: 3,4 hp=1\n', 4, ['##@k.>##']),
    moves: ['E', 'E', 'E'],
    view: [1, 3, 6, 3],
    check: { after: 0, at: 'event' },
    focus: [{ move: 0, kind: 'lead' }],
  },
  {
    id: 'turn',
    levels: ['c1-03'],
    name: '3 · Turn the blade',
    level: board('turn', 'loadout: Sword Pip6 Pip2 Pip5 Pip3 Pip4\nenemies: 5,4 hp=1\n', 4, [
      '#.@..k>#',
    ]),
    moves: ['E', 'E', 'E', 'E'],
    view: [1, 3, 7, 3],
    check: { after: 1, at: 'event' },
    focus: [
      { move: 0, kind: 'top' },
      { move: 1, kind: 'lead' },
    ],
  },
  {
    id: 'shield',
    levels: ['c1-04'],
    name: '4 · Shield up',
    level: board('shield', 'loadout: Sword Pip6 Pip2 Pip5 Pip3 Shield\nenemies: 4,4 hp=1\n', 4, [
      '#.@.k.>#',
    ]),
    moves: ['E', 'E', 'E', 'E'],
    view: [1, 3, 7, 3],
    check: { after: 0, at: 'die' },
    focus: [{ move: 0, kind: 'up' }],
  },
  {
    id: 'keys',
    levels: ['c1-05'],
    name: '5 · Keys',
    level: board('keys', '', 2, ['###@####', '###|####', '###.####', '###>####']),
    moves: ['S', 'S', 'S'],
    view: [1, 1, 5, 6],
    check: { after: 0, at: 'event' },
    focus: [{ move: 0, kind: 'lead' }],
  },
  {
    id: 'treasure',
    levels: ['c1-06'],
    name: '6 · Treasure',
    level: board('treasure', '', 4, ['#>.$@.##']),
    moves: ['W', 'W', 'W'],
    view: [0, 3, 7, 3],
    check: { after: 0, at: 'event' },
    focus: [{ move: 0, kind: 'lead' }],
  },
  {
    id: 'spikes',
    levels: ['c1-07'],
    name: '7 · Spikes',
    level: board('spikes', '', 4, ['#@.^.>##']),
    moves: ['E', 'E', 'E', 'E'],
    view: [0, 3, 7, 3],
    check: { after: 1, at: 'die' },
    focus: [{ move: 1, kind: 'bottom' }],
  },
  {
    id: 'spring',
    levels: ['c1-08'],
    name: '8 · Healing',
    level: board('spring', 'loadout: Shield Pip6 Pip2 Pip5 Heart Pip4\n', 4, ['#.@~.>##']),
    hp: 2,
    hearts: true,
    moves: ['E', 'E', 'E'],
    view: [1, 3, 6, 3],
    check: { after: 0, at: 'die' },
    focus: [{ move: 0, kind: 'bottom' }],
  },
  {
    id: 'slime',
    levels: ['c1-09'],
    name: '9 · Slimes',
    level: board('slime', '', 4, ['#s.@..>#']),
    moves: ['E', 'E', 'E'],
    view: [0, 3, 8, 3],
    check: { after: 2, at: 'die' },
  },
  {
    id: 'bomb',
    levels: ['c1-10'],
    name: '10 · The Bomb',
    level: board('bomb', 'enemies: 2,3 hp=1; 4,3 hp=1\n', 3, ['##kkk###', '##.@.>##']),
    moves: ['N'],
    view: [1, 2, 5, 4],
    check: { after: 0, at: 'event' },
    focus: [{ move: 0, kind: 'lead' }],
  },
  {
    id: 'ice',
    levels: ['c2-01'],
    name: 'Ch. 2 · Ice',
    level: board('ice', '', 4, ['#@====.#', '######>#']),
    moves: ['E', 'S'],
    view: [0, 3, 8, 4],
    check: { after: 0, at: 'die' },
    focus: [{ move: 0, kind: 'top' }],
  },
  {
    id: 'wall-stop',
    levels: ['c2-02'],
    name: 'Ch. 2 · Walls stop you',
    level: board('wall-stop', '', 4, ['#@====##', '#####>##']),
    moves: ['E', 'S'],
    view: [0, 3, 7, 4],
    check: { after: 0, at: 'die' },
  },
  {
    id: 'enemy-stop',
    levels: ['c2-05'],
    name: 'Ch. 2 · Enemies stop you',
    level: board('enemy-stop', 'enemies: 6,4 hp=1\n', 4, ['#@====s#', '#####>##']),
    moves: ['E', 'S'],
    view: [0, 3, 8, 4],
    check: { after: 0, at: 'die' },
  },
  {
    id: 'floor-stop',
    levels: ['c2-06'],
    name: 'Ch. 2 · Floor stops you',
    level: board('floor-stop', '', 4, ['#@==.==#', '######>#']),
    moves: ['E', 'E', 'S'],
    view: [0, 3, 8, 4],
    check: { after: 0, at: 'die' },
  },
  {
    id: 'golem',
    levels: ['c3-01'],
    name: 'Ch. 3 · Golems',
    level: board('golem', 'enemies: 3,3 hp=2\n', 3, ['###g####', '###@####', '###>####']),
    moves: ['N'],
    view: [2, 2, 3, 4],
    check: { after: 0, at: 'event' },
    focus: [{ move: 0, kind: 'lead' }],
    beside: {
      level: board(
        'golem-sword',
        'loadout: Shield Heart Sword Key Bomb Coin\nenemies: 3,3 hp=2\n',
        3,
        ['###g####', '###@####', '###>####'],
      ),
      moves: ['N'],
      check: { after: 0, at: 'event' },
      focus: [{ move: 0, kind: 'lead' }],
    },
  },
  {
    id: 'splash',
    levels: ['c3-03'],
    name: 'Ch. 3 · Splash',
    level: board('splash', 'enemies: 3,2 hp=1; 3,3 hp=2\n', 2, [
      '###g####',
      '###g####',
      '###@####',
      '###>####',
    ]),
    moves: ['N'],
    view: [1.5, 1, 4, 5],
    check: { after: 0, at: 'event' },
    focus: [{ move: 0, kind: 'lead' }],
  },
  {
    id: 'lane',
    levels: ['c4-01'],
    name: 'Ch. 4 · Archers',
    level: board('lane', '', 3, ['#...@..#', '#a.#...#', '#.....>#']),
    moves: ['S', 'S', 'E', 'E'],
    view: [0.5, 2.6, 6.5, 3.8],
    check: { after: 0, at: 'die' },
    beside: {
      level: board('lane-open', '', 3, ['#.@....#', '#a.#...#', '#.....>#']),
      moves: ['S', 'S'],
      check: { after: 0, at: 'die' },
    },
  },
  {
    id: 'cover',
    levels: ['c4-02'],
    name: 'Ch. 4 · Take cover',
    level: board('cover', 'enemies: 3,4 wait=9\n', 3, ['#....@.#', '#a.s...#', '#....>.#']),
    moves: ['S', 'S'],
    view: [0.5, 2.6, 6.5, 3.8],
    check: { after: 0, at: 'die' },
    beside: {
      level: board('cover-open', '', 3, ['#....@.#', '#a.....#', '#....>.#']),
      moves: ['S', 'S'],
      check: { after: 0, at: 'die' },
    },
  },
  {
    id: 'corner',
    levels: ['c4-03'],
    name: 'Ch. 4 · Around the corner',
    level: board('corner', 'enemies: 3,4 hp=1\n', 3, ['#..>...#', '###ka###', '###@####']),
    moves: ['N'],
    view: [1, 2, 6, 5],
    check: { after: 0, at: 'event' },
    focus: [{ move: 0, kind: 'lead' }],
  },
  {
    id: 'skate',
    levels: ['c4-04'],
    name: 'Ch. 4 · Skate past',
    level: board('skate', '', 2, ['####a###', '####.###', '#@=====#', '######>#']),
    moves: ['E', 'S'],
    view: [0.5, 1.6, 7, 4],
    check: { after: 0, at: 'die' },
    beside: {
      level: board('skate-walk', '', 2, ['####a###', '####.###', '#@.....#', '######>#']),
      moves: ['E', 'E', 'E'],
      check: { after: 2, at: 'die' },
    },
  },
  {
    id: 'freeze',
    levels: ['c5-01'],
    name: 'Ch. 5 · Freeze',
    level: board('freeze', 'loadout: Shield Heart Freeze Key Sword Coin\n', 3, [
      '###k####',
      '###@..>#',
    ]),
    moves: ['N', 'E', 'E', 'E'],
    view: [1, 2, 7, 4],
    check: { after: 0, at: 'event' },
    focus: [{ move: 0, kind: 'lead' }],
  },
  {
    id: 'statue',
    levels: ['c5-03'],
    name: 'Ch. 5 · Ice statue',
    level: board('statue', 'loadout: Shield Heart Freeze Key Sword Coin\n', 1, [
      '###>####',
      '#.==s###',
      '#===@###',
    ]),
    moves: ['N', 'W', 'N', 'E', 'N'],
    view: [0, 0.5, 6, 4],
    check: { after: 3, at: 'die' },
    focus: [{ move: 0, kind: 'lead' }],
  },
  {
    id: 'hook',
    levels: ['c6-01'],
    name: 'Ch. 6 · Hook',
    level: board('hook', 'loadout: Shield Heart Bomb Key Hook Coin\nenemies: 4,4 hp=1\n', 4, [
      '#@..s..#',
      '######>#',
    ]),
    moves: ['E'],
    view: [0, 3, 6, 3],
    check: { after: 0, at: 'event' },
    focus: [{ move: 0, kind: 'lead' }],
  },
  {
    id: 'come-here',
    levels: ['c6-02'],
    name: 'Ch. 6 · Come here',
    level: board('come-here', 'loadout: Shield Heart Bomb Key Hook Coin\n', 4, [
      '#@..a..#',
      '######>#',
    ]),
    moves: ['E'],
    view: [0, 3, 6, 3],
    check: { after: 0, at: 'event' },
    focus: [{ move: 0, kind: 'lead' }],
    beside: {
      level: board('come-here-walk', '', 4, ['#@..a..#', '######>#']),
      moves: ['E'],
      check: { after: 0, at: 'die' },
    },
  },
  {
    id: 'gauntlet',
    levels: ['c2-10', 'c3-10', 'c4-10', 'c5-10', 'c6-10'],
    name: 'Gauntlets',
    level: board('gauntlet-1', PIPS, 2, tower(0)),
    moves: ['E', 'E', 'E', 'E'],
    floors: [
      { level: board('gauntlet-2', PIPS, 2, tower(1)), moves: ['E', 'E', 'E', 'E'] },
      { level: board('gauntlet-3', PIPS, 2, tower(2)), moves: ['E', 'E', 'E', 'E'] },
    ],
    hearts: true,
    view: [0.5, 0.6, 6, 7],
    check: { after: 11, at: 'die' },
  },
];

/** The clip that replaces a level's text lesson, if it has one. */
export function clipFor(levelId: string): Clip | null {
  return CLIPS.find((c) => c.levels.includes(levelId)) ?? null;
}
