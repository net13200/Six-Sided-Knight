import type { TileDef } from '../../engine/registry';

/** Opens for +30 gold (and lets the die roll in) only when a 'loot' face (Coin) leads into it. */
export const Chest: TileDef = {
  id: 'chest',
  name: 'Chest',
  glyph: '$',
  passable: false,
  enemyPassable: false,
  treasure: true,
  onLeadInto(ctx, { to, face }) {
    if (!ctx.faceHasTag(face, 'loot')) return 'block';
    ctx.setTile(to.x, to.y, 'floor');
    ctx.emit({ type: 'opened', at: to });
    ctx.addGold(30, 'chest');
    ctx.collectTreasure();
    return 'enter';
  },
};
