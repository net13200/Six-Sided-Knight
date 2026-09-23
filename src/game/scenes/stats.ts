/** Lifetime stats: campaign progress, totals, runs, crowns and favourite faces. */
import { currentStreak, utcDate } from '../../meta/daily';
import { CHAPTER_NAMES, CHAPTER_SIZE, chapterCount, totalStars } from '../../meta/progress';
import { STORE, ownedFaces } from '../../meta/store';
import type { Game } from '../game';
import type { Command } from '../input';
import { iconButton, place } from '../ui';
import { drawCrown, drawFace } from '../view/art';
import { C } from '../view/palette';
import { roleColor } from '../view/roles';
import type { Scene } from './scene';

export class StatsScene implements Scene {
  readonly name = 'stats';

  constructor(private readonly game: Game) {}

  enter(ui: HTMLElement): void {
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
  }

  render(ctx: CanvasRenderingContext2D): void {
    const save = this.game.save.data;
    const levels = this.game.levels;
    const st = save.stats;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.gold;
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.fillText('Stats', 170, 30);

    // Campaign: stars per chapter
    const cleared = levels.filter((l) => (save.levels[l.id]?.completions ?? 0) > 0).length;
    heading(ctx, 'Campaign', 58);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.textDim;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(`${cleared}/${levels.length} levels`, 324, 58);
    const chapters = chapterCount(levels);
    for (let c = 0; c < chapters; c++) {
      const ids = levels.slice(c * CHAPTER_SIZE, (c + 1) * CHAPTER_SIZE).map((l) => l.id);
      const got = ids.reduce((n, id) => n + (save.levels[id]?.stars ?? 0), 0);
      const max = ids.length * 3;
      const y = 78 + c * 17;
      ctx.textAlign = 'left';
      ctx.fillStyle = C.text;
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(CHAPTER_NAMES[c] ?? `Chapter ${c + 1}`, 16, y);
      bar(ctx, 104, y, 176, got / max, C.gold);
      ctx.textAlign = 'right';
      ctx.fillStyle = C.textDim;
      ctx.fillText(`${got}/${max}`, 324, y);
    }

    // Totals
    let y = 90 + chapters * 17;
    heading(ctx, 'Totals', y);
    const mins = Math.round(st.playTimeMs / 60_000);
    const totals: Array<[string, string]> = [
      ['Stars', String(totalStars(save))],
      ['Moves', String(st.moves)],
      ['Enemies beaten', String(st.kills)],
      ['Gold found', String(st.gold)],
      ['Knocked out', String(st.deaths)],
      ['Undos', String(st.undos)],
      ['Play time', mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`],
      ['Levels played', String(st.levelsStarted)],
    ];
    y += 18;
    totals.forEach(([k, v], i) => {
      const x = i % 2 ? 176 : 16;
      const yy = y + Math.floor(i / 2) * 16;
      pair(ctx, k, v, x, yy, 148);
    });
    y += Math.ceil(totals.length / 2) * 16 + 10;

    // Runs and crowns
    heading(ctx, 'Runs & crowns', y);
    y += 18;
    const today = utcDate(this.game.platform.now());
    const runs: Array<[string, string]> = [
      ['Daily streak', `${currentStreak(save, today)} (best ${save.daily.bestStreak})`],
      ['Dailies done', String(Object.keys(save.daily.results).length)],
      ['Depths best', save.depths.bestFloor > 0 ? `floor ${save.depths.bestFloor}` : '-'],
      ['Depths runs', String(save.depths.runs)],
      ['Crowns earned', String(save.wallet.earned)],
      ['Crowns spent', String(save.wallet.spent)],
    ];
    runs.forEach(([k, v], i) => {
      const x = i % 2 ? 176 : 16;
      pair(ctx, k, v, x, y + Math.floor(i / 2) * 16, 148);
    });
    y += Math.ceil(runs.length / 2) * 16 + 10;

    // Faces
    const owned = ownedFaces(save);
    heading(ctx, `Faces used · ${owned.length}/${6 + STORE.length} owned`, y);
    y += 22;
    const counts = owned.map((f) => [f, st.faceMoves[f] ?? 0] as const);
    const most = Math.max(1, ...counts.map(([, n]) => n));
    const cols = 4;
    counts.forEach(([face, n], i) => {
      const x = 16 + (i % cols) * 78;
      const yy = y + Math.floor(i / cols) * 26;
      ctx.beginPath();
      ctx.arc(x + 9, yy, 9, 0, Math.PI * 2);
      ctx.fillStyle = roleColor(face);
      ctx.fill();
      drawFace(ctx, face, x + 9, yy, 13);
      bar(ctx, x + 22, yy - 4, 36, n / most, roleColor(face));
      ctx.textAlign = 'left';
      ctx.fillStyle = C.textDim;
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillText(String(n), x + 22, yy + 7);
    });

    drawCrown(ctx, 290, 446, 14);
    ctx.textAlign = 'left';
    ctx.fillStyle = C.gold;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(String(save.wallet.crowns), 300, 447);
  }
}

function heading(ctx: CanvasRenderingContext2D, text: string, y: number): void {
  ctx.textAlign = 'left';
  ctx.fillStyle = C.text;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(text, 16, y);
}

function pair(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  w: number,
): void {
  ctx.textAlign = 'left';
  ctx.fillStyle = C.textDim;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(label, x, y);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.text;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText(value, x + w, y);
}

function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  frac: number,
  color: string,
): void {
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.roundRect(x, y - 3, w, 6, 3);
  ctx.fill();
  if (frac <= 0) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y - 3, Math.max(6, w * Math.min(1, frac)), 6, 3);
  ctx.fill();
}
