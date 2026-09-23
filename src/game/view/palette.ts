/** Colours. Faces are also distinguished by shape, never by colour alone. */
export const C = {
  bg: '#14121c',
  hud: '#1d1a28',
  text: '#ece6d6',
  textDim: '#8d86a0',
  floorA: '#2c2839',
  floorB: '#302b3f',
  wall: '#0d0b13',
  wallTop: '#3a3450',
  wallEdge: '#4d4668',
  spikes: '#b9bfd1',
  pool: '#3fa7d6',
  poolLight: '#9fe0ff',
  door: '#8a5a33',
  doorDark: '#5b3a1f',
  chest: '#a8702f',
  chestBand: '#e2b650',
  gem: '#56e0b0',
  exit: '#e2b650',
  dieBody: '#f1e7cf',
  dieEdge: '#b6a887',
  dieShadow: 'rgba(0,0,0,0.35)',
  outline: '#1a1622',
  sword: '#d7dee8',
  shield: '#4f8fe0',
  bomb: '#3a3848',
  fuse: '#ff9d3a',
  heart: '#e5485f',
  key: '#e69b3a',
  coin: '#f4d34d',
  skeleton: '#e8e3d3',
  slime: '#6ccf5a',
  slimeDark: '#3f8f35',
  ice: '#a9dcef',
  iceDeep: '#6fb3d3',
  frost: '#bff3ff',
  archer: '#4f7a3a',
  archerDark: '#2f4c22',
  golem: '#8f8a9e',
  golemDark: '#5d586c',
  danger: 'rgba(255,90,106,0.16)',
  hurt: '#ff5a6a',
  heal: '#6ee07a',
  gold: '#ffd75e',
  block: '#8fc6ff',
  alert: '#ffb238',
} as const;

/** Display settings that change how things are drawn (set from the player's settings). */
export const displayPrefs = {
  highContrast: false,
  largeLabels: false,
  /** Bumped whenever colours change, so cached drawings are redrawn. */
  version: 0,
};

const NORMAL = { ...C };
/** Brighter secondary text and stronger edges for the high-contrast setting. */
const HIGH_CONTRAST: Partial<Record<keyof typeof C, string>> = {
  textDim: '#c4bdd6',
  floorA: '#2a2638',
  floorB: '#353046',
  wallTop: '#4a4266',
  wallEdge: '#6a6190',
  danger: 'rgba(255,60,80,0.32)',
};

export function setHighContrast(on: boolean): void {
  if (displayPrefs.highContrast !== on) displayPrefs.version++;
  displayPrefs.highContrast = on;
  Object.assign(C as Record<string, string>, NORMAL, on ? HIGH_CONTRAST : {});
}
