// Icon of the game « cardline » (12×12): three cards in a rising line, with one, two and three heart pips.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', w: 'white', r: 'red' },
  rows: [
    '........kkkk',
    '........kwrk',
    '........kwwk',
    '....kkkkkwrk',
    '....kwrkkwwk',
    '....kwwkkwrk',
    'kkkkkwrkkwwk',
    'kwwkkwwkkwwk',
    'kwrkkwwkkwwk',
    'kwwkkwwkkwwk',
    'kwwkkwwkkwwk',
    'kkkkkkkkkkkk',
  ],
};
