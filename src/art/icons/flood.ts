// Icon of the game « flood » (12×12), shown on its world card, Game sheet and Result: a blue tide with white foam
// spreading from the top-left corner over a grid of bubble colours.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', b: 'blue', w: 'white', r: 'red', y: 'yellow', g: 'green', p: 'purple' },
  rows: [
    '............',
    '.kkkkkkkkkk.',
    '.kbbbbbbrrk.',
    '.kbwwbbbrrk.',
    '.kbbbbbyygk.',
    '.kbbbbyyggk.',
    '.kbwbbppggk.',
    '.kbbbrppyyk.',
    '.kbbbrrryyk.',
    '.kggpprryyk.',
    '.kkkkkkkkkk.',
    '............',
  ],
};
