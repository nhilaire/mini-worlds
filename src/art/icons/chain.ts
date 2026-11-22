// Icon of the game « chain » (12×12): three number tiles of the same colour linked by a golden chain, the last one
// (bottom right) turned into a bigger orange tile.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', s: 'sky', w: 'white', y: 'yellow', o: 'orange', d: 'darkOrange' },
  rows: [
    'kkkk........',
    'kssk........',
    'kswk........',
    'kkkky.......',
    '....yy......',
    '....kkkk....',
    '....kssk....',
    '....kswkyy..',
    '....kkkkkkkk',
    '.......ykook',
    '.......ykowk',
    '........kddk',
  ],
};
