import { readdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { parseRangerLevel, startState } from '../../src/ranger/rules';
import { solveRanger } from '../../src/ranger/solve';
import { KEY, campaign, scene, trackErrors } from './helpers';

const stages = readdirSync('src/ranger/data')
  .filter((f) => f.endsWith('.txt'))
  .sort()
  .map((f) => parseRangerLevel(readFileSync(`src/ranger/data/${f}`, 'utf8')));

/** A player who has beaten the whole campaign. */
async function beatCampaign(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    (ids) => {
      const save = JSON.parse(localStorage.getItem('ssk.save')!);
      for (const id of ids)
        save.levels[id] = { stars: 3, bestMoves: 9, completions: 1, bestTimeMs: 9000 };
      save.hints['story:ending'] = true;
      localStorage.setItem('ssk.save', JSON.stringify(save));
    },
    campaign.map((l) => l.id),
  );
  await page.reload();
  // Records without fingerprints are compared with 0.9.0's: mark them current, beaten.
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('ssk.save')!);
    for (const r of Object.values(save.levels) as Array<Record<string, unknown>>) {
      r.completions = 1;
      delete r.redo;
    }
    save.changedLevelsNotice = 0;
    localStorage.setItem('ssk.save', JSON.stringify(save));
  });
  await page.reload();
}

test.describe('bonus chapter: Eight-Sided Ranger', () => {
  test('locked until the campaign is beaten', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('bonus')).toHaveCount(0);
  });

  test('play every stage, then "Coming soon"', async ({ page }) => {
    test.slow();
    const errors = trackErrors(page);
    await beatCampaign(page);
    await page.getByTestId('bonus').click();
    await expect.poll(() => scene(page)).toBe('ranger-map');
    await expect(page.getByTestId('ranger-2')).toBeDisabled();
    await page.getByTestId('ranger-1').click();
    // The chapter's intro page, once.
    await expect.poll(() => scene(page)).toBe('story');
    await page.getByTestId('story-next').click();
    for (const [i, lv] of stages.entries()) {
      await expect.poll(() => scene(page)).toBe('ranger');
      const card = page.getByTestId('lesson');
      await expect(card).toBeVisible();
      while (await card.isVisible()) await page.getByTestId('lesson-ok').click();
      const path = solveRanger(startState(lv)).path;
      for (const d of path) await page.keyboard.press(KEY[d]);
      await expect(page.getByTestId('ranger-won')).toBeVisible();
      await expect(page.getByTestId('ranger-stars')).toHaveText('★★★');
      const bonus = await page.evaluate(() => JSON.parse(localStorage.getItem('ssk.save')!).bonus);
      expect(bonus[lv.id]).toMatchObject({ stars: 3, completions: 1 });
      await page.getByTestId('ranger-next').click();
      if (i === stages.length - 1) {
        await expect.poll(() => scene(page)).toBe('story');
        await expect(page.getByTestId('story-text')).toContainText('Coming soon');
        await page.getByTestId('story-next').click();
        await expect.poll(() => scene(page)).toBe('ranger-map');
      }
    }
    expect(errors).toEqual([]);
  });
});
