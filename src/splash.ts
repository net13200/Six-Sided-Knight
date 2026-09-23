/**
 * The SugiGames splash (ported from the SugiGames repo's splash.js): brush
 * strokes paint the 杉 kanji, the wordmark fades in, then the splash fades
 * away to reveal the game. The markup and styles are inline in index.html so
 * it shows before the game has loaded. Tap to skip.
 *
 * Skipped for automated browsers (tests drive the game directly) unless the
 * URL has ?splash; shown briefly without animation for reduced motion.
 */
const STROKE_MS = 420;
const GAP_MS = 90;
const HOLD_MS = 1450;

export function runSplash(): void {
  const splash = document.getElementById('splash');
  if (!splash) return;
  const tip = document.getElementById('brush-tip');
  const word = document.getElementById('splash-word');
  const paths = [...splash.querySelectorAll<SVGPathElement>('#kanji-svg .kanji-stroke')];
  const forced = new URLSearchParams(location.search).has('splash');
  if (navigator.webdriver && !forced) {
    splash.remove();
    return;
  }
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let skipped = false;
  let done = false;

  const hide = () => {
    splash.classList.add('is-hidden');
    setTimeout(() => splash.remove(), 550);
  };

  const finishAll = () => {
    if (done) return;
    done = true;
    for (const p of paths) p.style.strokeDashoffset = '0';
    tip?.setAttribute('opacity', '0');
    word?.classList.add('is-visible');
    setTimeout(hide, reduceMotion ? 200 : skipped ? 350 : HOLD_MS);
  };

  const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

  const drawStroke = (path: SVGPathElement) =>
    new Promise<void>((resolve) => {
      const len = path.getTotalLength();
      const start = path.getPointAtLength(0);
      tip?.setAttribute('cx', String(start.x));
      tip?.setAttribute('cy', String(start.y));
      tip?.setAttribute('opacity', '1');
      const t0 = performance.now();
      const frame = (now: number) => {
        if (skipped || done) return resolve();
        const t = Math.min(1, (now - t0) / STROKE_MS);
        const e = ease(t);
        path.style.strokeDashoffset = String(len * (1 - e));
        const pt = path.getPointAtLength(len * e);
        tip?.setAttribute('cx', String(pt.x));
        tip?.setAttribute('cy', String(pt.y));
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const p of paths) {
    const len = p.getTotalLength();
    p.style.strokeDasharray = String(len);
    p.style.strokeDashoffset = String(len);
  }
  splash.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    skipped = true;
    finishAll();
  });
  // Never let a stalled animation trap the game behind the splash.
  setTimeout(finishAll, 6000);

  if (reduceMotion) {
    finishAll();
    return;
  }
  void (async () => {
    for (const p of paths) {
      if (skipped) break;
      await drawStroke(p);
      if (skipped) break;
      await wait(GAP_MS);
    }
    finishAll();
  })();
}
