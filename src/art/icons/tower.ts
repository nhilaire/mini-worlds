// Icon of the game « tower » (12×12): a wobbly stack of coloured floors on a brown base, shown on its world card,
// Game sheet and Result.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', r: 'red', o: 'orange', y: 'yellow', g: 'green', b: 'brown' },
  rows: [
    '.....kkkk...',
    '.....kggk...',
    '.....kkkk...',
    '....kkkkkk..',
    '....kyyyyk..',
    '...kkkkkkk..',
    '...kooooook.',
    '..kkkkkkkkk.',
    '..krrrrrrrk.',
    '.kkkkkkkkkk.',
    '.kbbbbbbbbbk',
    '.kkkkkkkkkkk',
  ],
};
