// Icon of the game « darts » (12×12): a round target with its rings and a dart stuck near the bull's eye, shown on
// its world card, Game sheet and Result.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', r: 'red', l: 'light', y: 'yellow', s: 'sky', g: 'grey' },
  rows: [
    '...kkkkk..ss',
    '.kkrrrrrkss.',
    '.krrlllrsgk.',
    'krrlllllgrrk',
    'krllrrrgllrk',
    'krllryglllrk',
    'krllrrrrllrk',
    'krrlllllllrk',
    '.krrlllllrk.',
    '.kkrrrrrrkk.',
    '...kkkkkk...',
    '............',
  ],
};
