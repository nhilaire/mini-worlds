// Pixel sprites of Glisse-Fusion (12×12): the eleven gems, each with its own shape and colour so that colour is never
// the only cue (caillou: small pebble, galet: flat oval, silex: sharp shard, quartz: tall crystal, ambre: drop,
// jade: ring, topaze: square cut, saphir: round cut, rubis: brilliant seen from the side, émeraude: long octagon,
// diamant: big rhombus), and the joker, a purple star.
import type { Sprite } from '../sprites';

/** Gems by level: GEM_SPRITES[level − 1], level 1 (caillou) to 11 (diamant). */
export const GEM_SPRITES: readonly Sprite[] = [
  // 1 caillou
  {
    legend: { k: 'outline', g: 'grey', d: 'darkGrey', w: 'light' },
    rows: ['............', '............', '............', '....kkkk....', '...kggggk...', '..kgwgggdk..', '..kggggddk..', '..kgggdddk..', '...kddddk...', '....kkkk....', '............', '............'],
  },
  // 2 galet
  {
    legend: { k: 'outline', b: 'brown', d: 'darkBrown', w: 'light' },
    rows: ['............', '............', '............', '...kkkkkk...', '.kkbbbbbbkk.', 'kbwwbbbbbbdk', 'kbbbbbbbbddk', '.kkbbbdddkk.', '...kkkkkk...', '............', '............', '............'],
  },
  // 3 silex
  {
    legend: { k: 'outline', w: 'grey', d: 'darkGrey', s: 'shade' },
    rows: ['............', '.....kk.....', '....kwdk....', '....kwdk....', '...kwdddk...', '...kwdddk...', '..kwdddssk..', '..kwddsssk..', '.kwdddssssk.', '.kddssssssk.', '.kkkkkkkkkk.', '............'],
  },
  // 4 quartz
  {
    legend: { k: 'outline', w: 'white', l: 'light', g: 'grey' },
    rows: ['.....kk.....', '....kwwk....', '...kwwllk...', '...kwwllk...', '...kwwllk...', '...kwwllk...', '...kwwllk...', '...kwwllk...', '...kwwlgk...', '...kwllgk...', '....klgk....', '.....kk.....'],
  },
  // 5 ambre
  {
    legend: { k: 'outline', o: 'orange', O: 'darkOrange', w: 'yellow' },
    rows: ['.....kk.....', '....kook....', '....kook....', '...kowook...', '...kowooOk..', '..kowoooOk..', '..kooooooOk.', '..kooooooOk.', '..koooooOOk.', '...koooOOk..', '....kkkkk...', '............'],
  },
  // 6 jade
  {
    legend: { k: 'outline', g: 'green', G: 'darkGreen', l: 'lime' },
    rows: ['............', '...kkkkkk...', '..kggggggk..', '.kgglgggGGk.', '.kglgkkgGGk.', '.kggk..kgGk.', '.kggk..kgGk.', '.kgggkkgGGk.', '.kggggGGGGk.', '..kgGGGGGk..', '...kkkkkk...', '............'],
  },
  // 7 topaze
  {
    legend: { k: 'outline', y: 'yellow', Y: 'darkYellow', w: 'white' },
    rows: ['............', '.kkkkkkkkkk.', '.kwyyyyyyYk.', '.kywwwwwYYk.', '.kywyyyyYYk.', '.kywyyyyYYk.', '.kywyyyyYYk.', '.kywyyyyYYk.', '.kyYYYYYYYk.', '.kYYYYYYYYk.', '.kkkkkkkkkk.', '............'],
  },
  // 8 saphir
  {
    legend: { k: 'outline', b: 'blue', B: 'darkBlue', w: 'white', s: 'sky' },
    rows: ['....kkkk....', '..kkbbbbkk..', '.kbbwbbbbBk.', '.kbwbbbbbBk.', 'kbbbbbbbbBBk', 'kbbbbssbbBBk', 'kbbbbssbbBBk', 'kbbbbbbbBBBk', '.kbbbbbBBBk.', '.kBbbBBBBBk.', '..kkBBBBkk..', '....kkkk....'],
  },
  // 9 rubis
  {
    legend: { k: 'outline', r: 'red', R: 'darkRed', w: 'white' },
    rows: ['............', '..kkkkkkkk..', '.krrwrrrrRk.', 'krrwrrrrrRRk', 'kkkkkkkkkkkk', 'krrrrrrrRRRk', '.krrrrrrRRk.', '..krrrrRRk..', '...krrrRk...', '....krRk....', '.....kk.....', '............'],
  },
  // 10 émeraude
  {
    legend: { k: 'outline', l: 'lime', g: 'green', G: 'darkGreen', w: 'white' },
    rows: ['...kkkkkk...', '..kllllllk..', '.kllwwwwlgk.', '.klwllllggk.', '.klwllllggk.', '.klwllllggk.', '.klwllllggk.', '.klwllllggk.', '.klwllllggk.', '.klggggggGk.', '..kgggggGk..', '...kkkkkk...'],
  },
  // 11 diamant
  {
    legend: { k: 'outline', w: 'white', s: 'sky', b: 'blue' },
    rows: ['.....kk.....', '....kwwk....', '...kwwssk...', '..kwwsssbk..', '.kwwssssbbk.', 'kwwsssssbbbk', 'kssssssbbbbk', '.kssssbbbbk.', '..kssbbbbk..', '...ksbbbk...', '....kbbk....', '.....kk.....'],
  },
];

/** The joker: a five-point star. */
export const JOKER_SPRITE: Sprite = {
  legend: { k: 'outline', p: 'purple', w: 'pink' },
  rows: ['.....kk.....', '.....kpk....', '....kppk....', 'kkkkkppkkkkk', 'kpwppppppppk', '.kpwppppppk.', '..kppppppk..', '..kppppppk..', '.kpppkkpppk.', '.kppk..kppk.', 'kppk....kppk', 'kkk......kkk'],
};
