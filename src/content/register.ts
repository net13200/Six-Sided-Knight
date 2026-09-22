/**
 * The one place content gets registered. To add a face/tile/enemy/effect:
 * write a module next to the others and add it to the matching list here.
 */
import { createRules, type EffectDef, type Rules, type RulesConfig } from '../engine/registry';
import { Bomb } from './faces/bomb';
import { Coin } from './faces/coin';
import { Heart } from './faces/heart';
import { Key } from './faces/key';
import { Shield } from './faces/shield';
import { Sword } from './faces/sword';
import { Floor, Wall } from './tiles/basic';
import { Chest } from './tiles/chest';
import { Door } from './tiles/door';
import { Exit } from './tiles/exit';
import { Gem } from './tiles/gem';
import { Pool } from './tiles/pool';
import { Spikes } from './tiles/spikes';
import { Skeleton } from './enemies/skeleton';
import { Slime } from './enemies/slime';

export const CORE_CONFIG: RulesConfig = {
  floorTile: Floor.id,
  dieShape: 'd6',
  // Home slots (top, bottom, north, south, east, west) = the start orientation.
  defaultLoadout: ['Shield', 'Heart', 'Bomb', 'Key', 'Sword', 'Coin'],
};

export const FACES = [Sword, Shield, Bomb, Heart, Key, Coin];
export const TILES = [Floor, Wall, Spikes, Pool, Door, Chest, Gem, Exit];
export const ENEMIES = [Skeleton, Slime];
export const EFFECTS: EffectDef[] = [];

export function registerCoreContent(rules: Rules): Rules {
  FACES.forEach((f) => rules.faces.register(f));
  TILES.forEach((t) => rules.tiles.register(t));
  ENEMIES.forEach((e) => rules.enemies.register(e));
  EFFECTS.forEach((e) => rules.effects.register(e));
  return rules;
}

/** Fresh rules with all core content. Tests can register extra content on top. */
export function defaultRules(): Rules {
  return registerCoreContent(createRules(CORE_CONFIG));
}
