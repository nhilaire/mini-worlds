// Icon of the game « defense » (12×12): a turret on its stone base, barrel up, firing a shot, shown on its world
// card, Game sheet and Result.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', b: 'blue', d: 'darkBlue', s: 'grey', g: 'darkGrey', y: 'yellow', o: 'orange' },
  rows: [
    '.....yy.....',
    '.....oo.....',
    '....kkkk....',
    '....kssk....',
    '....kssk....',
    '..kkkssskk..',
    '.kbbbssbbbk.',
    '.kbbbbbbbbk.',
    '.kbdbbbbdbk.',
    '.kkkkkkkkkk.',
    'kggsggsggsgk',
    'kkkkkkkkkkkk',
  ],
};
