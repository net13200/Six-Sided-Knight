/**
 * Campaign levels, bundled from src/levels/data/*.txt at build time and
 * validated on load. Order = file name order (c1-01, c1-02, ...).
 *
 * Gauntlets: a campaign level can have extra floors, played in a row with HP
 * carried over. Floor 1 is the level itself; floors 2+ live in
 * src/levels/gauntlets/ as <level id>-<floor>.txt (e.g. c2-10-2.txt).
 */
import { parseTextLevel, validateLevel, LevelError, type LevelData, type Rules } from '../engine';

const files = import.meta.glob('./data/*.txt', { query: '?raw', import: 'default', eager: true });
const floorFiles = import.meta.glob('./gauntlets/*.txt', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function load(rules: Rules, all: Record<string, unknown>): LevelData[] {
  return Object.keys(all)
    .sort()
    .map((path) => {
      const level = parseTextLevel(all[path] as string);
      const problems = validateLevel(rules, level);
      if (problems.length) throw new LevelError(level.id || path, problems);
      return level;
    });
}

export function loadCampaign(rules: Rules): LevelData[] {
  return load(rules, files);
}

/** Extra gauntlet floors by campaign level id (floors 2, 3, ... in order). */
export function loadGauntletFloors(rules: Rules): Map<string, LevelData[]> {
  return groupFloors(load(rules, floorFiles));
}

/** Groups floor levels "<id>-<n>" under "<id>", ordered by n. */
export function groupFloors(floors: readonly LevelData[]): Map<string, LevelData[]> {
  const out = new Map<string, LevelData[]>();
  for (const f of floors) {
    const m = /^(.*)-(\d+)$/.exec(f.id);
    if (!m) throw new Error(`Gauntlet floor id '${f.id}' must end in -<floor>`);
    const list = out.get(m[1]!) ?? [];
    list.push(f);
    out.set(m[1]!, list);
  }
  for (const list of out.values()) list.sort((a, b) => floorNo(a) - floorNo(b));
  return out;
}

const floorNo = (l: LevelData) => Number(/-(\d+)$/.exec(l.id)?.[1] ?? 0);
