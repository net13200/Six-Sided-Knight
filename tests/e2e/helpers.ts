import { expect, type Page } from '@playwright/test';
import { defaultRules } from '../../src/content/register';
import {
  DIRS,
  createState,
  step,
  type Dir,
  type GameState,
  type LevelData,
} from '../../src/engine';
import { solve } from '../../src/solver/solve';
import { levelFiles, loadLevelFile } from '../../tools/lib/files';

export const rules = defaultRules();
export const campaign: LevelData[] = levelFiles(['src/levels/data']).map(loadLevelFile);

export function solutionFor(index: number): Dir[] {
  const r = solve(rules, createState(rules, campaign[index]!));
  if (r.status !== 'solved') throw new Error(`level ${index + 1} not solvable`);
  return [...r.path];
}

/** Breadth-first search for any input sequence that loses the level. */
export function losingPathFor(index: number, maxDepth = 14): Dir[] {
  let frontier: Array<[GameState, Dir[]]> = [[createState(rules, campaign[index]!), []]];
  for (let d = 0; d < maxDepth; d++) {
    const next: Array<[GameState, Dir[]]> = [];
    for (const [s, path] of frontier) {
      for (const dir of DIRS) {
        const r = step(rules, s, { type: 'move', dir });
        if (!r.consumed) continue;
        if (r.state.status === 'lost') return [...path, dir];
        if (r.state.status === 'playing' && next.length < 5000)
          next.push([r.state, [...path, dir]]);
      }
    }
    frontier = next;
  }
  throw new Error('no losing path found');
}

type Hook = {
  scene(): string | undefined;
  state(): GameState | null;
  levelIndex(): number | null;
};

export async function scene(page: Page): Promise<string | undefined> {
  return page.evaluate(() => (window.__ssk as Hook).scene());
}

export async function gameState(page: Page): Promise<GameState> {
  return page.evaluate(() => (window.__ssk as Hook).state()!) as Promise<GameState>;
}

export async function levelIndex(page: Page): Promise<number | null> {
  return page.evaluate(() => (window.__ssk as Hook).levelIndex());
}

/** Client coordinates of a logical (340x480) stage point. */
export async function toClient(
  page: Page,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  const box = (await page.locator('canvas').boundingBox())!;
  return { x: box.x + (x * box.width) / 340, y: box.y + (y * box.height) / 480 };
}

export async function tileClient(page: Page, tx: number, ty: number) {
  return toClient(page, 10 + tx * 40 + 20, 50 + ty * 40 + 20);
}

const DELTA: Record<Dir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

/** Swipes from the middle of the board with a mouse-driven pointer drag. */
export async function swipe(page: Page, dir: Dir): Promise<void> {
  const c = await toClient(page, 170, 230);
  const [dx, dy] = DELTA[dir];
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + dx * 30, c.y + dy * 30, { steps: 3 });
  await page.mouse.move(c.x + dx * 70, c.y + dy * 70, { steps: 3 });
  await page.mouse.up();
}

export async function waitForMoves(page: Page, moves: number): Promise<void> {
  await expect.poll(async () => (await gameState(page)).stats.moves).toBe(moves);
}

/** Collects page errors so tests can assert there were none. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** Solves whatever level is currently on screen (used for generated floors). */
export async function solveCurrent(page: Page): Promise<Dir[]> {
  const s = await gameState(page);
  const r = solve(rules, s, { algorithm: 'idastar', maxNodes: 500_000 });
  if (r.status !== 'solved') throw new Error('current level not solvable');
  return [...r.path];
}

export const KEY = { N: 'ArrowUp', E: 'ArrowRight', S: 'ArrowDown', W: 'ArrowLeft' } as const;

/** Waits until the play screen shows a fresh level, then solves and plays it. */
export async function playCurrentLevel(page: Page): Promise<void> {
  await expect.poll(() => scene(page), { timeout: 15_000 }).toBe('play');
  await expect.poll(async () => (await gameState(page)).stats.moves).toBe(0);
  for (const dir of await solveCurrent(page)) await page.keyboard.press(KEY[dir]);
}

/** The story plays before a first level 1: skip it and wait for the level. */
export async function skipStory(page: Page): Promise<void> {
  await expect.poll(() => scene(page)).toBe('story');
  await page.getByTestId('story-skip').click();
  await expect.poll(() => scene(page)).toBe('play');
}
