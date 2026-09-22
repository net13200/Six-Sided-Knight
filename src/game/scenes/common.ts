import type { Game } from '../game';
import { icon } from '../ui';

/** A sound toggle that keeps its icon in sync with the setting. */
export function muteButton(game: Game): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-btn';
  b.dataset.testid = 'mute';
  const label = document.createElement('span');
  const sync = () => {
    b.replaceChildren(icon(game.muted ? 'muted' : 'sound'), label);
    label.textContent = game.muted ? 'Muted' : 'Sound';
    b.setAttribute('aria-label', game.muted ? 'Unmute sound' : 'Mute sound');
    b.setAttribute('aria-pressed', String(game.muted));
  };
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    game.toggleMute();
  });
  game.stage.root.addEventListener('ssk:mute', sync);
  sync();
  return b;
}

export function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  filled: boolean,
): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? '#ffd75e' : 'rgba(255,255,255,0.08)';
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.12);
  ctx.strokeStyle = filled ? '#8a6414' : 'rgba(255,255,255,0.25)';
  ctx.stroke();
}
