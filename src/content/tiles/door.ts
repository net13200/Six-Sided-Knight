import type { TileDef } from '../../engine/registry';

/** Opens (and lets the die roll through) only when an 'unlock' face (Key) leads into it. */
export const Door: TileDef = {
  id: 'door',
  name: 'Locked Door',
  glyph: '|',
  passable: false,
  enemyPassable: false,
  onLeadInto(ctx, { to, face }) {
    if (!ctx.faceHasTag(face, 'unlock')) return 'block';
    ctx.setTile(to.x, to.y, 'floor');
    ctx.emit({ type: 'unlocked', at: to });
    return 'enter';
  },
};
