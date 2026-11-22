// Board sprites of Couleur Éclair (12×12 each): one shape per colour, so that colour is never the only cue - a red
// round, a blue square, a yellow triangle. The runner and the doors are drawn with them.
import type { Colour } from '../../game/dash/engine';
import type { Sprite } from '../sprites';

export const ROUND: Sprite = {
  legend: { k: 'outline', r: 'red', R: 'darkRed', w: 'light' },
  rows: [
    '....kkkk....',
    '..kkrrrrkk..',
    '.krwrrrrrrk.',
    '.krrrrrrrrk.',
    'krrrrrrrrrrk',
    'krrrrrrrrrrk',
    'krrrrrrrrrRk',
    'krrrrrrrrrRk',
    '.krrrrrrrRk.',
    '.krrrrrRRRk.',
    '..kkRRRRkk..',
    '....kkkk....',
  ],
};

export const SQUARE: Sprite = {
  legend: { k: 'outline', b: 'blue', B: 'darkBlue', w: 'light' },
  rows: [
    'kkkkkkkkkkkk',
    'kbbbbbbbbbbk',
    'kbwbbbbbbbbk',
    'kbbbbbbbbbbk',
    'kbbbbbbbbbbk',
    'kbbbbbbbbbbk',
    'kbbbbbbbbbbk',
    'kbbbbbbbbbBk',
    'kbbbbbbbbbBk',
    'kbbbbbbbbBBk',
    'kbBBBBBBBBBk',
    'kkkkkkkkkkkk',
  ],
};

export const TRIANGLE: Sprite = {
  legend: { k: 'outline', y: 'yellow', Y: 'darkYellow', w: 'light' },
  rows: [
    '.....kk.....',
    '....kyyk....',
    '....kyyk....',
    '...kyyyyk...',
    '...kywyyk...',
    '..kyyyyyyk..',
    '..kyyyyyyk..',
    '.kyyyyyyyYk.',
    '.kyyyyyyyYk.',
    'kyyyyyyyYYYk',
    'kyYYYYYYYYYk',
    'kkkkkkkkkkkk',
  ],
};

/** The shape of each colour. */
export const SHAPES: Record<Colour, Sprite> = { red: ROUND, blue: SQUARE, yellow: TRIANGLE };
