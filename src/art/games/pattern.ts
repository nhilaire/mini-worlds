// Board sprites of Suite Logique. The five symbols of the level-1 sequences (12×12 each) are told by their shape -
// round, square, triangle, star, diamond - and each also has its own colour, so that colour is never the only cue.
// The two marks (8×8) show a right (check) or a wrong (cross) answer on the button that was tapped.
import type { SymbolId } from '../../game/pattern/engine';
import type { Sprite } from '../sprites';

const CIRCLE: Sprite = {
  legend: { k: 'outline', r: 'red', R: 'darkRed', w: 'light' },
  rows: [
    '....kkkk....',
    '..kkrrrrkk..',
    '.krrrrrrrrk.',
    '.krwwrrrrrk.',
    'krrwrrrrrrrk',
    'krrrrrrrrrrk',
    'krrrrrrrrrRk',
    'krrrrrrrrrRk',
    '.krrrrrrrRk.',
    '.krrrrrRRRk.',
    '..kkRRRRkk..',
    '....kkkk....',
  ],
};

const SQUARE: Sprite = {
  legend: { k: 'outline', b: 'blue', B: 'darkBlue', w: 'light' },
  rows: [
    'kkkkkkkkkkkk',
    'kbbbbbbbbbbk',
    'kbwwbbbbbbbk',
    'kbwbbbbbbbbk',
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

const TRIANGLE: Sprite = {
  legend: { k: 'outline', g: 'green', G: 'darkGreen', w: 'light' },
  rows: [
    '.....kk.....',
    '....kggk....',
    '....kggk....',
    '...kggggk...',
    '...kgwggk...',
    '..kggggggk..',
    '..kggggggk..',
    '.kggggggggk.',
    '.kgggggggGk.',
    'kggggggggGGk',
    'kgGGGGGGGGGk',
    'kkkkkkkkkkkk',
  ],
};

const STAR: Sprite = {
  legend: { k: 'outline', y: 'yellow', Y: 'darkYellow' },
  rows: [
    '.....kk.....',
    '....kyyk....',
    '....kyyk....',
    'kkkkyyyykkkk',
    'kyyyyyyyyyyk',
    '.kyyyyyyyYk.',
    '..kyyyyyYk..',
    '..kyyyyyYk..',
    '.kyyyyyyyYk.',
    '.kyyYkkyYYk.',
    'kyYkk..kkYYk',
    'kkk......kkk',
  ],
};

const DIAMOND: Sprite = {
  legend: { k: 'outline', p: 'purple', P: 'darkPurple', w: 'light' },
  rows: [
    '.....kk.....',
    '....kppk....',
    '...kppppk...',
    '..kpwppppk..',
    '.kpwpppppPk.',
    'kppppppppPPk',
    'kpppppppPPPk',
    '.kpppppPPPk.',
    '..kpppPPPk..',
    '...kpPPPk...',
    '....kPPk....',
    '.....kk.....',
  ],
};

export const SYMBOL_SPRITES: Record<SymbolId, Sprite> = { circle: CIRCLE, square: SQUARE, triangle: TRIANGLE, star: STAR, diamond: DIAMOND };

/** Mark of a right answer. */
export const CHECK_MARK: Sprite = {
  legend: { k: 'outline', w: 'white' },
  rows: ['......kk', '.....kwk', '....kwwk', 'kk.kwwk.', 'kwkwwk..', 'kwwwk...', '.kwk....', '..k.....'],
};

/** Mark of a wrong answer. */
export const CROSS_MARK: Sprite = {
  legend: { k: 'outline', w: 'white' },
  rows: ['kk....kk', 'kwk..kwk', '.kwkkwk.', '..kwwk..', '..kwwk..', '.kwkkwk.', 'kwk..kwk', 'kk....kk'],
};
