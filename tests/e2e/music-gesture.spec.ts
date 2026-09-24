import { expect, test, type Page } from '@playwright/test';

const running = (page: Page) =>
  page.evaluate(() => (window.__ssk as { audioRunning(): boolean }).audioRunning());

// Act like a browser that blocks sound until the player interacts (e.g. an
// iPhone): contexts start suspended and only resume during a user gesture.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const Real = window.AudioContext;
    class Blocked extends Real {
      constructor(opts?: AudioContextOptions) {
        super(opts);
        void super.suspend();
      }
      override resume(): Promise<void> {
        if (!navigator.userActivation.isActive) return new Promise(() => {});
        return super.resume();
      }
    }
    window.AudioContext = Blocked;
  });
});

test('the first tap anywhere starts the music, even on the splash', async ({ page }) => {
  await page.goto('/?splash');
  await expect(page.getByTestId('splash')).toBeVisible();
  await page.waitForTimeout(300);
  expect(await running(page)).toBe(false);
  await page.getByTestId('splash').click();
  await expect.poll(() => running(page)).toBe(true);
});

test('a tap on a menu button starts it too', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(300);
  expect(await running(page)).toBe(false);
  await page.getByTestId('settings').click();
  await expect.poll(() => running(page)).toBe(true);
});
