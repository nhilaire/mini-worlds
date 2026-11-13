// Icon of the game « twentyone » (12×12): a face-down card behind a card with a heart, shown on its world card,
// Game sheet and Result.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', b: 'blue', d: 'darkBlue', w: 'white', r: 'red' },
  rows: [
    'kkkkkkkk....',
    'kbdbdbdk....',
    'kdbkkkkkkkkk',
    'kbdkwwwwwwwk',
    'kdbkwrrwrrwk',
    'kbdkwrrrrrwk',
    'kdbkwwrrrwwk',
    'kbdkwwwrwwwk',
    'kkkkwwwwwwwk',
    '...kwwwwwwwk',
    '...kwwwwwwwk',
    '...kkkkkkkkk',
  ],
};
