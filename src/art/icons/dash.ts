// Icon of the game « dash » (12×12): a yellow lightning bolt between a blue square and a red round, shown on its
// world card, Game sheet and Result.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', y: 'yellow', b: 'blue', r: 'red' },
  rows: [
    'kkk...kkkk..',
    'kbk..kyyyk..',
    'kkk.kyyyk...',
    '...kyyyk....',
    '..kyyykkkk..',
    '..kyyyyyyk..',
    '..kkkkyyyk..',
    '.....kyyk...',
    '....kyyk....',
    '....kyk..kk.',
    '...kyk..krrk',
    '...kk....kk.',
  ],
};
