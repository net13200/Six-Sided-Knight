import { expect, test } from '@playwright/test';
import { campaign, levelIndex, scene, trackErrors } from './helpers';

test('an update that changes beaten levels: they are solved again, the rest stays', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto('/');
  // A 0.9.0 player who beat every level with 3 stars (records without fingerprints).
  await page.evaluate(
    (ids) => {
      const save = JSON.parse(localStorage.getItem('ssk.save')!);
      for (const id of ids)
        save.levels[id] = { stars: 3, bestMoves: 9, completions: 1, bestTimeMs: 9000 };
      save.lastLevelId = 'c3-10';
      localStorage.setItem('ssk.save', JSON.stringify(save));
    },
    campaign.map((l) => l.id),
  );
  await page.reload();
  await expect(page.getByTestId('changed-notice')).toContainText('13 levels have changed');
  await page.getByTestId('changed-notice-ok').click();

  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('ssk.save')!));
  expect(save.levels['c5-02']).toMatchObject({ stars: 0, completions: 0, redo: true });
  expect(save.levels['c4-04']).toMatchObject({ stars: 0, redo: true });
  expect(save.levels['c5-11']).toBeUndefined();
  expect(save.levels['c6-09']).toMatchObject({ stars: 3, completions: 1 });
  expect(save.changedLevelsNotice).toBe(0);

  // The map: chapter 5's stages are open and marked, and Play goes to the first changed one.
  await page.getByTestId('levels').click();
  await expect.poll(() => scene(page)).toBe('levels');
  await expect(page.getByTestId('level-34')).toHaveAttribute('aria-label', /solve it again/);
  await expect(page.getByTestId('level-33')).not.toHaveAttribute('aria-label', /solve it again/);
  await expect(page.getByTestId('level-35')).toBeEnabled();
  await page.getByTestId('map-play').click();
  await expect.poll(() => scene(page)).toBe('play');
  expect(await levelIndex(page)).toBe(33);
  await page.reload();
  await expect(page.getByTestId('changed-notice')).toHaveCount(0);
  expect(errors).toEqual([]);
});
