/** Logical layout of the play screen (340x480). */
export const TILE = 40;
export const BOARD_X = 10;
export const BOARD_Y = 50;
export const BOARD_W = 8 * TILE;
export const BOARD_H = 9 * TILE;
export const BAR_Y = BOARD_Y + BOARD_H + 2; // 412

export function tileCenter(x: number, y: number): { x: number; y: number } {
  return { x: BOARD_X + x * TILE + TILE / 2, y: BOARD_Y + y * TILE + TILE / 2 };
}

/** Tile under a logical point, or null if outside the board. */
export function tileAt(px: number, py: number): { x: number; y: number } | null {
  const x = Math.floor((px - BOARD_X) / TILE);
  const y = Math.floor((py - BOARD_Y) / TILE);
  if (x < 0 || y < 0 || x >= 8 || y >= 9) return null;
  return { x, y };
}
