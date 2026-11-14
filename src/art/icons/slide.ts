// Icon of the game « slide » (12×12): a board with a blue vertical block and the red block sliding to the exit.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', g: 'grey', b: 'blue', s: 'darkBlue', r: 'red', d: 'darkRed', w: 'white', y: 'yellow' },
  rows: [
    'kkkkkkkkkkkk',
    'kggggkbbkggk',
    'kggggkbbkggk',
    'kggggkbbkggk',
    'kkkkkksskkkk',
    'kkkkkkkkkkk.',
    'krrrrwrrrrky',
    'krrrrrrrrrky',
    'kddddddddddk',
    'kkkkkkkkkkk.',
    'kggggggggggk',
    'kkkkkkkkkkkk',
  ],
};
