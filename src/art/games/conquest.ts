// Pixel sprites of Bataille de Nombres (7×7): one emblem per owner, drawn in white on the owner's colour so that a
// territory reads without colour too: the player = star (blue), the enemy = crossed swords (red), neutral = ring
// (grey). `OWNER_COLORS` is the background of a territory.
import type { PaletteColor } from '../palette';
import type { Sprite } from '../sprites';
import type { Owner } from '../../game/conquest/engine';

export const OWNER_COLORS: Readonly<Record<Owner, PaletteColor>> = {
  player: 'blue',
  enemy: 'red',
  neutral: 'darkGrey',
};

export const OWNER_EMBLEMS: Readonly<Record<Owner, Sprite>> = {
  player: {
    legend: { w: 'white' },
    rows: ['...w...', '...w...', 'wwwwwww', '.wwwww.', '..www..', '.ww.ww.', '.w...w.'],
  },
  enemy: {
    legend: { w: 'white' },
    rows: ['w.....w', '.w...w.', '..w.w..', '...w...', '..w.w..', 'ww...ww', 'ww...ww'],
  },
  neutral: {
    legend: { w: 'white' },
    rows: ['.......', '..www..', '.w...w.', '.w...w.', '.w...w.', '..www..', '.......'],
  },
};
