/** The Ranger's bonus chapter: stages bundled from src/ranger/data/*.txt, in file order. */
import { parseRangerLevel, type RLevel } from './rules';

const files = import.meta.glob('./data/*.txt', { query: '?raw', import: 'default', eager: true });

export function loadRangerLevels(): RLevel[] {
  return Object.keys(files)
    .sort()
    .map((path) => parseRangerLevel(files[path] as string));
}
