/** Die skins: cosmetic only. Earned with campaign stars and daily streaks. */
import { SKINS, isSkinUnlocked, unlockText } from '../../meta/skins';
import type { Game } from '../game';
import type { Command } from '../input';
import { el, iconButton, place } from '../ui';
import { drawDieCube } from '../view/cube';
import { C } from '../view/palette';
import type { Scene } from './scene';

const CARD_W = 100;
const CARD_H = 104;

function cardPos(i: number): { x: number; y: number } {
  return { x: 15 + (i % 3) * 105, y: 84 + Math.floor(i / 3) * 110 };
}

export class SkinsScene implements Scene {
  readonly name = 'skins';
  private t = 0;
  private readonly buttons = new Map<string, HTMLButtonElement>();

  constructor(private readonly game: Game) {}

  enter(ui: HTMLElement): void {
    const save = this.game.save.data;
    SKINS.forEach((skin, i) => {
      const { x, y } = cardPos(i);
      const unlocked = isSkinUnlocked(save, skin);
      const b = el('button', {
        className: 'slot-btn',
        testId: `skin-${skin.id}`,
        label: unlocked ? `${skin.name} skin` : `${skin.name} skin, locked: ${unlockText(skin)}`,
        onClick: () => this.equip(skin.id),
      });
      b.disabled = !unlocked;
      this.buttons.set(skin.id, b);
      ui.append(place(b, x, y, CARD_W, CARD_H));
    });
    ui.append(
      place(
        iconButton('back', 'Forge', () => this.game.goForge(), 'back'),
        4,
        415,
        64,
        62,
      ),
    );
    this.sync();
  }

  private equip(id: string): void {
    const skin = SKINS.find((s) => s.id === id);
    if (!skin || !isSkinUnlocked(this.game.save.data, skin)) return;
    this.game.save.update((d) => (d.skin = id));
    this.game.applySkin();
    this.game.audio.play('click');
    this.sync();
  }

  private sync(): void {
    for (const [id, b] of this.buttons) {
      b.setAttribute('aria-pressed', String(this.game.save.data.skin === id));
    }
  }

  command(cmd: Command): void {
    if (cmd.type === 'back') this.game.goForge();
  }

  update(dt: number): void {
    this.t += dt;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const save = this.game.save.data;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.gold;
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.fillText('Skins', 170, 34);
    ctx.fillStyle = C.textDim;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('Just for looks. Earn them with stars and streaks.', 170, 62);

    const die = {
      shape: this.game.rules.config.dieShape,
      loadout: this.game.rules.config.defaultLoadout,
      orient: 0,
    };
    SKINS.forEach((skin, i) => {
      const { x, y } = cardPos(i);
      const unlocked = isSkinUnlocked(save, skin);
      const equipped = save.skin === skin.id;
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, CARD_W - 2, CARD_H - 2, 12);
      ctx.fillStyle = equipped ? '#2a2640' : '#1d1a28';
      ctx.fill();
      ctx.lineWidth = equipped ? 2.5 : 1.5;
      ctx.strokeStyle = equipped ? C.gold : '#3a3550';
      ctx.stroke();
      ctx.save();
      ctx.globalAlpha = unlocked ? 1 : 0.3;
      const bob = unlocked && !this.game.reducedMotion ? Math.sin(this.t * 2 + i) * 1.5 : 0;
      drawDieCube(
        ctx,
        die,
        0,
        x + CARD_W / 2,
        y + 42 + bob,
        { sx: 1, sy: 1, flash: 0 },
        false,
        skin,
      );
      ctx.restore();
      ctx.fillStyle = unlocked ? C.text : C.textDim;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText(skin.name, x + CARD_W / 2, y + 82);
      ctx.fillStyle = equipped ? C.gold : C.textDim;
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(
        equipped ? 'Equipped' : unlocked ? 'Tap to wear' : unlockText(skin),
        x + CARD_W / 2,
        y + 96,
      );
    });
  }
}
