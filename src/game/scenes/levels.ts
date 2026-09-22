/** Level select (a simple world map until milestone 3). */
import type { Game } from '../game';
import type { Command } from '../input';
import { el, iconButton, place } from '../ui';
import { C } from '../view/palette';
import type { Scene } from './scene';

export class LevelsScene implements Scene {
  readonly name = 'levels';

  constructor(private readonly game: Game) {}

  enter(ui: HTMLElement): void {
    const cols = 4;
    const size = 66;
    const gap = 10;
    const x0 = (340 - (cols * size + (cols - 1) * gap)) / 2;
    this.game.levels.forEach((level, i) => {
      const stars = this.game.best.get(level.id);
      const b = el(
        'button',
        {
          className: `level-btn${stars !== undefined ? ' done' : ''}`,
          testId: `level-${i + 1}`,
          label: `Level ${i + 1}: ${level.name}${stars !== undefined ? `, ${stars} stars` : ''}`,
          onClick: () => this.game.goPlay(i),
        },
        [
          el('strong', { text: String(i + 1) }),
          el('span', {
            className: 'stars',
            text: stars !== undefined ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '',
          }),
        ],
      );
      place(
        b,
        x0 + (i % cols) * (size + gap),
        80 + Math.floor(i / cols) * (size + gap),
        size,
        size,
      );
      ui.append(b);
    });
    ui.append(
      place(
        iconButton('back', 'Menu', () => this.game.goMenu(), 'back'),
        4,
        415,
        64,
        62,
      ),
    );
  }

  command(cmd: Command): void {
    if (cmd.type === 'back') this.game.goMenu();
    if (cmd.type === 'confirm') this.game.goPlay(this.game.continueIndex());
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.text;
    ctx.font = '800 22px system-ui, sans-serif';
    ctx.fillText('Chapter 1', 170, 36);
    ctx.fillStyle = C.textDim;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('First Steps', 170, 58);
  }
}
