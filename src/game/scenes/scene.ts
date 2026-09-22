import type { Command } from '../input';

export type SceneName =
  'boot' | 'menu' | 'levels' | 'play' | 'results' | 'daily' | 'depths' | 'floor';

/** Allowed transitions of the scene state machine. */
export const TRANSITIONS: Readonly<Record<SceneName, readonly SceneName[]>> = {
  boot: ['menu', 'play'],
  menu: ['levels', 'play', 'daily', 'depths'],
  levels: ['menu', 'play'],
  play: ['results', 'menu', 'levels', 'play', 'floor', 'daily', 'depths'],
  results: ['play', 'levels', 'menu'],
  daily: ['menu', 'play'],
  depths: ['menu', 'play', 'depths'],
  floor: ['play', 'daily', 'depths', 'menu'],
};

export function canTransition(from: SceneName, to: SceneName): boolean {
  return TRANSITIONS[from].includes(to);
}

export interface Scene {
  readonly name: SceneName;
  /** Build DOM UI into `ui` (cleared automatically on exit). */
  enter(ui: HTMLElement): void;
  exit?(): void;
  update?(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  command?(cmd: Command): void;
}
