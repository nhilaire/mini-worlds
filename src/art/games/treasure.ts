// Pixel sprites of Chasse au Trésor (7×7): one symbol per band, drawn on the band's own colour so that a hole reads
// without colour too: brûlant = flame (red), chaud = sun (orange), tiède = wave (yellow), froid = snowflake (blue),
// trésor = chest. `BAND_COLORS` is the background of a dug cell.
import type { PaletteColor } from '../palette';
import type { Sprite } from '../sprites';
import type { Band } from '../../game/treasure/engine';

export const BAND_COLORS: Readonly<Record<Band, PaletteColor>> = {
  found: 'darkBrown',
  burning: 'red',
  hot: 'orange',
  warm: 'yellow',
  cold: 'blue',
};

export const BAND_SPRITES: Readonly<Record<Band, Sprite>> = {
  burning: {
    legend: { w: 'white', y: 'yellow' },
    rows: ['...w...', '..ww...', '..www.w', '.wwwww.', 'wwwywww', 'wwyyyww', '.wwwww.'],
  },
  hot: {
    legend: { k: 'outline' },
    rows: ['...k...', '.k...k.', '..kkk..', 'k.kkk.k', '..kkk..', '.k...k.', '...k...'],
  },
  warm: {
    legend: { k: 'outline' },
    rows: ['.......', '.kk....', 'k..k..k', '....kk.', '.kk....', 'k..k..k', '....kk.'],
  },
  cold: {
    legend: { w: 'white' },
    rows: ['w..w..w', '.w.w.w.', '..www..', 'www.www', '..www..', '.w.w.w.', 'w..w..w'],
  },
  found: {
    legend: { k: 'outline', y: 'yellow', o: 'darkYellow' },
    rows: ['.......', '.kkkkk.', 'koooook', 'kkkykkk', 'kooyook', 'koooook', 'kkkkkkk'],
  },
};
