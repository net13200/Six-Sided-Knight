/** Depths hub: personal best and start / continue / surface. */
import type { Game } from '../game';
import type { Command } from '../input';
import { Run } from '../runs';
import { el, icon, iconButton, place } from '../ui';
import { drawDieBody, drawFace } from '../view/art';
import { C } from '../view/palette';
import type { Scene } from './scene';

export class DepthsScene implements Scene {
  readonly name = 'depths';
  private busy = false;

  constructor(private readonly game: Game) {}

  enter(ui: HTMLElement): void {
    this.game.analytics.track('mode_selected', { mode: 'depths' });
    const progress = this.game.save.data.depths.inProgress;
    const primary = el('button', { className: 'btn primary', testId: 'depths-start' }, [
      icon('play'),
      el('span', { text: progress ? `Continue floor ${progress.floor}` : 'Descend' }),
    ]);
    primary.addEventListener('click', () => {
      if (this.busy) return;
      let run: Run;
      if (progress) {
        run = new Run(this.game, 'depths', progress);
      } else {
        const seed = (this.game.platform.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
        run = Run.newDepths(this.game, seed);
        this.game.save.update((d) => d.depths.runs++);
      }
      this.busy = true;
      primary.disabled = true;
      primary.replaceChildren(el('span', { text: 'Carving the dungeon…' }));
      void run.play();
    });
    ui.append(place(primary, 50, 318, 240, 58));

    if (progress) {
      let armed = false;
      const surface = el('button', {
        className: 'btn',
        testId: 'depths-surface',
        text: 'End this run',
      });
      surface.addEventListener('click', () => {
        if (!armed) {
          armed = true;
          surface.textContent = `Tap again to end at floor ${progress.floor}`;
          return;
        }
        new Run(this.game, 'depths', progress).abandon();
        this.game.goDepths();
      });
      ui.append(place(surface, 72, 386, 196, 46));
    }
    ui.append(
      place(
        iconButton('back', 'Menu', () => this.game.goMenu(), 'back'),
        4,
        415,
        64,
        62,
      ),
      place(
        iconButton(
          'die',
          'Your die',
          () => this.game.goForge(() => this.game.goDepths()),
          'your-die',
        ),
        272,
        415,
        64,
        62,
      ),
    );
  }

  command(cmd: Command): void {
    if (cmd.type === 'back') this.game.goMenu();
  }

  render(ctx: CanvasRenderingContext2D): void {
    const depths = this.game.save.data.depths;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.text;
    ctx.font = '800 28px system-ui, sans-serif';
    ctx.fillText('The Depths', 170, 52);
    ctx.fillStyle = C.textDim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('Endless floors. Each one a little harder.', 170, 80);

    // Stairs descending into the dark.
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(226,182,80,${0.8 - i * 0.15})`;
      ctx.fillRect(110 + i * 10, 118 + i * 16, 120 - i * 20, 8);
    }
    drawDieBody(ctx, 170, 110, 30, 30);
    drawFace(ctx, 'Shield', 170, 109, 18);

    ctx.fillStyle = C.text;
    ctx.font = '800 30px system-ui, sans-serif';
    ctx.fillText(String(depths.bestFloor), 170, 232);
    ctx.fillStyle = C.textDim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`deepest floor cleared · ${depths.runs} runs`, 170, 258);
    ctx.fillStyle = C.text;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('HP carries over · +1 HP per floor', 170, 290);
  }
}
