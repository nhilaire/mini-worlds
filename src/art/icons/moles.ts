// Icon of the game « moles » (12×12), shown on its world card, Game sheet and Result: a mole popping out of its
// hole in the grass.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', b: 'brown', d: 'darkBrown', p: 'pink', g: 'green', G: 'darkGreen' },
  rows: [
    '............',
    '....kkkk....',
    '...kbbbbk...',
    '..kbkbbkbk..',
    '..kbbppbbk..',
    '..kbbbbbbk..',
    '.gkbbbbbbkg.',
    'ggkddddddkgg',
    'gkddddddddkg',
    'gGkkkkkkkkGg',
    'gggggggggggg',
    'GGGGGGGGGGGG',
  ],
};
