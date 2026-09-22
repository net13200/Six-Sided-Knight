import type { TileDef } from '../../engine/registry';

export const Exit: TileDef = {
  id: 'exit',
  name: 'Exit Stairs',
  glyph: '>',
  passable: true,
  enemyPassable: true,
  goal: true,
  onLand(ctx) {
    ctx.win();
  },
};
