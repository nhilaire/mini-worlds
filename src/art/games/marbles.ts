// Board sprites of « Tri de Billes » (12×12): the marbles are the bubbles of Bulles en Folie (each colour has its own
// face, so colours are told apart without colour), plus a sixth, orange marble (tall eyes, round mouth) for puzzles of
// 6 colours.
import { BUBBLES, Sprite } from '../sprites';

const ORANGE: Sprite = {
  legend: { k: 'outline', b: 'orange', d: 'darkOrange', w: 'white', e: 'outline' },
  rows: [
    '....kkkk....',
    '..kkbbbbkk..',
    '.kbwbbbbbbk.',
    '.kwbbbbbbbk.',
    'kbbbbbbbbbbk',
    'kbbebbbbebbk',
    'kbbebeebebbk',
    'kbbbbeebbbdk',
    '.kbbbbbbbdk.',
    '.kbbbbbdddk.',
    '..kkddddkk..',
    '....kkkk....',
  ],
};

/** Sprite of each marble colour index (0..5), in the order of the engine. */
export const MARBLES: readonly Sprite[] = [BUBBLES.red, BUBBLES.yellow, BUBBLES.green, BUBBLES.blue, BUBBLES.purple, ORANGE];
