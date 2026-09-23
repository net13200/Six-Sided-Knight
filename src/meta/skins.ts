/**
 * Die skins: purely cosmetic, unlocked by stars and daily streaks. A skin
 * only changes the die's frame, rim and a subtle pattern; the face icons and
 * their role colours never change, so every skin reads the same in play.
 */
import { totalStars } from './progress';
import type { SaveData } from './save';

export type SkinPattern = 'none' | 'dots' | 'stripes' | 'stars' | 'frost' | 'cracks' | 'shine';

export interface SkinDef {
  readonly id: string;
  readonly name: string;
  /** Frame and outline around the die. */
  readonly rim: string;
  /** Soft glow behind the die (or null). */
  readonly glow: string | null;
  /** Pattern drawn faintly over the side panels. */
  readonly pattern: SkinPattern;
  readonly patternColor: string;
  /** Unlock requirement: campaign stars, or best daily streak. */
  readonly unlock: { readonly stars?: number; readonly streak?: number };
}

export const SKINS: readonly SkinDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    rim: '#1a1622',
    glow: null,
    pattern: 'none',
    patternColor: '#000',
    unlock: {},
  },
  {
    id: 'bone',
    name: 'Bone',
    rim: '#e8e3d3',
    glow: null,
    pattern: 'cracks',
    patternColor: 'rgba(60,50,40,0.35)',
    unlock: { stars: 10 },
  },
  {
    id: 'moss',
    name: 'Moss',
    rim: '#4f7a3a',
    glow: null,
    pattern: 'dots',
    patternColor: 'rgba(40,90,30,0.35)',
    unlock: { stars: 30 },
  },
  {
    id: 'frost',
    name: 'Frost',
    rim: '#9fe0ff',
    glow: 'rgba(159,224,255,0.35)',
    pattern: 'frost',
    patternColor: 'rgba(255,255,255,0.55)',
    unlock: { stars: 60 },
  },
  {
    id: 'ember',
    name: 'Ember',
    rim: '#ff9d3a',
    glow: 'rgba(255,157,58,0.35)',
    pattern: 'stripes',
    patternColor: 'rgba(120,40,0,0.25)',
    unlock: { stars: 100 },
  },
  {
    id: 'gilded',
    name: 'Gilded',
    rim: '#ffd75e',
    glow: 'rgba(255,215,94,0.4)',
    pattern: 'shine',
    patternColor: 'rgba(255,255,255,0.5)',
    unlock: { stars: 150 },
  },
  {
    id: 'flame',
    name: 'Flame',
    rim: '#ff5a6a',
    glow: 'rgba(255,90,106,0.35)',
    pattern: 'none',
    patternColor: '#000',
    unlock: { streak: 3 },
  },
  {
    id: 'night',
    name: 'Night Sky',
    rim: '#6f5bd6',
    glow: 'rgba(111,91,214,0.4)',
    pattern: 'stars',
    patternColor: 'rgba(255,255,255,0.7)',
    unlock: { streak: 7 },
  },
  {
    id: 'royal',
    name: 'Royal',
    rim: '#b05bd6',
    glow: 'rgba(255,215,94,0.45)',
    pattern: 'shine',
    patternColor: 'rgba(255,240,200,0.6)',
    unlock: { streak: 14 },
  },
];

export function skinById(id: string): SkinDef {
  return SKINS.find((s) => s.id === id) ?? SKINS[0]!;
}

export function isSkinUnlocked(save: SaveData, skin: SkinDef): boolean {
  const { stars, streak } = skin.unlock;
  if (stars !== undefined && totalStars(save) < stars) return false;
  if (streak !== undefined && save.daily.bestStreak < streak) return false;
  return true;
}

export function unlockedSkins(save: SaveData): string[] {
  return SKINS.filter((s) => isSkinUnlocked(save, s)).map((s) => s.id);
}

/** The skin to draw: the equipped one if it's (still) unlocked, else Classic. */
export function activeSkin(save: SaveData): SkinDef {
  const s = skinById(save.skin);
  return isSkinUnlocked(save, s) ? s : SKINS[0]!;
}

export function unlockText(skin: SkinDef): string {
  if (skin.unlock.stars !== undefined) return `${skin.unlock.stars} stars`;
  if (skin.unlock.streak !== undefined) return `${skin.unlock.streak}-day streak`;
  return 'Always yours';
}

/** Skins in `after` that weren't in `before` (for "new skin!" messages). */
export function newlyUnlocked(before: readonly string[], after: readonly string[]): SkinDef[] {
  return after.filter((id) => !before.includes(id)).map(skinById);
}
