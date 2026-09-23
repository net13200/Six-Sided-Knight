/**
 * The Forge: spend crowns on new faces and build your own die for Daily Roll
 * and Depths (campaign levels keep their fixed die). Tap a slot on the die,
 * then a face to put it there. A face already on the die swaps places.
 */
import { getShape, type DieState } from '../../engine';
import {
  STARTING_FACES,
  STORE,
  buyFace,
  isValidLoadout,
  ownsFace,
  placeFace,
  playerLoadout,
  priceOf,
} from '../../meta/store';
import type { Game } from '../game';
import type { Command } from '../input';
import { el, iconButton, place } from '../ui';
import { drawCrown, drawCrowns, drawFace } from '../view/art';
import { cameraMatrix, drawCube3d } from '../view/cube';
import { faceInfo } from '../view/face-info';
import { C } from '../view/palette';
import { roleColor } from '../view/roles';
import type { Scene } from './scene';

/** Where each home slot sits in the cross-shaped net (cell centres). */
/** Tap targets are 60 logical px so they stay 44+ CSS px when the stage is scaled down. */
const CELL = 60;
const NET: Readonly<Record<string, readonly [number, number]>> = {
  north: [150, 102],
  west: [90, 162],
  top: [150, 162],
  east: [210, 162],
  south: [150, 222],
  bottom: [150, 282],
};
const SLOT_LABEL: Readonly<Record<string, string>> = {
  top: 'Top',
  bottom: 'Bottom',
  north: 'North',
  south: 'South',
  east: 'East',
  west: 'West',
};
const SHELF_Y = 358;

export class ForgeScene implements Scene {
  readonly name = 'forge';
  private readonly slots: readonly string[];
  private selected = 0; // top
  private t = 0;
  private sheet: HTMLElement | null = null;
  private ui: HTMLElement | null = null;
  private readonly slotButtons: HTMLButtonElement[] = [];
  private shelfButtons = new Map<string, HTMLButtonElement>();

  constructor(
    private readonly game: Game,
    private readonly back: () => void = () => game.goMenu(),
  ) {
    this.slots = getShape(game.rules.config.dieShape).def.slots;
  }

  private get loadout(): string[] {
    return playerLoadout(this.game.save.data);
  }

  /** Every face in shelf order: the starting six, then the store. */
  private get shelf(): string[] {
    return [...STARTING_FACES, ...STORE.map((i) => i.face)];
  }

  enter(ui: HTMLElement): void {
    this.ui = ui;
    this.slots.forEach((slot, i) => {
      const [x, y] = NET[slot] ?? [0, 0];
      const b = el('button', {
        className: 'slot-btn',
        testId: `slot-${slot}`,
        onClick: () => this.select(i),
      });
      this.slotButtons.push(b);
      ui.append(place(b, x - CELL / 2, y - CELL / 2, CELL, CELL));
    });
    this.shelf.forEach((face, i) => {
      const { x, y } = shelfCell(i);
      const b = el('button', {
        className: 'slot-btn',
        testId: `face-${face}`,
        onClick: () => this.pick(face),
      });
      this.shelfButtons.set(face, b);
      ui.append(place(b, x, y, 80, 60));
    });
    ui.append(
      place(
        iconButton('back', 'Back', () => this.back(), 'back'),
        4,
        4,
        60,
        60,
      ),
      place(
        iconButton('crown', 'Skins', () => this.game.goSkins(), 'forge-skins'),
        276,
        4,
        60,
        60,
      ),
      place(
        el('button', {
          className: 'btn small',
          testId: 'forge-reset',
          text: 'Reset',
          onClick: () => this.setDie([...STARTING_FACES]),
        }),
        252,
        228,
        80,
        60,
      ),
    );
    this.syncLabels();
  }

  private select(i: number): void {
    this.selected = i;
    this.game.audio.play('click');
    this.syncLabels();
  }

  private pick(face: string): void {
    if (!ownsFace(this.game.save.data, face)) {
      this.openBuy(face);
      return;
    }
    this.setDie(placeFace(this.loadout, this.selected, face));
  }

  private setDie(loadout: string[]): void {
    if (!isValidLoadout(this.game.save.data, loadout)) return;
    const isDefault = loadout.every((f, i) => f === STARTING_FACES[i]);
    this.game.save.update((d) => (d.die = isDefault ? null : loadout));
    this.game.analytics.track('die_changed', { faces: loadout.join(',') });
    this.game.audio.play('roll');
    this.syncLabels();
  }

  /** Keeps accessible names in sync with what the canvas draws. */
  private syncLabels(): void {
    const die = this.loadout;
    this.slots.forEach((slot, i) => {
      const b = this.slotButtons[i]!;
      b.setAttribute('aria-label', `${SLOT_LABEL[slot] ?? slot}: ${die[i]}`);
      b.setAttribute('aria-pressed', String(i === this.selected));
    });
    const save = this.game.save.data;
    for (const [face, b] of this.shelfButtons) {
      const price = priceOf(face);
      b.setAttribute(
        'aria-label',
        ownsFace(save, face)
          ? `Put ${face} on the ${SLOT_LABEL[this.slots[this.selected]!] ?? ''} side`
          : `${face}: buy for ${price} crowns`,
      );
    }
  }

  private openBuy(face: string): void {
    if (this.sheet || !this.ui) return;
    const price = priceOf(face) ?? 0;
    const crowns = this.game.save.data.wallet.crowns;
    const afford = crowns >= price;
    const art = el('canvas', { className: 'sheet-art' });
    art.width = 128;
    art.height = 128;
    const actx = art.getContext('2d');
    if (actx) {
      actx.scale(2, 2);
      actx.beginPath();
      actx.roundRect(4, 4, 56, 56, 10);
      actx.fillStyle = roleColor(face);
      actx.fill();
      drawFace(actx, face, 32, 32, 40);
    }
    const buy = el('button', {
      className: 'btn primary',
      testId: 'buy-confirm',
      text: afford ? `Buy for ${price}` : `Need ${price - crowns} more`,
      onClick: () => this.buy(face),
    });
    buy.disabled = !afford;
    this.sheet = place(
      el('div', { className: 'sheet', testId: 'buy-sheet' }, [
        el('div', { className: 'sheet-head' }, [art, el('h2', { text: face })]),
        el('p', { text: faceInfo(face) }),
        el('p', {
          className: 'fine',
          text: afford
            ? `You have ${crowns} crowns. Faces go on your die for Daily Roll and Depths.`
            : `You have ${crowns} crowns. Every new star pays 10.`,
        }),
        el('div', { className: 'row' }, [
          el('button', {
            className: 'btn',
            testId: 'buy-cancel',
            text: 'Not now',
            onClick: () => this.closeBuy(),
          }),
          buy,
        ]),
      ]),
      20,
      96,
      300,
      270,
    );
    this.ui.append(this.sheet);
  }

  private buy(face: string): void {
    let result = '';
    this.game.save.update((d) => (result = buyFace(d, face)));
    if (result === 'bought') {
      this.game.audio.play('buy');
      this.game.analytics.track('face_bought', { face, price: priceOf(face) ?? 0 });
      // Straight onto the selected side, so the new face is ready to use.
      this.closeBuy();
      this.setDie(placeFace(this.loadout, this.selected, face));
      return;
    }
    this.closeBuy();
  }

  private closeBuy(): void {
    this.sheet?.remove();
    this.sheet = null;
    this.syncLabels();
  }

  command(cmd: Command): void {
    if (cmd.type !== 'back') return;
    if (this.sheet) this.closeBuy();
    else this.back();
  }

  update(dt: number): void {
    this.t += dt;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const save = this.game.save.data;
    const die = this.loadout;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.gold;
    ctx.font = '800 24px system-ui, sans-serif';
    ctx.fillText('Forge', 170, 20);
    drawCrowns(ctx, save.wallet.crowns, 196, 44);
    ctx.fillStyle = C.textDim;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('Your die for Daily Roll & Depths', 170, 62);

    // The net
    this.slots.forEach((slot, i) => {
      const [x, y] = NET[slot] ?? [0, 0];
      const face = die[i] ?? '';
      const sel = i === this.selected;
      ctx.beginPath();
      ctx.roundRect(x - CELL / 2 + 3, y - CELL / 2 + 3, CELL - 6, CELL - 6, 8);
      ctx.fillStyle = roleColor(face);
      ctx.fill();
      ctx.lineWidth = sel ? 3 : 1.5;
      ctx.strokeStyle = sel ? C.gold : C.outline;
      ctx.stroke();
      drawFace(ctx, face, x, y + 3, 30);
      ctx.fillStyle = 'rgba(26,22,34,0.8)';
      ctx.font = 'bold 8px system-ui, sans-serif';
      ctx.fillText((SLOT_LABEL[slot] ?? slot).toUpperCase(), x, y - CELL / 2 + 11);
    });

    // A slowly turning 3D preview
    const state: DieState = { shape: this.game.rules.config.dieShape, loadout: die, orient: 0 };
    const yaw = this.game.reducedMotion ? -30 : -30 + Math.sin(this.t * 0.6) * 25;
    drawCube3d(ctx, state, 290, 150, 32, cameraMatrix(yaw, -38));

    // Selected side
    const slot = this.slots[this.selected]!;
    const face = die[this.selected] ?? '';
    ctx.fillStyle = C.text;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(`${SLOT_LABEL[slot]}: ${face}`, 170, 322);
    ctx.fillStyle = C.textDim;
    ctx.font = '11px system-ui, sans-serif';
    wrap(ctx, faceInfo(face), 170, 337, 310, 12);

    // The shelf
    this.shelf.forEach((f, i) => {
      const { x, y } = shelfCell(i);
      const owned = ownsFace(save, f);
      const onDie = die.includes(f);
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, 76, 56, 10);
      ctx.fillStyle = onDie ? '#2a2640' : '#1d1a28';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = onDie ? '#5b547a' : '#3a3550';
      ctx.stroke();
      ctx.save();
      ctx.globalAlpha = owned ? 1 : 0.45;
      ctx.beginPath();
      ctx.arc(x + 20, y + 30, 14, 0, Math.PI * 2);
      ctx.fillStyle = roleColor(f);
      ctx.fill();
      drawFace(ctx, f, x + 20, y + 30, 20);
      ctx.restore();
      ctx.textAlign = 'left';
      ctx.fillStyle = owned ? C.text : C.textDim;
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText(f, x + 38, owned ? y + 30 : y + 23);
      if (!owned) {
        drawCrown(ctx, x + 44, y + 38, 11);
        ctx.fillStyle = C.gold;
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillText(String(priceOf(f) ?? ''), x + 52, y + 39);
      } else if (onDie) {
        ctx.fillStyle = C.textDim;
        ctx.font = '9px system-ui, sans-serif';
        ctx.fillText('on die', x + 38, y + 43);
      }
      ctx.textAlign = 'center';
    });
  }
}

function shelfCell(i: number): { x: number; y: number } {
  return { x: 10 + (i % 4) * 80, y: SHELF_Y + Math.floor(i / 4) * 60 };
}

/** Centered text wrapped to `width`, at most two lines. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  width: number,
  lh: number,
): void {
  const words = text.split(' ');
  let line = '';
  let row = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > width && line) {
      ctx.fillText(line, cx, y + row * lh);
      line = w;
      row++;
    } else line = test;
  }
  if (line) ctx.fillText(line, cx, y + row * lh);
}
