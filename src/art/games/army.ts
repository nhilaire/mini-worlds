// Board sprites of Armée de Poche (12×12 each): a soldier of the pocket army and the fort at the end of the road.
import type { Sprite } from '../sprites';

export const SOLDIER: Sprite = {
  legend: { k: 'outline', g: 'darkGreen', l: 'light', y: 'yellow', b: 'brown', s: 'grey' },
  rows: [
    '....kkkk....',
    '...kggggk...',
    '..kggggggk..',
    '..kllllllk..',
    '..klkllklk.s',
    '...kllllk..s',
    '..kggggggk.s',
    '.kggyyyyggks',
    '.kggggggggk.',
    '..kggggggk..',
    '..kbk..kbk..',
    '..kkk..kkk..',
  ],
};

export const FORT: Sprite = {
  legend: { k: 'outline', r: 'red', w: 'grey', d: 'darkGrey', b: 'darkBrown' },
  rows: [
    '.....kr.....',
    '.....krr....',
    '.....k......',
    'kk.kk.kk.kk.',
    'kwkkwkkwkkwk',
    'kwwwwwwwwwwk',
    'kwdwwwwwwdwk',
    'kwwwwkkwwwwk',
    'kwwwkbbkwwwk',
    'kwdwkbbkwdwk',
    'kwwwkbbkwwwk',
    'kkkkkkkkkkkk',
  ],
};
