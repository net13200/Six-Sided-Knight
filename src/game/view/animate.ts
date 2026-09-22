/**
 * Turns one turn's event list into animations, particles and sounds. This is
 * the only place that knows how events look and sound; the state is already
 * final, and these effects just play on top of it.
 */
import { DIR_DELTA, type Dir, type GameEvent, type GameState, type Pos } from '../../engine';
import type { Audio, SfxName } from '../audio';
import { ease, type Fx } from './fx';
import { TILE, tileCenter } from './layout';
import { C } from './palette';

const ROLL = 0.13;
const LUNGE = 0.11;
const ENEMY_MOVE = 0.12;
const DEATH = 0.25;

const ENEMY_EVENTS = new Set<GameEvent['type']>(['enemyMoved', 'enemyAttacked', 'enemyWaited']);

export function animateTurn(
  fx: Fx,
  audio: Audio,
  events: readonly GameEvent[],
  before: GameState,
  after: GameState,
): void {
  const final = { x: after.player.x, y: after.player.y };
  let cur: Pos = { x: before.player.x, y: before.player.y };
  let orient = before.player.die.orient;
  let t = 0; // player-phase cursor
  let enemyStart = -1; // enemy-phase start, once reached
  const sfx = (name: SfxName, at: number) => fx.at(at, () => audio.play(name));
  const at = (delay: number, fn: () => void) => fx.at(delay, fn);
  const phaseTime = () => (enemyStart >= 0 ? enemyStart : t);

  for (const e of events) {
    if (ENEMY_EVENTS.has(e.type) && enemyStart < 0) enemyStart = t;

    switch (e.type) {
      case 'moved': {
        const from = e.from;
        const to = e.to;
        const startOrient = orient;
        const horizontal = e.dir === 'E' || e.dir === 'W';
        fx.tween(
          t,
          ROLL,
          (p, v) => {
            const k = ease.inOut(p);
            v.player.dx = (from.x + (to.x - from.x) * k - final.x) * TILE;
            v.player.dy = (from.y + (to.y - from.y) * k - final.y) * TILE;
            const squash = 1 - 0.28 * ease.bump(p);
            v.player.sx = horizontal ? squash : 1;
            v.player.sy = horizontal ? 1 : squash;
            v.player.orient = p < 0.5 ? startOrient : p < 1 ? e.orient : null;
          },
          true,
        );
        sfx('roll', t);
        t += ROLL;
        cur = to;
        orient = e.orient;
        break;
      }
      case 'bumped':
        // Handled by animateBump (bumps never reach a consumed turn).
        break;
      case 'attacked': {
        const c = tileCenter(e.at.x, e.at.y);
        const when = e.splash ? t - LUNGE / 2 : t;
        if (!e.splash) lunge(fx, cur, final, e.at, t, 'player');
        fx.tween(when, 0.22, (p, v) => (fx.enemyVisual(v, e.target).flash = 1 - p));
        at(when, () => {
          fx.float(
            c.x,
            c.y - 10,
            e.damage > 0 ? `-${e.damage}` : '0',
            e.damage > 0 ? C.hurt : C.textDim,
          );
          if (e.damage > 0) {
            fx.burst(c.x, c.y, '#ffffff', 6, 50);
            fx.shake(e.splash ? 1.5 : 2.5);
          }
        });
        if (!e.splash) sfx(e.damage > 0 ? 'hit' : 'clunk', t);
        if (!e.splash) t += LUNGE;
        break;
      }
      case 'killed': {
        const enemy = before.enemies.find((x) => x.id === e.enemyId);
        const c = tileCenter(e.at.x, e.at.y);
        if (enemy) fx.ghost(enemy, c.x, c.y, t, DEATH);
        at(t, () => fx.burst(c.x, c.y, enemy?.kind === 'slime' ? C.slime : C.skeleton, 14, 80));
        sfx('kill', t);
        break;
      }
      case 'gold': {
        const c = tileCenter(cur.x, cur.y);
        at(t, () => fx.float(c.x + 10, c.y - 18, `+${e.amount}`, C.gold));
        sfx('gold', t);
        break;
      }
      case 'tileChanged':
        // Keep drawing the old tile until the die gets there.
        fx.tileGhost(e.at.x, e.at.y, e.from, t);
        break;
      case 'unlocked':
      case 'opened': {
        const c = tileCenter(e.at.x, e.at.y);
        at(t, () => fx.burst(c.x, c.y, e.type === 'opened' ? C.gold : C.door, 12, 70));
        sfx('unlock', t);
        break;
      }
      case 'healed': {
        const c = tileCenter(cur.x, cur.y);
        at(t, () => {
          fx.float(c.x, c.y - 18, `+${e.amount}`, C.heal);
          fx.burst(c.x, c.y, C.heal, 12, 50);
        });
        sfx('heal', t);
        break;
      }
      case 'hurt': {
        const when = phaseTime();
        const c = tileCenter(cur.x, cur.y);
        fx.tween(when, 0.3, (p, v) => (v.player.flash = 1 - p));
        at(when, () => {
          fx.float(c.x, c.y - 18, `-${e.amount}`, C.hurt);
          fx.shake(4);
          fx.flash(C.hurt, 0.18);
        });
        sfx('hurt', when);
        break;
      }
      case 'enemyMoved': {
        const { from, to } = e;
        fx.tween(
          enemyStart,
          ENEMY_MOVE,
          (p, v) => {
            const ev = fx.enemyVisual(v, e.enemyId);
            const k = ease.out(p);
            ev.dx = (from.x + (to.x - from.x) * k - to.x) * TILE;
            ev.dy = (from.y + (to.y - from.y) * k - to.y) * TILE;
          },
          true,
        );
        break;
      }
      case 'enemyAttacked': {
        lunge(fx, e.from, e.from, cur, enemyStart, e.enemyId);
        if (e.blocked) {
          const c = tileCenter(cur.x, cur.y);
          at(enemyStart, () => {
            fx.float(c.x, c.y - 18, 'block', C.block);
            fx.burst(c.x, c.y - 10, C.block, 8, 40);
          });
          sfx('block', enemyStart);
        }
        break;
      }
      case 'enemyWaited':
        fx.tween(enemyStart, 0.2, (p, v) => {
          const ev = fx.enemyVisual(v, e.enemyId);
          ev.sy = 1 - 0.12 * ease.bump(p);
          ev.sx = 1 + 0.08 * ease.bump(p);
        });
        break;
      case 'won': {
        const c = tileCenter(final.x, final.y);
        at(t, () => {
          for (const color of [C.gold, C.heal, C.block, C.heart])
            fx.burst(c.x, c.y, color, 10, 110);
        });
        sfx('win', t);
        break;
      }
      case 'lost':
        sfx('lose', phaseTime() + 0.1);
        break;
      default:
        break;
    }
  }
}

/** A quick jab toward `target` and back, relative to where the attacker ends up. */
function lunge(
  fx: Fx,
  from: Pos,
  final: Pos,
  target: Pos,
  start: number,
  who: 'player' | number,
): void {
  const dx = Math.sign(target.x - from.x);
  const dy = Math.sign(target.y - from.y);
  fx.tween(start, LUNGE, (p, v) => {
    const k = ease.bump(p) * 9;
    const vis = who === 'player' ? v.player : fx.enemyVisual(v, who);
    vis.dx = (from.x - final.x) * TILE + dx * k;
    vis.dy = (from.y - final.y) * TILE + dy * k;
  });
}

/** Feedback for a move that did nothing (wall, locked door, wrong face on a chest). */
export function animateBump(fx: Fx, audio: Audio, dir: Dir): void {
  const { dx, dy } = DIR_DELTA[dir];
  fx.tween(0, 0.12, (p, v) => {
    v.player.dx = dx * ease.bump(p) * 4;
    v.player.dy = dy * ease.bump(p) * 4;
  });
  audio.play('bump');
}
