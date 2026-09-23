/** Chapter map: levels along a winding path, locked until the previous one is beaten. */
import {
  CHAPTER_NAMES,
  CHAPTER_SIZE,
  chapterCount,
  chapterOf,
  isCompleted,
  isUnlocked,
  totalStars,
} from '../../meta/progress';
import type { Game } from '../game';
import type { Command } from '../input';
import { el, icon, iconButton, place } from '../ui';
import { C } from '../view/palette';
import { drawStar } from './common';
import type { Scene } from './scene';

const NODE = 56;

/** Serpentine layout: rows of three, alternating direction. */
export function nodePosition(i: number): { x: number; y: number } {
  const row = Math.floor(i / 3);
  const col = i % 3;
  const x = 70 + (row % 2 ? 2 - col : col) * 100;
  return { x, y: 112 + row * 90 };
}

export class LevelsScene implements Scene {
  readonly name = 'levels';
  private t = 0;
  private readonly chapter: number;

  constructor(
    private readonly game: Game,
    chapter?: number,
  ) {
    const max = chapterCount(game.levels) - 1;
    this.chapter = Math.max(0, Math.min(chapter ?? chapterOf(game.continueIndex()), max));
  }

  private get indices(): number[] {
    const start = this.chapter * CHAPTER_SIZE;
    const end = Math.min(start + CHAPTER_SIZE, this.game.levels.length);
    return Array.from({ length: end - start }, (_, k) => start + k);
  }

  enter(ui: HTMLElement): void {
    const save = this.game.save.data;
    const levels = this.game.levels;
    for (const i of this.indices) {
      const level = levels[i]!;
      const unlocked = isUnlocked(save, levels, i);
      const stars = save.levels[level.id]?.stars;
      const done = isCompleted(save, level);
      const p = nodePosition(i - this.chapter * CHAPTER_SIZE);
      const floors = this.game.gauntlets.get(level.id);
      const gauntlet = floors ? `, gauntlet of ${floors.length + 1} floors` : '';
      const b = el(
        'button',
        {
          className: `node${done ? ' done' : ''}${unlocked ? '' : ' locked'}${floors ? ' gauntlet' : ''}`,
          testId: `level-${i + 1}`,
          label: unlocked
            ? `Level ${i + 1}: ${level.name}${gauntlet}${done ? `, ${stars} of 3 stars` : ''}`
            : `Level ${i + 1}, locked`,
          onClick: () => unlocked && this.game.goPlay(i),
        },
        unlocked ? [el('strong', { text: String(i + 1) })] : [icon('lock')],
      );
      b.disabled = !unlocked;
      ui.append(place(b, p.x - NODE / 2, p.y - NODE / 2, NODE, NODE));
    }

    const next = this.game.continueIndex();
    ui.append(
      place(
        el(
          'button',
          { className: 'btn primary', testId: 'map-play', onClick: () => this.game.goPlay(next) },
          [icon('play'), el('span', { text: `Play level ${next + 1}` })],
        ),
        78,
        418,
        184,
        56,
      ),
      place(
        iconButton('back', 'Menu', () => this.game.goMenu(), 'back'),
        6,
        415,
        64,
        62,
      ),
    );

    const chapters = chapterCount(levels);
    if (chapters > 1) {
      if (this.chapter > 0) {
        ui.append(
          place(
            iconButton('back', 'Prev', () => this.game.goLevels(this.chapter - 1), 'chapter-prev'),
            6,
            8,
            52,
            52,
          ),
        );
      }
      if (this.chapter < chapters - 1) {
        ui.append(
          place(
            iconButton('next', 'Next', () => this.game.goLevels(this.chapter + 1), 'chapter-next'),
            282,
            8,
            52,
            52,
          ),
        );
      }
    }
  }

  command(cmd: Command): void {
    if (cmd.type === 'back') this.game.goMenu();
    if (cmd.type === 'confirm') this.game.goPlay(this.game.continueIndex());
  }

  update(dt: number): void {
    this.t += dt;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const save = this.game.save.data;
    const levels = this.game.levels;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.text;
    ctx.font = '800 20px system-ui, sans-serif';
    ctx.fillText(`Chapter ${this.chapter + 1}`, 170, 26);
    ctx.fillStyle = C.textDim;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(CHAPTER_NAMES[this.chapter] ?? '', 170, 46);
    // Star total for the whole campaign.
    drawStar(ctx, 146, 70, 8, true);
    ctx.fillStyle = C.gold;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${totalStars(save)} / ${levels.length * 3}`, 158, 71);

    // The path between nodes: gold where it has been walked.
    const idx = this.indices;
    for (let k = 0; k + 1 < idx.length; k++) {
      const a = nodePosition(k);
      const b = nodePosition(k + 1);
      const walked = isCompleted(save, levels[idx[k]!]!);
      ctx.strokeStyle = walked ? 'rgba(255,215,94,0.7)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.setLineDash(walked ? [] : [2, 10]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Stars under completed nodes, and a pulse on the level to play next.
    const next = this.game.continueIndex();
    idx.forEach((i, k) => {
      const p = nodePosition(k);
      const stars = save.levels[levels[i]!.id]?.stars;
      if (stars !== undefined) {
        for (let s = 0; s < 3; s++) drawStar(ctx, p.x - 14 + s * 14, p.y + 38, 6, s < stars);
      }
      const floors = this.game.gauntlets.get(levels[i]!.id);
      if (floors) {
        // Gauntlet tag: how many floors in a row.
        ctx.fillStyle = C.hurt;
        ctx.beginPath();
        ctx.roundRect(p.x + 12, p.y - NODE / 2 - 6, 26, 14, 7);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`×${floors.length + 1}`, p.x + 25, p.y - NODE / 2 + 1.5);
      }
      if (i === next) {
        const pulse = this.game.reducedMotion ? 0.5 : (Math.sin(this.t * 4) + 1) / 2;
        ctx.strokeStyle = `rgba(255,215,94,${0.35 + pulse * 0.5})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, NODE / 2 + 5 + pulse * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }
}
