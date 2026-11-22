// Icon of the game « pattern » (12×12): three tiles of a repeating sequence above a question mark on a dark tile,
// shown on its world card, Game sheet and Result.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', b: 'darkPurple', y: 'yellow', s: 'sky', w: 'light' },
  rows: [
    '.kkkkkkkkkk.',
    'kbbbbbbbbbbk',
    'kbyybssbyybk',
    'kbyybssbyybk',
    'kbbbbbbbbbbk',
    'kbbbwwwwbbbk',
    'kbbwwbbwwbbk',
    'kbbbbbwwbbbk',
    'kbbbbwwbbbbk',
    'kbbbbbbbbbbk',
    'kbbbbwwbbbbk',
    '.kkkkkkkkkk.',
  ],
};
