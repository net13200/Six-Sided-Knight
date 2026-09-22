/**
 * Campaign levels, bundled from src/levels/data/*.txt at build time and
 * validated on load. Order = file name order (c1-01, c1-02, ...).
 */
import { parseTextLevel, validateLevel, LevelError, type LevelData, type Rules } from '../engine';

const files = import.meta.glob('./data/*.txt', { query: '?raw', import: 'default', eager: true });

export function loadCampaign(rules: Rules): LevelData[] {
  return Object.keys(files)
    .sort()
    .map((path) => {
      const level = parseTextLevel(files[path] as string);
      const problems = validateLevel(rules, level);
      if (problems.length) throw new LevelError(level.id || path, problems);
      return level;
    });
}
