// Icon of the game « trail » (12×12): a winding golden thread from a green start to a door, past a purple gem.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', g: 'green', y: 'yellow', p: 'purple', w: 'white', b: 'brown', d: 'darkBrown', s: 'grey' },
  rows: [
    '.......kkkk.',
    '.......kbbk.',
    '..kpk..kbbk.',
    '.kpwpk.kbyk.',
    '..kpk..kbbk.',
    '...y...kddk.',
    '...yyyyyy...',
    '.........ss.',
    'kk.......ss.',
    'kgk.........',
    'kgyyyyyy....',
    'kk.....y....',
  ],
};
