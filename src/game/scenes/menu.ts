/** Title screen. "Play" continues where the player left off in one tap. */
import type { Game } from '../game';
import type { Command } from '../input';
import { el, icon, place } from '../ui';
import { drawBadge, drawDieBody, drawFace } from '../view/art';
import { C } from '../view/palette';
import { muteButton } from './common';
import type { Scene } from './scene';

export class MenuScene implements Scene {
  readonly name = 'menu';
  private t = 0;

  constructor(private readonly game: Game) {}

  enter(ui: HTMLElement): void {
    const next = this.game.continueIndex();
    const started = this.game.best.size > 0;
    const playBtn = el(
      'button',
      {
        className: 'btn primary',
        testId: 'play',
        onClick: () => this.game.goPlay(this.game.continueIndex()),
      },
      [icon('play'), el('span', { text: started ? `Continue: level ${next + 1}` : 'Play' })],
    );
    const levelsBtn = el('button', {
      className: 'btn',
      testId: 'levels',
      text: 'Levels',
      onClick: () => this.game.goLevels(),
    });
    ui.append(place(playBtn, 60, 300, 220, 56), place(levelsBtn, 60, 366, 220, 48));
    ui.append(place(muteButton(this.game), 272, 415, 64, 62));
  }

  command(cmd: Command): void {
    if (cmd.type === 'confirm') this.game.goPlay(this.game.continueIndex());
  }

  update(dt: number): void {
    this.t += dt;
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.text;
    ctx.font = '800 34px system-ui, sans-serif';
    ctx.fillText('Six Sided', 170, 70);
    ctx.fillStyle = C.gold;
    ctx.fillText('Knight', 170, 108);
    ctx.fillStyle = C.textDim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('You are the die. Every side is a tool.', 170, 140);

    // A gently bobbing hero die with its faces around it.
    const bob = this.game.reducedMotion ? 0 : Math.sin(this.t * 2) * 4;
    const cx = 170;
    const cy = 215 + bob;
    drawDieBody(ctx, cx, cy, 64, 64);
    drawFace(ctx, 'Shield', cx, cy - 2, 40);
    const around: Array<[string, number, number]> = [
      ['Bomb', 0, -1],
      ['Sword', 1, 0],
      ['Key', 0, 1],
      ['Coin', -1, 0],
    ];
    for (const [face, dx, dy] of around) drawBadge(ctx, face, cx + dx * 52, cy + dy * 52, 13);
  }
}
