/** Node-only helpers for loading level and replay files. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { parseTextLevel, type LevelData, type Replay } from '../../src/engine';

export function loadLevelFile(path: string): LevelData {
  const text = readFileSync(path, 'utf8');
  return extname(path) === '.txt' ? parseTextLevel(text) : (JSON.parse(text) as LevelData);
}

export function loadReplayFile(path: string): Replay {
  return JSON.parse(readFileSync(path, 'utf8')) as Replay;
}

/** Expands directories into the .json/.txt level files they contain (recursively). */
export function levelFiles(paths: string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    if (statSync(p).isDirectory()) {
      for (const name of readdirSync(p).sort()) out.push(...levelFiles([join(p, name)]));
    } else if (/\.(json|txt)$/.test(p) && !p.endsWith('.replay.json')) {
      out.push(p);
    }
  }
  return out;
}
