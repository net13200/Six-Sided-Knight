import type { TileDef } from '../../engine/registry';

/** Landing hurts 1 unless a 'guard' face (Shield) is on the bottom. Enemies avoid spikes. */
export const Spikes: TileDef = {
  id: 'spikes',
  name: 'Spikes',
  glyph: '^',
  passable: true,
  enemyPassable: false,
  onLand(ctx) {
    if (!ctx.faceHasTag(ctx.bottomFace(), 'guard')) {
      ctx.hurtPlayer(1, { kind: 'tile', tile: 'spikes' });
    }
  },
};
