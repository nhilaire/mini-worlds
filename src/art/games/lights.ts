// Board sprites of « Lucioles » (10×10): a lit firefly (glowing orb) and a firefly switched off.
import type { Sprite } from '../sprites';

export const FIREFLY_ON: Sprite = {
  legend: { k: 'outline', y: 'yellow', w: 'white', d: 'darkYellow' },
  rows: [
    '...kkkk...',
    '..kddddk..',
    '.kdyyyydk.',
    'kdyywwyydk',
    'kdywwwwydk',
    'kdywwwwydk',
    'kdyywwyydk',
    '.kdyyyydk.',
    '..kddddk..',
    '...kkkk...',
  ],
};

export const FIREFLY_OFF: Sprite = {
  legend: { k: 'outline', g: 'darkGrey', l: 'grey' },
  rows: [
    '..........',
    '..........',
    '...k..k...',
    '....kk....',
    '...kggk...',
    '...kglk...',
    '...kggk...',
    '....kk....',
    '..........',
    '..........',
  ],
};
