/** Golden replays: recorded runs must keep producing exactly the same result. */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyReplay } from '../../src/engine';
import { levelFiles, loadLevelFile, loadReplayFile } from '../../tools/lib/files';
import { rules } from './helpers';

const root = join(__dirname, '../..');
const levels = new Map(
  levelFiles([join(root, 'examples/levels')]).map((f) => {
    const lvl = loadLevelFile(f);
    return [lvl.id, lvl] as const;
  }),
);
const replayDir = join(root, 'examples/replays');

describe('golden replays', () => {
  for (const file of readdirSync(replayDir).filter((f) => f.endsWith('.replay.json'))) {
    it(file, () => {
      const replay = loadReplayFile(join(replayDir, file));
      const level = levels.get(replay.level);
      expect(level, `level ${replay.level}`).toBeDefined();
      expect(replay.expect, 'replay has expectations').toBeDefined();
      expect(verifyReplay(rules, level!, replay)).toEqual([]);
    });
  }
});
