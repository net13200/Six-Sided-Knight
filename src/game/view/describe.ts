/**
 * Text descriptions of the play screen for screen readers: the board around
 * the die and what each move would do (from the same outcome predictions as
 * the labels next to the die). Pure, so it's unit tested.
 */
import {
  DIRS,
  bottomFace,
  leadingFace,
  topFace,
  type Dir,
  type GameState,
  type Rules,
} from '../../engine';
import type { Outcome } from './outcome';
import { t, tk } from '../../i18n';

const DIR_WORD: Record<Dir, string> = { N: tk('Up'), E: tk('Right'), S: tk('Down'), W: tk('Left') };

/** "2 up, 3 right" style offset from the die. */
function offset(dx: number, dy: number): string {
  const parts: string[] = [];
  if (dy) parts.push(t(dy < 0 ? '{n} up' : '{n} down', { n: Math.abs(dy) }));
  if (dx) parts.push(t(dx < 0 ? '{n} left' : '{n} right', { n: Math.abs(dx) }));
  return parts.join(', ') || t('here');
}

export function describeBoard(
  rules: Rules,
  s: GameState,
  outcomes: ReadonlyArray<readonly [Dir, Outcome]>,
): string {
  const die = s.player.die;
  const lines: string[] = [
    t('HP {hp} of {max}. Move {n}.', { hp: s.player.hp, max: s.player.maxHp, n: s.stats.moves }),
    t('Top face {top}, bottom {bottom}.', {
      top: t(topFace(die)),
      bottom: t(bottomFace(die) ?? 'none'),
    }),
  ];
  for (const dir of DIRS) {
    const o = outcomes.find(([d]) => d === dir)?.[1];
    lines.push(
      `${t('{dir}: {face} leads.', { dir: t(DIR_WORD[dir]), face: t(leadingFace(die, dir)) })} ${o ? o.text : ''}${o?.then ? `. ${o.then}` : ''}.`,
    );
  }
  // Nearest exit.
  let exit: { dx: number; dy: number } | null = null;
  let best = Infinity;
  for (let i = 0; i < s.tiles.length; i++) {
    if (!rules.tiles.get(s.tiles[i]!).goal) continue;
    const dx = (i % s.width) - s.player.x;
    const dy = Math.floor(i / s.width) - s.player.y;
    if (Math.abs(dx) + Math.abs(dy) < best) {
      best = Math.abs(dx) + Math.abs(dy);
      exit = { dx, dy };
    }
  }
  if (exit) lines.push(t('Exit: {where}.', { where: offset(exit.dx, exit.dy) }));
  // Enemies, nearest first.
  const enemies = [...s.enemies]
    .map((e) => ({ e, d: Math.abs(e.x - s.player.x) + Math.abs(e.y - s.player.y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 4);
  for (const { e } of enemies) {
    const def = rules.enemies.get(e.kind);
    const where = offset(e.x - s.player.x, e.y - s.player.y);
    const vars = { name: t(def.name), hp: e.hp, where };
    lines.push(
      e.effects.length
        ? t('{name}, {hp} HP, frozen: {where}.', vars)
        : t('{name}, {hp} HP: {where}.', vars),
    );
  }
  if (s.enemies.length > enemies.length)
    lines.push(t('{n} more enemies.', { n: s.enemies.length - enemies.length }));
  return lines.join(' ');
}

/** One short line after a move: what happened, then enemy hits, then HP. */
export function describeTurn(before: GameState, after: GameState, outcome: Outcome): string {
  const parts = [outcome.text];
  if (outcome.then) parts.push(outcome.then);
  if (after.status === 'won') parts.push(t('Level complete'));
  else if (after.status === 'lost') parts.push(t('Knocked out. Undo or retry'));
  else if (after.player.hp !== before.player.hp)
    parts.push(t('HP {hp} of {max}', { hp: after.player.hp, max: after.player.maxHp }));
  return parts.join('. ') + '.';
}
