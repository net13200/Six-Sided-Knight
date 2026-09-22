import type { TileDef } from '../../engine/registry';

export const Floor: TileDef = {
  id: 'floor',
  name: 'Floor',
  glyph: '.',
  passable: true,
  enemyPassable: true,
};

export const Wall: TileDef = {
  id: 'wall',
  name: 'Wall',
  glyph: '#',
  passable: false,
  enemyPassable: false,
};
