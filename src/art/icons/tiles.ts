// Icon of the game « tiles » (12×12): a cut blue gem and the yellow spark of a merge.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', s: 'sky', b: 'blue', w: 'white', y: 'yellow' },
  rows: [
    '.........y..',
    '........yyy.',
    '..kkkkkk.y..',
    '.kswsssbk...',
    'kswssssbbk..',
    'kkkkkkkkkk..',
    'ksssssbbbk..',
    '.kssssbbk...',
    '..ksssbk....',
    '...kssk.....',
    '....kk......',
    '............',
  ],
};
