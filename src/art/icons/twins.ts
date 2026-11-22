// Icon of the game « twins » (12×12): the blue round and the orange square side by side, a wall between them and
// their two hollow exits below.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', g: 'grey', b: 'blue', s: 'darkBlue', o: 'orange', d: 'darkOrange', w: 'white' },
  rows: [
    '.kkk..kkkkk.',
    'kbwbk.kowook',
    'kbbbkgkooook',
    'ksssk.kddddk',
    '.kkk.gkkkkk.',
    '.....g......',
    '............',
    '.bbb..ooooo.',
    'b...b.o...o.',
    'b...bgo...o.',
    'b...b.o...o.',
    '.bbb..ooooo.',
  ],
};
