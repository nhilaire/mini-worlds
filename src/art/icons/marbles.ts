// Icon of the game « marbles » (12×12): two glass tubes of coloured marbles, shown on its world card, Game sheet and
// Result.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', r: 'red', b: 'blue', y: 'yellow', g: 'green' },
  rows: [
    '............',
    '.k..k..k..k.',
    '.kyyk..k..k.',
    '.kyyk..k..k.',
    '.kbbk..kyyk.',
    '.kbbk..kyyk.',
    '.krrk..krrk.',
    '.krrk..krrk.',
    '.krrk..kggk.',
    '.krrk..kggk.',
    '..kk....kk..',
    '............',
  ],
};
