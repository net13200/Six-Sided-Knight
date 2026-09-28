import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Sound allowed on load, like an installed app; the blocking cases are simulated below.
const localChromium = '/opt/pw-browsers/chromium';
test.use({
  launchOptions: {
    ...(existsSync(localChromium) ? { executablePath: localChromium } : {}),
    args: ['--autoplay-policy=no-user-gesture-required'],
  },
});

const running = (page: Page) =>
  page.evaluate(() => (window.__ssk as { audioRunning(): boolean }).audioRunning());

/** Switching to another app and back: the page is hidden, then visible again. */
async function setVisible(page: Page, visible: boolean): Promise<void> {
  await page.evaluate((v) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (v ? 'visible' : 'hidden'),
    });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => !v });
    document.dispatchEvent(new Event('visibilitychange'));
  }, visible);
}

test('music comes back after switching apps', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => running(page)).toBe(true);
  await setVisible(page, false);
  await expect.poll(() => running(page)).toBe(false);
  await setVisible(page, true);
  await expect.poll(() => running(page)).toBe(true);
});

test.describe('on a phone that blocks sound until a touch', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Sound may start only during a touch (this listener runs before the game's).
      let touching = false;
      window.addEventListener(
        'pointerdown',
        () => {
          touching = true;
          setTimeout(() => (touching = false), 0);
        },
        true,
      );
      const Real = window.AudioContext;
      class Blocked extends Real {
        constructor(opts?: AudioContextOptions) {
          super(opts);
          void super.suspend();
        }
        override resume(): Promise<void> {
          if (!touching) return new Promise(() => {});
          return super.resume();
        }
      }
      window.AudioContext = Blocked;
    });
  });

  test('any touch after coming back restarts it, even on a menu button', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('settings').click(); // first touch starts the music
    await page.getByTestId('settings-close').click();
    await expect.poll(() => running(page)).toBe(true);
    await setVisible(page, false);
    await setVisible(page, true);
    await page.waitForTimeout(300);
    expect(await running(page)).toBe(false); // the browser kept it paused
    await page.getByTestId('settings').click();
    await expect.poll(() => running(page)).toBe(true);
  });
});

test.describe('on an iPhone, where switching apps "interrupts" sound', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const Real = window.AudioContext;
      const all: Phone[] = [];
      class Phone extends Real {
        interrupted = false;
        constructor(opts?: AudioContextOptions) {
          super(opts);
          all.push(this);
        }
        override get state(): AudioContextState {
          return this.interrupted ? ('interrupted' as AudioContextState) : super.state;
        }
        override resume(): Promise<void> {
          this.interrupted = false;
          return super.resume();
        }
      }
      window.AudioContext = Phone;
      (window as unknown as { interruptAudio(): void }).interruptAudio = () => {
        for (const c of all) {
          c.interrupted = true;
          c.dispatchEvent(new Event('statechange'));
        }
      };
    });
  });

  test('coming back from another app resumes an interrupted context', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => running(page)).toBe(true);
    await setVisible(page, false);
    await page.evaluate(() => (window as unknown as { interruptAudio(): void }).interruptAudio());
    await setVisible(page, true);
    await expect.poll(() => running(page)).toBe(true);
  });

  test('an interruption while playing (e.g. a call) is recovered', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => running(page)).toBe(true);
    await page.evaluate(() => (window as unknown as { interruptAudio(): void }).interruptAudio());
    await expect.poll(() => running(page)).toBe(true);
  });
});
