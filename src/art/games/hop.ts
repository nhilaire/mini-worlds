// Board sprites of « Saute-Lapin »: the bunny seen from the side, facing right (8×8).
import type { Sprite } from '../sprites';

export const BUNNY: Sprite = {
  legend: { k: 'outline', w: 'white', p: 'pink' },
  rows: ['..k.k...', '.kwkwk..', '.kwkwk..', '.kwwwwk.', 'kwwwkwwk', 'kwwwwwpk', 'kwwwwwk.', '.kk.kk..'],
};

/** A small bird flying left (10×6, drawn 1 unit wide). */
export const BIRD: Sprite = {
  legend: { k: 'outline', b: 'sky', y: 'yellow', w: 'white' },
  rows: ['....kk....', 'kk.kbbk...', 'kykbwbbkbk', '.kbbbbbbk.', '..kbbbbk..', '...k..k...'],
};
