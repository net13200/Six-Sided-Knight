/**
 * Input: swipes, taps and keys become game commands. The gesture maths is
 * kept in pure functions so it can be unit tested.
 */
import type { Dir } from '../engine';

export type Command =
  | { type: 'move'; dir: Dir; swipe?: boolean }
  | { type: 'tap'; x: number; y: number } // logical coordinates
  | { type: 'undo' }
  | { type: 'retry' }
  | { type: 'mute' }
  | { type: 'back' }
  | { type: 'confirm' }
  | { type: 'inspect' }
  | { type: 'describe' }
  | { type: 'watch' }
  /** The secret combo (Shift+P, or 5 quick taps on the title): watch the best solution. */
  | { type: 'solution' };

/** Minimum travel (in CSS pixels) for a pointer gesture to count as a swipe. */
export const SWIPE_THRESHOLD = 24;

/** Direction along the dominant axis, or null for a tap-sized movement. */
export function swipeDirection(dx: number, dy: number, threshold = SWIPE_THRESHOLD): Dir | null {
  if (Math.hypot(dx, dy) < threshold) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'E' : 'W';
  return dy > 0 ? 'S' : 'N';
}

/** Direction from the die's tile toward a tapped tile (dominant axis), or null for the die itself. */
export function tapDirection(
  from: { x: number; y: number },
  to: { x: number; y: number },
): Dir | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'E' : 'W';
  return dy > 0 ? 'S' : 'N';
}

const KEYS: Record<string, Command> = {
  ArrowUp: { type: 'move', dir: 'N' },
  ArrowDown: { type: 'move', dir: 'S' },
  ArrowLeft: { type: 'move', dir: 'W' },
  ArrowRight: { type: 'move', dir: 'E' },
  w: { type: 'move', dir: 'N' },
  s: { type: 'move', dir: 'S' },
  a: { type: 'move', dir: 'W' },
  d: { type: 'move', dir: 'E' },
  z: { type: 'undo' },
  u: { type: 'undo' },
  Backspace: { type: 'undo' },
  r: { type: 'retry' },
  m: { type: 'mute' },
  i: { type: 'inspect' },
  h: { type: 'describe' },
  '?': { type: 'describe' },
  p: { type: 'watch' },
  P: { type: 'solution' }, // Shift+P: the secret combo
  Escape: { type: 'back' },
  Enter: { type: 'confirm' },
};

/**
 * WASD by where the keys are, not what they say: on an AZERTY keyboard the
 * same four keys read Z, Q, S, D (and Z is still Undo on QWERTY).
 */
const CODE_MOVES: Readonly<Record<string, Command>> = {
  KeyW: { type: 'move', dir: 'N' },
  KeyS: { type: 'move', dir: 'S' },
  KeyA: { type: 'move', dir: 'W' },
  KeyD: { type: 'move', dir: 'E' },
};

/**
 * The command for a key press. With `code` (the physical key), the WASD
 * moves follow key positions; a letter W, A, S or D elsewhere does nothing.
 */
export function keyCommand(key: string, code?: string): Command | null {
  if (code !== undefined) {
    const move = CODE_MOVES[code];
    if (move) return move;
    if (/^[wasd]$/i.test(key)) return null;
  }
  return KEYS[key] ?? KEYS[key.toLowerCase()] ?? null;
}

export interface InputTarget {
  /** Element that receives board gestures (the canvas). */
  readonly surface: HTMLElement;
  toLogical(clientX: number, clientY: number): { x: number; y: number };
}

/** Wires DOM events to a command callback. Returns a function that removes the listeners. */
export function bindInput(
  target: InputTarget,
  onCommand: (cmd: Command) => void,
  onGesture: () => void,
  opts: { escape?: boolean } = {},
): () => void {
  let start: { id: number; x: number; y: number } | null = null;

  const down = (e: PointerEvent) => {
    onGesture();
    if (start) return;
    start = { id: e.pointerId, x: e.clientX, y: e.clientY };
    target.surface.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const up = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id) return;
    const dir = swipeDirection(e.clientX - start.x, e.clientY - start.y);
    if (dir) {
      onCommand({ type: 'move', dir, swipe: true });
    } else {
      const p = target.toLogical(start.x, start.y);
      onCommand({ type: 'tap', x: p.x, y: p.y });
    }
    start = null;
  };
  const cancel = () => {
    start = null;
  };
  const key = (e: KeyboardEvent) => {
    onGesture();
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Let buttons handle their own Enter/Space.
    if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof HTMLButtonElement) return;
    // Portals: Escape only leaves fullscreen there (the Menu button goes back).
    if (e.key === 'Escape' && opts.escape === false) return;
    const cmd = keyCommand(e.key, e.code);
    if (cmd) {
      e.preventDefault();
      onCommand(cmd);
    }
  };

  target.surface.addEventListener('pointerdown', down);
  target.surface.addEventListener('pointerup', up);
  target.surface.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', key);
  return () => {
    target.surface.removeEventListener('pointerdown', down);
    target.surface.removeEventListener('pointerup', up);
    target.surface.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', key);
  };
}
