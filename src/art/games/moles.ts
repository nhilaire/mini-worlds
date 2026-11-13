// Board sprites of « Champ de Taupes » (8×8): the flag planted on a covered cell and the mole shown at the end.
import type { Sprite } from '../sprites';

export const FLAG: Sprite = {
  legend: { k: 'outline', r: 'red', R: 'darkRed' },
  rows: ['..k.....', '..kkkk..', '..krrRk.', '..krrrRk', '..krrRk.', '..kkkk..', '..k.....', '.kkkk...'],
};

export const MOLE: Sprite = {
  legend: { k: 'outline', b: 'brown', d: 'darkBrown', p: 'pink', w: 'light' },
  rows: ['..kkkk..', '.kbbbbk.', 'kbkbbkbk', 'kbbppbbk', 'kbbwwbbk', 'kdbbbbdk', '.kddddk.', '..kkkk..'],
};
