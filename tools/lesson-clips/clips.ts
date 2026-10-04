/**
 * Lesson clips: tiny scripted levels that show a mechanic instead of
 * explaining it. Each is a full 8x9 level (the board renderer needs that),
 * mostly wall, cropped to `view` (x, y, w, h in tiles) when drawn.
 */
import type { Dir } from '../../src/engine';

export interface Clip {
  id: string;
  /** For the review page only; the game shows no title. */
  name: string;
  level: string;
  /** The moves, in order. */
  moves: Dir[];
  view: [number, number, number, number];
  /** Which move earns the check mark (index into moves), and where it pops. */
  check: { after: number; at: 'die' | 'event' };
  /** A glow on the face that matters: the side it rolls with, its bottom, or its top. */
  focus?: { move: number; kind: 'lead' | 'bottom' | 'top' };
}

const head = (id: string, extra = '') => `id: lesson-${id}\nname: ${id}\n${extra}---\n`;

export const CLIPS: Clip[] = [
  {
    id: 'rolling',
    name: '1 · Rolling',
    level:
      head('rolling') +
      [
        '########',
        '########',
        '########',
        '########',
        '#@...>##',
        '########',
        '########',
        '########',
        '########',
      ].join('\n'),
    moves: ['E', 'E', 'E', 'E'],
    view: [0, 3, 7, 3],
    check: { after: 3, at: 'die' },
  },
  {
    id: 'leading',
    name: '2 · The leading side',
    level:
      head('leading', 'enemies: 3,4 hp=1\n') +
      [
        '########',
        '########',
        '########',
        '########',
        '##@k.>##',
        '########',
        '########',
        '########',
        '########',
      ].join('\n'),
    moves: ['E', 'E', 'E'],
    view: [1, 3, 6, 3],
    check: { after: 0, at: 'event' },
    focus: { move: 0, kind: 'lead' },
  },
  {
    id: 'keys',
    name: '5 · Keys',
    level:
      head('keys') +
      [
        '########',
        '########',
        '###@####',
        '###|####',
        '###.####',
        '###>####',
        '########',
        '########',
        '########',
      ].join('\n'),
    moves: ['S', 'S', 'S'],
    view: [1, 1, 5, 6],
    check: { after: 0, at: 'event' },
    focus: { move: 0, kind: 'lead' },
  },
  {
    id: 'spikes',
    name: '7 · Spikes',
    level:
      head('spikes') +
      [
        '########',
        '########',
        '########',
        '########',
        '#@.^.>##',
        '########',
        '########',
        '########',
        '########',
      ].join('\n'),
    moves: ['E', 'E', 'E', 'E'],
    view: [0, 3, 7, 3],
    check: { after: 1, at: 'die' },
    focus: { move: 1, kind: 'bottom' },
  },
  {
    id: 'bomb',
    name: '10 · The Bomb',
    level:
      head('bomb', 'enemies: 2,3 hp=1; 4,3 hp=1\n') +
      [
        '########',
        '########',
        '########',
        '##kkk###',
        '##.@.>##',
        '########',
        '########',
        '########',
        '########',
      ].join('\n'),
    moves: ['N'],
    view: [1, 2, 5, 4],
    check: { after: 0, at: 'event' },
    focus: { move: 0, kind: 'lead' },
  },
  {
    id: 'ice',
    name: 'Ch. 2 · Ice',
    level:
      head('ice') +
      [
        '########',
        '########',
        '########',
        '########',
        '#@====.#',
        '######>#',
        '########',
        '########',
        '########',
      ].join('\n'),
    moves: ['E', 'S'],
    view: [0, 3, 8, 4],
    check: { after: 0, at: 'die' },
    focus: { move: 0, kind: 'top' },
  },
];
