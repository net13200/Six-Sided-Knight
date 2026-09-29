import type { Command } from '../input';
import type { BackdropTheme, SideRenderer } from '../view/backdrop';

export type SceneName =
  | 'boot'
  | 'menu'
  | 'levels'
  | 'play'
  | 'results'
  | 'daily'
  | 'depths'
  | 'floor'
  | 'forge'
  | 'stats'
  | 'skins'
  | 'story'
  | 'ranger-map'
  | 'ranger';

/** Allowed transitions of the scene state machine. */
export const TRANSITIONS: Readonly<Record<SceneName, readonly SceneName[]>> = {
  boot: ['menu', 'play', 'story'],
  menu: ['menu', 'levels', 'play', 'daily', 'depths', 'forge', 'stats', 'story', 'ranger-map'],
  levels: ['menu', 'play', 'levels', 'story', 'daily', 'depths', 'forge', 'ranger-map'], // the map's landmarks
  play: ['results', 'menu', 'levels', 'play', 'floor', 'daily', 'depths', 'story'],
  results: ['play', 'levels', 'menu', 'story'],
  daily: ['menu', 'play', 'forge'],
  depths: ['menu', 'play', 'depths', 'forge'],
  floor: ['play', 'daily', 'depths', 'menu', 'levels', 'forge'],
  forge: ['menu', 'daily', 'depths', 'skins', 'floor', 'levels'],
  stats: ['menu'],
  skins: ['forge'],
  story: ['play', 'menu', 'levels', 'ranger', 'ranger-map'],
  'ranger-map': ['menu', 'ranger', 'story'],
  ranger: ['ranger', 'ranger-map', 'story', 'menu'],
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
  /**
   * True when only gentle idle animation is on screen (nothing the player is
   * waiting on). The game then redraws at half rate to save battery.
   */
  idle?(): boolean;
  command?(cmd: Command): void;
  /** The scenery around the game on wide screens (default: the dungeon wall). */
  readonly backdrop?: BackdropTheme;
  /** Fills the side panels on wide screens (see view/backdrop.ts). */
  renderSide?: SideRenderer;
}
