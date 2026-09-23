/** ASCII rendering of a state, for the CLI, tests and debugging. */
import { describeDie } from './dice';
import { PLAYER_GLYPH } from './level';
import type { Rules } from './registry';
import type { GameEvent, GameState } from './types';

export function renderText(rules: Rules, state: GameState): string {
  const rows: string[] = [];
  for (let y = 0; y < state.height; y++) {
    let row = '';
    for (let x = 0; x < state.width; x++) {
      const enemy = state.enemies.find((e) => e.x === x && e.y === y);
      if (state.player.x === x && state.player.y === y) row += PLAYER_GLYPH;
      else if (enemy) row += rules.enemies.get(enemy.kind).glyph;
      else row += rules.tiles.get(state.tiles[y * state.width + x]!).glyph;
    }
    rows.push(row);
  }
  const die = describeDie(state.player.die);
  const dieText = Object.entries(die)
    .map(([slot, face]) => `${slot}=${face}`)
    .join(' ');
  const enemies = state.enemies.map((e) => `${e.kind}#${e.id}@${e.x},${e.y} hp${e.hp}`).join('; ');
  return [
    ...rows,
    `turn ${state.turn}  moves ${state.stats.moves}  hp ${state.player.hp}/${state.player.maxHp}  gold ${state.gold}  ${state.status}`,
    `die: ${dieText}`,
    ...(enemies ? [`enemies: ${enemies}`] : []),
  ].join('\n');
}

export function describeEvent(e: GameEvent): string {
  switch (e.type) {
    case 'moved':
      return `rolled ${e.dir} to ${e.to.x},${e.to.y}`;
    case 'slid':
      return `slid ${e.dir} to ${e.to.x},${e.to.y}`;
    case 'pulled':
      return `pulled ${e.enemyId !== undefined ? `enemy #${e.enemyId}` : 'item'} from ${e.from.x},${e.from.y} to ${e.to.x},${e.to.y}`;
    case 'bumped':
      return `bumped ${e.reason} (no turn)`;
    case 'attacked':
      return `${e.face} hits #${e.target} for ${e.damage}${e.splash ? ' (splash)' : ''}`;
    case 'enemyAttacked':
      return `enemy #${e.enemyId} attacks for ${e.damage}${e.blocked ? ' (blocked)' : ''}`;
    case 'enemyMoved':
      return `enemy #${e.enemyId} moves to ${e.to.x},${e.to.y}`;
    case 'enemyWaited':
      return `enemy #${e.enemyId} waits`;
    case 'killed':
      return `${e.kind} #${e.enemyId} dies`;
    case 'hurt':
      return `player hurt ${e.amount} by ${e.source.kind} (hp ${e.hp})`;
    case 'healed':
      return `player healed ${e.amount} (hp ${e.hp})`;
    case 'gold':
      return `+${e.amount} gold from ${e.reason} (total ${e.total})`;
    case 'unlocked':
      return `door unlocked at ${e.at.x},${e.at.y}`;
    case 'opened':
      return `chest opened at ${e.at.x},${e.at.y}`;
    case 'tileChanged':
      return `${e.from} -> ${e.to} at ${e.at.x},${e.at.y}`;
    case 'effectApplied':
      return `enemy #${e.enemyId} gets ${e.effect} for ${e.turns}`;
    case 'turnEnd':
      return `-- end of turn ${e.turn}`;
    case 'won':
      return `WON in ${e.moves} moves`;
    case 'lost':
      return `LOST on turn ${e.turn}`;
  }
}
