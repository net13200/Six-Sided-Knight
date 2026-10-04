/**
 * The lesson card over the board. Where the lesson has a clip, the clip loops
 * on the card instead of any text, and the first move, tap or ▶ closes it.
 * Otherwise the text types itself out and play waits for "Got it" (a tap
 * while it's typing shows the rest at once).
 */
import type { Rules } from '../../engine/registry';
import type { Lesson } from '../lessons';
import type { Clip } from '../lesson-clips';
import { el, icon, place } from '../ui';
import { ClipPlayer, clipAspect } from '../view/lesson-clip';
import { t } from '../../i18n';

/** Characters per second while typing. */
const CPS = 45;

export class LessonCard {
  private root: HTMLElement | null = null;
  private typed: HTMLElement | null = null;
  private button: HTMLButtonElement | null = null;
  private shown = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** The lesson, translated. */
  private readonly lesson: Lesson;

  private player: ClipPlayer | null = null;
  private frame = 0;

  constructor(
    lesson: Lesson,
    private readonly onClose: () => void,
    private readonly instant: boolean,
    /** Shown instead of the text, when the lesson has one. */
    private readonly clip: { clip: Clip; rules: Rules } | null = null,
  ) {
    this.lesson = { title: t(lesson.title), text: t(lesson.text) };
  }

  /** A clip lesson: no text to read, so the first move just closes it. */
  get isClip(): boolean {
    return this.clip !== null;
  }

  get typing(): boolean {
    return !this.clip && this.shown < this.lesson.text.length;
  }

  open(ui: HTMLElement, y: number): void {
    if (this.clip) {
      this.openClip(ui, y, this.clip.clip, this.clip.rules);
      return;
    }
    const title = el('h2', { text: this.lesson.title });
    title.id = 'lesson-title';
    // Screen readers get the whole text at once; the typed copy is visual only.
    const full = el('span', { className: 'sr-only', text: this.lesson.text });
    this.typed = el('span', {});
    this.typed.setAttribute('aria-hidden', 'true');
    this.button = el('button', {
      className: 'btn primary',
      testId: 'lesson-ok',
      text: t('Got it'),
      onClick: () => this.advance(),
    });
    this.root = el('div', { className: 'sheet lesson', testId: 'lesson' }, [
      el('small', { className: 'lesson-tag', text: t('Lesson') }),
      title,
      el('p', {}, [full, this.typed]),
      this.button,
    ]);
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'lesson-title');
    // Tapping the card (not just the button) also finishes the typing.
    this.root.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.typing) this.finishTyping();
    });
    place(this.root, 22, y, 296, 0);
    this.root.style.height = 'auto';
    ui.append(this.root);
    if (this.instant) this.finishTyping();
    else {
      this.render();
      this.timer = setInterval(() => {
        this.shown = Math.min(this.lesson.text.length, this.shown + 1);
        this.render();
        if (!this.typing) this.stopTimer();
      }, 1000 / CPS);
    }
    this.button.focus();
  }

  private openClip(ui: HTMLElement, y: number, clip: Clip, rules: Rules): void {
    const w = 268;
    const h = w / clipAspect(clip);
    const canvas = el('canvas', { className: 'lesson-clip', testId: 'lesson-clip' });
    // sharp on any screen: the stage can be scaled up a lot on a big window
    const res = 3;
    canvas.width = w * res;
    canvas.height = Math.round(h * res);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.setAttribute('aria-hidden', 'true');
    this.button = el(
      'button',
      {
        className: 'btn primary lesson-go',
        testId: 'lesson-ok',
        label: t('Got it'),
        onClick: () => this.close(),
      },
      [icon('play')],
    );
    this.root = el('div', { className: 'sheet lesson clip', testId: 'lesson' }, [
      canvas,
      this.button,
    ]);
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', this.lesson.title);
    this.root.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });
    place(this.root, 22, y, 296, 0);
    this.root.style.height = 'auto';
    ui.append(this.root);
    const player = new ClipPlayer(rules, clip, canvas);
    this.player = player;
    let last = performance.now();
    const loop = (now: number) => {
      if (!this.player) return;
      player.update(Math.min(0.05, (now - last) / 1000));
      last = now;
      player.draw();
      this.frame = requestAnimationFrame(loop);
    };
    player.draw();
    this.frame = requestAnimationFrame(loop);
    this.button.focus();
  }

  /** "Got it": finish typing first, then close. */
  advance(): void {
    if (this.typing) this.finishTyping();
    else this.close();
  }

  close(): void {
    if (!this.root) return;
    this.stopTimer();
    this.player = null;
    cancelAnimationFrame(this.frame);
    this.root?.remove();
    this.root = null;
    this.onClose();
  }

  private finishTyping(): void {
    this.shown = this.lesson.text.length;
    this.stopTimer();
    this.render();
  }

  private render(): void {
    if (!this.typed || !this.button) return;
    const text = this.lesson.text;
    // The untyped rest is kept (invisible) so the card never changes size.
    this.typed.replaceChildren(
      text.slice(0, this.shown),
      el('span', { className: 'lesson-rest', text: text.slice(this.shown) }),
    );
    this.button.classList.toggle('waiting', this.typing);
  }

  private stopTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
