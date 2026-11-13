// Icon of the game « candles » (12×12): a round cake with candles and their flames, shown on its world card,
// Game sheet and Result.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', y: 'yellow', p: 'pink', s: 'sky', b: 'brown', l: 'light' },
  rows: [
    '..y...y...y.',
    '..k...k...k.',
    '..p...s...p.',
    '..p.kkkkk.p.',
    '..kkllllllk.',
    '.kllllllllk.',
    'kbllllllllbk',
    'kbbbbbbbbbbk',
    'kbbbbbbbbbbk',
    'kbbbbbbbbbbk',
    '.kbbbbbbbbk.',
    '..kkkkkkkk..',
  ],
};
