// Icon of the game « shot » (12×12): a catapult on the left throws its ball in an arc onto a flagged target.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', s: 'shade', o: 'brown', r: 'red', y: 'yellow', w: 'white', g: 'darkGreen' },
  rows: [
    '............',
    '....k.k.....',
    '..k.....k...',
    '.k........k.',
    'ss..........',
    'ss.......r..',
    '.o.......rr.',
    '.oo......r..',
    '.ooo...yyryy',
    'kkkkk.wwrrww',
    'gggggggggggg',
    '.gggggggggg.',
  ],
};
