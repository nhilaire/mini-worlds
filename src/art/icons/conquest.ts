// Icon of the game « conquest » (12×12), shown on its world card, Game sheet and Result: a blue flag and a red flag
// planted face to face on a hill.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', b: 'blue', B: 'darkBlue', r: 'red', R: 'darkRed', g: 'green', G: 'darkGreen', w: 'white' },
  rows: [
    '.k........k.',
    '.kbbb..rrrk.',
    '.kbwbb.rwrk.',
    '.kbbbBrrrRk.',
    '.kbbB..RrRk.',
    '.k........k.',
    '.k........k.',
    '.k...gg...k.',
    '.k.gggggg.k.',
    '.kggggggggk.',
    'gggggggggGGG',
    'ggggggGGGGGG',
  ],
};
