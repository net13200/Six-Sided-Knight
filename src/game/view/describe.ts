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

const DIR_WORD: Record<Dir, string> = { N: 'Up', E: 'Right', S: 'Down', W: 'Left' };

/** "2 up, 3 right" style offset from the die. */
function offset(dx: number, dy: number): string {
  const parts: string[] = [];
  if (dy) parts.push(`${Math.abs(dy)} ${dy < 0 ? 'up' : 'down'}`);
  if (dx) parts.push(`${Math.abs(dx)} ${dx < 0 ? 'left' : 'right'}`);
  return parts.join(', ') || 'here';
}

export function describeBoard(
  rules: Rules,
  s: GameState,
  outcomes: ReadonlyArray<readonly [Dir, Outcome]>,
): string {
  const die = s.player.die;
  const lines: string[] = [
    `HP ${s.player.hp} of ${s.player.maxHp}. Move ${s.stats.moves}.`,
    `Top face ${topFace(die)}, bottom ${bottomFace(die) ?? 'none'}.`,
  ];
  for (const dir of DIRS) {
    const o = outcomes.find(([d]) => d === dir)?.[1];
    lines.push(
      `${DIR_WORD[dir]}: ${leadingFace(die, dir)} leads. ${o ? o.text : ''}${o?.then ? `. ${o.then}` : ''}.`,
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
  if (exit) lines.push(`Exit: ${offset(exit.dx, exit.dy)}.`);
  // Enemies, nearest first.
  const enemies = [...s.enemies]
    .map((e) => ({ e, d: Math.abs(e.x - s.player.x) + Math.abs(e.y - s.player.y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 4);
  for (const { e } of enemies) {
    const def = rules.enemies.get(e.kind);
    const frozen = e.effects.length ? ', frozen' : '';
    lines.push(`${def.name}, ${e.hp} HP${frozen}: ${offset(e.x - s.player.x, e.y - s.player.y)}.`);
  }
  if (s.enemies.length > enemies.length)
    lines.push(`${s.enemies.length - enemies.length} more enemies.`);
  return lines.join(' ');
}

/** One short line after a move: what happened, then enemy hits, then HP. */
export function describeTurn(before: GameState, after: GameState, outcome: Outcome): string {
  const parts = [outcome.text];
  if (outcome.then) parts.push(outcome.then);
  if (after.status === 'won') parts.push('Level complete');
  else if (after.status === 'lost') parts.push('Knocked out. Undo or retry');
  else if (after.player.hp !== before.player.hp)
    parts.push(`HP ${after.player.hp} of ${after.player.maxHp}`);
  return parts.join('. ') + '.';
}
