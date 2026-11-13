// Icon of the game « fruit » (12×12), shown on its world card, Game sheet and Result: two cherries on their stems.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', g: 'green', G: 'darkGreen', w: 'white', r: 'red', R: 'darkRed' },
  rows: [
    '.......Gg...',
    '......gG....',
    '.....g..g...',
    '....g....g..',
    '...g.....g..',
    '.kkk....kkk.',
    'kwrrk..kwrrk',
    'krrrk..krrrk',
    'krrRk..krrRk',
    'kRRRk..kRRRk',
    '.kkk....kkk.',
    '............',
  ],
};
