// Board sprites of « Fil d'Ariane » (10×10): the start flag, the exit door, a gem and a rock.
import type { Sprite } from '../sprites';

export const START: Sprite = {
  legend: { k: 'outline', g: 'green', l: 'lime', b: 'brown' },
  rows: [
    '..k.......',
    '..kkkkk...',
    '..kgggglk.',
    '..kggglk..',
    '..kgglk...',
    '..kkkk....',
    '..k.......',
    '..k.......',
    '.kbk......',
    'kkkkk.....',
  ],
};

export const EXIT: Sprite = {
  legend: { k: 'outline', b: 'brown', d: 'darkBrown', y: 'yellow' },
  rows: [
    '..kkkkkk..',
    '.kbbbbbbk.',
    'kbbdbbdbbk',
    'kbbdbbdbbk',
    'kbbbbbbbbk',
    'kbbbbbbybk',
    'kbbdbbdbbk',
    'kbbdbbdbbk',
    'kbbbbbbbbk',
    'kkkkkkkkkk',
  ],
};

export const GEM: Sprite = {
  legend: { k: 'outline', p: 'purple', d: 'darkPurple', w: 'white' },
  rows: [
    '..........',
    '..kkkkkk..',
    '.kwppppdk.',
    'kwwppppddk',
    'kppppppddk',
    '.kpppppdk.',
    '..kppddk..',
    '...kpdk...',
    '....kk....',
    '..........',
  ],
};

export const ROCK: Sprite = {
  legend: { k: 'outline', g: 'grey', d: 'darkGrey', l: 'light' },
  rows: [
    '..........',
    '...kkkk...',
    '..kllggk..',
    '.klggggdk.',
    'kgggggggdk',
    'kggggggddk',
    'kgggggdddk',
    '.kggdddddk',
    '..kkkkkkk.',
    '..........',
  ],
};
