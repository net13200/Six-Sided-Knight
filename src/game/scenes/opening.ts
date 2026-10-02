/**
 * The animated 3D opening (instead of the intro's story pages): the Queen,
 * the Old Well, the village turning into dice, and you. It fills the whole
 * window above the stage. The 3D film is loaded on demand; if it can't load or
 * draw here, the classic illustrated pages play instead (`fallback`).
 * Tap to move on a scene, Skip to leave it.
 */
import type { Film } from '../opening/film';
import type { Command } from '../input';
import { el } from '../ui';
import type { Scene } from './scene';
import { t } from '../../i18n';

/** Whether to play the 3D opening here: WebGL available, motion welcome. */
export function openingWanted(reducedMotion: boolean): boolean {
  const force = new URLSearchParams(location.search).get('opening');
  if (force === '0') return false;
  // Automated test browsers get the classic pages, unless a test asks for the film.
  if (navigator.webdriver && force !== '1') return false;
  if (reducedMotion) return false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

const TITLE_TIME = 2.2;

export class OpeningScene implements Scene {
  readonly name = 'story';
  private root: HTMLElement | null = null;
  private film: Film | null = null;
  private caption: HTMLElement | null = null;
  private fade: HTMLElement | null = null;
  private title: HTMLElement | null = null;
  private titleT = -1; // >= 0 once the closing title shows
  private left = false;
  private finished = false;

  constructor(
    /** Played to the end: on to whatever pages follow (the chapter card). */
    private readonly onDone: () => void,
    /** Skipped: past all of the story, as Skip always does. */
    private readonly onSkip: () => void,
    /** Plays the classic pages instead (no 3D here, or it failed). */
    private readonly fallback: () => void,
  ) {}

  enter(): void {
    const host = el('div', { className: 'opening-view' });
    this.caption = el('div', { className: 'opening-caption', testId: 'opening-caption' });
    this.caption.setAttribute('aria-live', 'polite');
    this.fade = el('div', { className: 'opening-fade' });
    this.title = el('div', { className: 'opening-title' }, [
      el('span', { text: 'Six Sided' }),
      el('b', { text: 'Knight' }),
    ]);
    this.title.hidden = true;
    const skip = el('button', {
      className: 'btn small opening-skip',
      testId: 'opening-skip',
      text: t('Skip'),
      label: t('Skip the story'),
      onClick: () => this.skip(),
    });
    this.root = el('div', { className: 'opening', testId: 'opening' }, [
      host,
      el('div', { className: 'opening-bar top' }),
      el('div', { className: 'opening-bar bottom' }),
      this.caption,
      this.fade,
      this.title,
      skip,
    ]);
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', t('Story'));
    // a tap moves on to the next scene
    this.root.addEventListener('click', () => this.next());
    document.body.append(this.root);
    skip.focus();
    import('../opening/film')
      .then(({ Film }) => {
        if (this.left) return;
        this.film = new Film(host, {
          caption: (text) => this.showCaption(text ? t(text) : ''),
          fade: (a) => (this.fade!.style.opacity = String(a)),
          ended: () => this.showTitle(),
        });
      })
      .catch(() => this.fail());
  }

  private showCaption(text: string): void {
    const c = this.caption!;
    c.classList.remove('on');
    void c.offsetWidth;
    c.textContent = text;
    if (text) c.classList.add('on');
  }

  private showTitle(): void {
    if (this.titleT >= 0) return;
    this.titleT = 0;
    this.title!.hidden = false;
  }

  private next(): void {
    if (this.titleT >= 0) this.finish();
    else this.film?.next();
  }

  private fail(): void {
    if (this.finished || this.left) return;
    this.finished = true;
    this.fallback();
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.onDone();
  }

  private skip(): void {
    if (this.finished) return;
    this.finished = true;
    this.onSkip();
  }

  exit(): void {
    this.left = true;
    this.film?.dispose();
    this.film = null;
    this.root?.remove();
  }

  command(cmd: Command): void {
    if (cmd.type === 'confirm' || (cmd.type === 'move' && cmd.dir === 'E')) this.next();
    else if (cmd.type === 'back') this.skip();
  }

  update(dt: number): void {
    if (!this.film) return;
    try {
      this.film.advance(dt);
    } catch {
      this.fail();
      return;
    }
    if (this.titleT >= 0) {
      this.titleT += dt;
      if (this.titleT > TITLE_TIME) this.finish();
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    // The stage underneath stays dark; the film draws in its own canvas.
    ctx.fillStyle = '#07050b';
    ctx.fillRect(0, 0, 340, 480);
    if (!this.film) return;
    try {
      this.film.draw();
    } catch {
      this.fail();
    }
  }

  /** Never idle: the film is always moving. */
  idle(): boolean {
    return false;
  }

  /** For tests: which part of the opening is showing. */
  get state(): 'loading' | 'film' | 'title' {
    return !this.film ? 'loading' : this.titleT >= 0 ? 'title' : 'film';
  }
}
