/**
 * What a move would do, computed by running the real rules on a copy of the
 * state (the simulation is pure, so this is free of side effects). Used for
 * the labels next to the die and the roll preview in the inspect view.
 */
import {
  DIR_DELTA,
  step,
  type Dir,
  type GameEvent,
  type GameState,
  type Rules,
} from '../../engine';
import { drawFace } from './art';
import { C, displayPrefs } from './palette';

export type OutcomeKind =
  | 'kill'
  | 'hit'
  | 'clunk'
  | 'freeze'
  | 'pull'
  | 'open'
  | 'unlock'
  | 'hurt'
  | 'heal'
  | 'win'
  | 'blocked'
  | 'slide'
  | 'move';

export interface Chip {
  readonly label: string;
  readonly color: string;
  readonly icon?: 'skull' | 'check' | 'heart';
}

export interface Outcome {
  readonly kind: OutcomeKind;
  /** Small label next to the die, or null to keep the board calm (plain moves, walls). */
  readonly chip: Chip | null;
  /** One-line description for the preview panel. */
  readonly text: string;
  /** What enemies do afterwards, if they hurt you (e.g. "Then the Skeleton hits you: -1 HP"). */
  readonly then: string | null;
  /** State after the move (unchanged for a blocked move). */
  readonly after: GameState;
}

const OWN = (e: GameEvent) =>
  e.type !== 'enemyMoved' && e.type !== 'enemyAttacked' && e.type !== 'enemyWaited';

const FROST = '#9fe0ff';

export function predictOutcome(rules: Rules, s: GameState, dir: Dir): Outcome {
  const r = step(rules, s, { type: 'move', dir });
  const tx = s.player.x + DIR_DELTA[dir].dx;
  const ty = s.player.y + DIR_DELTA[dir].dy;
  if (!r.consumed) {
    const tileId =
      tx >= 0 && ty >= 0 && tx < s.width && ty < s.height ? s.tiles[ty * s.width + tx] : null;
    const def = tileId ? rules.tiles.get(tileId) : null;
    // Only doors/chests (tiles that react to a face) get a ✕: walls are obvious.
    const needsFace = def?.onLeadInto !== undefined;
    return {
      kind: 'blocked',
      chip: needsFace ? { label: '✕', color: C.textDim } : null,
      text: needsFace ? `${def!.name}: this face won't open it` : 'Blocked by a wall',
      then: 'No turn used',
      after: s,
    };
  }
  const own = r.events.filter(OWN);
  const then = retaliation(rules, s, r.events);
  const base = { then, after: r.state };

  const killed = own.filter((e) => e.type === 'killed');
  if (killed[0]?.type === 'killed') {
    // A Bomb's splash can knock out the neighbours too: count them all.
    const name = rules.enemies.get(killed[0].kind).name;
    const n = killed.length;
    return {
      ...base,
      kind: 'kill',
      chip: { label: n > 1 ? `KO×${n}` : 'KO', color: C.hurt, icon: 'skull' },
      text: n > 1 ? `Knocks out ${n} enemies at once` : `Knocks out the ${name}`,
    };
  }
  const effect = own.find((e) => e.type === 'effectApplied');
  if (effect?.type === 'effectApplied') {
    const target = s.enemies.find((e) => e.id === effect.enemyId);
    const name = target ? rules.enemies.get(target.kind).name : 'enemy';
    const what = rules.effects.get(effect.effect).name.toLowerCase();
    return {
      ...base,
      kind: 'freeze',
      chip: { label: `${what.slice(0, 6)} ${effect.turns}`, color: FROST },
      text: `The ${name} is ${what} for ${effect.turns} turns`,
    };
  }
  const pulled = own.find((e) => e.type === 'pulled');
  if (pulled?.type === 'pulled') {
    const target = s.enemies.find((e) => e.id === pulled.enemyId);
    const gold = own.find((e) => e.type === 'gold');
    return {
      ...base,
      kind: 'pull',
      chip: {
        label: target ? 'pull' : `+${gold?.type === 'gold' ? gold.amount : 0}`,
        color: target ? C.textDim : C.gold,
      },
      text: target
        ? `Pulls the ${rules.enemies.get(target.kind).name} next to you`
        : 'Hooks the gem from afar',
    };
  }
  const hit = own.find((e) => e.type === 'attacked' && !e.splash);
  if (hit?.type === 'attacked') {
    const target = s.enemies.find((e) => e.id === hit.target);
    const name = target ? rules.enemies.get(target.kind).name : 'enemy';
    return hit.damage > 0
      ? {
          ...base,
          kind: 'hit',
          chip: { label: `-${hit.damage}`, color: '#ff9d3a' },
          text: `Hits the ${name} for ${hit.damage}`,
        }
      : {
          ...base,
          kind: 'clunk',
          chip: { label: '0', color: C.textDim },
          text:
            target && rules.enemies.get(target.kind).modifyDamage
              ? `The ${name} shrugs it off: no damage`
              : `Bumps the ${name}: no damage`,
        };
  }
  if (own.some((e) => e.type === 'won')) {
    return {
      ...base,
      kind: 'win',
      chip: { label: 'exit', color: C.gold },
      text: 'Reaches the exit!',
    };
  }
  const gold = own
    .filter((e) => e.type === 'gold')
    .reduce((sum, e) => sum + (e.type === 'gold' ? e.amount : 0), 0);
  if (own.some((e) => e.type === 'opened')) {
    return {
      ...base,
      kind: 'open',
      chip: { label: `+${gold}`, color: C.gold, icon: 'check' },
      text: `Opens the chest: +${gold} gold`,
    };
  }
  if (own.some((e) => e.type === 'unlocked')) {
    return {
      ...base,
      kind: 'unlock',
      chip: { label: 'open', color: C.heal, icon: 'check' },
      text: 'Unlocks the door',
    };
  }
  const hurt = own.find((e) => e.type === 'hurt' && e.source.kind === 'tile');
  if (hurt?.type === 'hurt' && hurt.source.kind === 'tile') {
    const name = rules.tiles.get(hurt.source.tile).name;
    return {
      ...base,
      kind: 'hurt',
      chip: { label: `-${hurt.amount}`, color: C.hurt, icon: 'heart' },
      text: `${name}: -${hurt.amount} HP`,
    };
  }
  const heal = own.find((e) => e.type === 'healed');
  if (heal?.type === 'healed') {
    return {
      ...base,
      kind: 'heal',
      chip: { label: `+${heal.amount}`, color: C.heal, icon: 'heart' },
      text: `Heals +${heal.amount} HP`,
    };
  }
  const slides = own.filter((e) => e.type === 'slid').length;
  if (slides > 0) {
    return {
      ...base,
      kind: 'slide',
      chip: { label: `slide ${slides + 1}`, color: FROST },
      text: `Slides ${slides + 1} tiles on the ice${gold > 0 ? `, +${gold} gold` : ''}`,
    };
  }
  return {
    ...base,
    kind: 'move',
    chip: null,
    text: gold > 0 ? `Picks up +${gold} gold` : 'Rolls to the next tile',
  };
}

/** Summarizes enemy hits that follow the move, if any. */
function retaliation(rules: Rules, s: GameState, events: readonly GameEvent[]): string | null {
  let dmg = 0;
  let who = '';
  for (const e of events) {
    if (e.type === 'enemyAttacked' && e.damage > 0) {
      dmg += e.damage;
      const enemy = s.enemies.find((x) => x.id === e.enemyId);
      who = enemy ? rules.enemies.get(enemy.kind).name : 'An enemy';
    }
  }
  if (dmg === 0) return null;
  return `Then the ${who} hits you: -${dmg} HP`;
}

/** Draws outcome labels on the far edge of each neighbouring tile. */
export function drawOutcomeChips(
  ctx: CanvasRenderingContext2D,
  outcomes: ReadonlyArray<readonly [Dir, Outcome]>,
  cx: number,
  cy: number,
): void {
  // Labels sit at the far edge of the tile the move goes to, so they never
  // cover the die or what's on that tile. Larger labels setting: 1.35x.
  const k = (displayPrefs.largeLabels ? 1.35 : 1) * 1.25;
  for (const [dir, o] of outcomes) {
    const chip = o.chip;
    if (!chip) continue;
    const { dx, dy } = DIR_DELTA[dir];
    const x = cx + dx * 54;
    const y = cy + dy * 54;
    ctx.font = `bold ${8 * k}px system-ui, sans-serif`;
    const w = Math.max(14 * k, ctx.measureText(chip.label).width + (chip.icon ? 15 : 8) * k);
    const h = 12 * k;
    ctx.save();
    ctx.globalAlpha = k > 1 || displayPrefs.highContrast ? 1 : 0.9;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fillStyle = '#0c0a12';
    ctx.fill();
    ctx.strokeStyle = chip.color;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
    let tx = x;
    if (chip.icon) {
      const ix = x - w / 2 + 7 * k;
      drawChipIcon(ctx, chip, ix, y);
      tx = x + 3.5 * k;
    }
    ctx.fillStyle = chip.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(chip.label, tx, y + 0.5);
  }
}

function drawChipIcon(ctx: CanvasRenderingContext2D, chip: Chip, x: number, y: number): void {
  if (chip.icon === 'heart') {
    drawFace(ctx, 'Heart', x, y, 7.5);
  } else if (chip.icon === 'check') {
    ctx.strokeStyle = chip.color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(x - 3.5, y);
    ctx.lineTo(x - 1, y + 2.5);
    ctx.lineTo(x + 3.5, y - 2.5);
    ctx.stroke();
  } else if (chip.icon === 'skull') {
    ctx.fillStyle = C.skeleton;
    ctx.beginPath();
    ctx.arc(x, y - 1, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 2, y + 1, 4, 2.5);
    ctx.fillStyle = '#231d2b';
    ctx.fillRect(x - 2, y - 2, 1.5, 1.5);
    ctx.fillRect(x + 0.5, y - 2, 1.5, 1.5);
  }
}
