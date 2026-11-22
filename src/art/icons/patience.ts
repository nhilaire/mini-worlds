// Icon of the game « patience » (12×12): a column of three overlapping cards (red pips) above the pile's card with
// a dark pip.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', w: 'white', r: 'red', l: 'light' },
  rows: [
    'kkkkkkk.....',
    'kwrwwwk.....',
    'kkkkkkk.....',
    'kwrwwwk.....',
    'kkkkkkk.....',
    'kwrwwwkkkkkk',
    'kwwwwwkklllk',
    'kwwrwwkklklk',
    'kwrrrwkkkkkk',
    'kwwrwwkklklk',
    'kwwwwwkklllk',
    'kkkkkkkkkkkk',
  ],
};
