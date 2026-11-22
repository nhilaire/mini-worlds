// Icon of the game « hands » (12×12): two cards held together, a diamond in the corner of the first and a spade on
// the second, shown on its world card, Game sheet and Result.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', w: 'white', r: 'red' },
  rows: [
    'kkkkkkkk....',
    'kwwwwwwk....',
    'kwrwwwwk....',
    'krrrkkkkkkkk',
    'kwrwkwwwwwwk',
    'kwwwkwwkkwwk',
    'kwwwkwkkkkwk',
    'kwwwkwkkkkwk',
    'kkkkkwwkkwwk',
    '....kwwwwwwk',
    '....kwwwwwwk',
    '....kkkkkkkk',
  ],
};
