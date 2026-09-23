/** Level complete. "Next level" is always the primary action. */
import type { GameState } from '../../engine';
import type { Game, WinSummary } from '../game';
import type { Command } from '../input';
import { el, icon, iconButton, place } from '../ui';
import { drawCrownGain } from '../view/art';
import { C } from '../view/palette';
import { drawStar } from './common';
import type { Scene } from './scene';

export class ResultsScene implements Scene {
  readonly name = 'results';
  private t = 0;

  constructor(
    private readonly game: Game,
    private readonly index: number,
    private readonly state: GameState,
    private readonly summary: WinSummary,
  ) {}

  private get hasNext(): boolean {
    return this.index + 1 < this.game.levels.length;
  }

  enter(ui: HTMLElement): void {
    const primary = el(
      'button',
      { className: 'btn primary', testId: 'next', onClick: () => this.next() },
      this.hasNext
        ? [el('span', { text: 'Next level' }), icon('next')]
        : [el('span', { text: 'Back to the map' })],
    );
    ui.append(
      place(primary, 50, 330, 240, 58),
      place(
        iconButton('retry', 'Retry', () => this.game.goPlay(this.index), 'results-retry'),
        70,
        404,
        90,
        62,
      ),
      place(
        iconButton('menu', 'Map', () => this.game.goLevels(), 'results-levels'),
        180,
        404,
        90,
        62,
      ),
    );
  }

  private next(): void {
    if (this.hasNext) this.game.goPlay(this.index + 1);
    else this.game.goLevels();
  }

  command(cmd: Command): void {
    if (cmd.type === 'confirm' || cmd.type === 'move') this.next();
    else if (cmd.type === 'retry') this.game.goPlay(this.index);
    else if (cmd.type === 'back') this.game.goLevels();
  }

  update(dt: number): void {
    this.t += dt;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const level = this.game.levels[this.index]!;
    const { stars } = this.summary;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.gold;
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.fillText(stars.count === 3 ? 'Flawless!' : 'Level complete!', 170, 52);
    ctx.fillStyle = C.textDim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`${this.index + 1}. ${level.name}`, 170, 80);

    // Stars pop in one after another.
    const got = [stars.par, stars.noDamage, stars.allGold];
    got.forEach((filled, i) => {
      const appear = this.game.reducedMotion
        ? 1
        : Math.min(1, Math.max(0, (this.t - 0.15 - i * 0.2) * 5));
      const pop = appear < 1 ? appear * (1.3 - 0.3 * appear) : 1;
      drawStar(ctx, 110 + i * 60, 130, 22 * pop, filled);
    });
    if (this.summary.improved && !this.summary.firstClear) {
      ctx.fillStyle = C.heal;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText('New best!', 170, 166);
    }

    const s = this.state.stats;
    const par = this.summary.par ?? level.par;
    const rows: Array<[string, string, boolean]> = [
      ['Moves', `${s.moves}${par !== undefined ? ` / par ${par}` : ''}`, stars.par],
      ['Damage taken', String(s.damageTaken), stars.noDamage],
      ['Treasure', `${s.treasuresCollected} / ${s.treasuresTotal}`, stars.allGold],
    ];
    rows.forEach(([label, value, ok], i) => {
      const y = 196 + i * 28;
      ctx.textAlign = 'left';
      ctx.fillStyle = C.text;
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(label, 60, y);
      ctx.textAlign = 'right';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillStyle = ok ? C.heal : C.textDim;
      ctx.fillText(`${value} ${ok ? '✓' : '·'}`, 280, y);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = C.gold;
    ctx.font = 'bold 14px system-ui, sans-serif';
    if (this.summary.crowns > 0) {
      ctx.fillText(`Gold ${this.state.gold}`, 120, 286);
      drawCrownGain(ctx, this.summary.crowns, 225, 286);
    } else {
      ctx.fillText(`Gold ${this.state.gold}`, 170, 286);
    }
    if (this.summary.newSkins.length > 0) {
      ctx.fillStyle = C.heal;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText(
        `New skin: ${this.summary.newSkins.map((s) => s.name).join(', ')}! (Forge)`,
        170,
        310,
      );
    } else if (this.summary.firstClear && this.hasNext) {
      ctx.fillStyle = C.textDim;
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(`Level ${this.index + 2} unlocked`, 170, 310);
    }
  }
}
