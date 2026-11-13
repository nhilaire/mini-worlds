// Pixel sprites drawn in code: each sprite is a grid of characters mapped to palette colours by its legend.
// '.' is always transparent. Sprites are rasterised once by the renderer (src/ui/pixel) and scaled with nearest
// sampling. Every game piece has its own shape, not only its own colour (colour-blind safe).
import { GAME_ICONS } from './gameIcons';
import { PaletteColor } from './palette';

export type Sprite = {
  legend: Readonly<Record<string, PaletteColor>>;
  rows: readonly string[];
};

export function spriteSize(sprite: Sprite): { width: number; height: number } {
  return { width: sprite.rows[0]?.length ?? 0, height: sprite.rows.length };
}

/** Problems with a sprite: ragged rows or characters missing from the legend. */
export function validateSprite(sprite: Sprite): string[] {
  const problems: string[] = [];
  const { width } = spriteSize(sprite);
  sprite.rows.forEach((row, i) => {
    if (row.length !== width) problems.push(`row ${i} has ${row.length} columns, expected ${width}`);
    for (const ch of row) if (ch !== '.' && !(ch in sprite.legend)) problems.push(`row ${i}: '${ch}' is not in the legend`);
  });
  if (width === 0) problems.push('empty sprite');
  return problems;
}

const K = 'outline' as const;

/** Generic 8×8 block tile; 'b' is tinted with the piece colour, 'l' lighter, 'd' darker (see renderer). */
export const BLOCK_TILE: Sprite = {
  legend: { k: K, b: 'white', l: 'light', d: 'shade' },
  rows: ['kkkkkkkk', 'kllllldk', 'klbbbbdk', 'klbbbbdk', 'klbbbbdk', 'klbbbbdk', 'kddddddk', 'kkkkkkkk'],
};

export type Veg = 'carrot' | 'tomato' | 'eggplant' | 'corn' | 'broccoli' | 'onion';

export const VEGETABLES: Record<Veg, Sprite> = {
  // Carrot: long orange triangle pointing down with green leaves (tall shape).
  carrot: {
    legend: { k: K, g: 'green', G: 'darkGreen', o: 'orange', O: 'darkOrange', w: 'light' },
    rows: [
      '....gkg.....',
      '...kgGgk....',
      '....kgk.....',
      '...koook....',
      '..kowooOk...',
      '..koooooOk..',
      '..kooooOOk..',
      '...koooOk...',
      '...kooOOk...',
      '....koOk....',
      '.....kOk....',
      '......k.....',
    ],
  },
  // Tomato: round red with a small green star (round shape).
  tomato: {
    legend: { k: K, g: 'green', r: 'red', R: 'darkRed', w: 'light' },
    rows: [
      '.....gkg....',
      '...kkgggkk..',
      '..krrrkrrrk.',
      '.krwrrrrrrRk',
      '.krrrrrrrrRk',
      'krrrrrrrrrRk',
      'krrrrrrrrRRk',
      'krrrrrrrRRRk',
      '.krrrrrRRRk.',
      '.kRrrrRRRRk.',
      '..kkRRRRkk..',
      '....kkkk....',
    ],
  },
  // Eggplant: tilted purple oval with a cap (oblong diagonal shape).
  eggplant: {
    legend: { k: K, g: 'green', G: 'darkGreen', p: 'purple', P: 'darkPurple', w: 'light' },
    rows: [
      '.........kg.',
      '........kGgk',
      '.......kGGk.',
      '......kppPk.',
      '.....kpwpPk.',
      '....kpppPPk.',
      '...kppppPk..',
      '..kpppppPk..',
      '.kppppPPk...',
      '.kpppPPk....',
      '.kPPPPk.....',
      '..kkkk......',
    ],
  },
  // Corn: yellow cob with green husk on both sides (vertical striped shape).
  corn: {
    legend: { k: K, g: 'green', G: 'darkGreen', y: 'yellow', Y: 'darkYellow', w: 'light' },
    rows: [
      '....kyyk....',
      '...kyYyYk...',
      '..gkYyYyYkg.',
      '.kgkyYyYykgk',
      '.kgkYyYyYkgk',
      '.kgkyYyYykgk',
      '.kGgkYyYkgGk',
      '.kGGgkykgGGk',
      '..kGGgkgGGk.',
      '...kGGgGGk..',
      '....kGGGk...',
      '.....kkk....',
    ],
  },
  // Broccoli: bumpy green crown on a pale stem (mushroom shape).
  broccoli: {
    legend: { k: K, g: 'green', G: 'darkGreen', l: 'lime', s: 'light', S: 'grey' },
    rows: [
      '...kkk.kkk..',
      '..kllgkglgk.',
      '.klgggggggk.',
      'kgggGggGgggk',
      'kggGGgGGGggk',
      'kgGGGGGGGGgk',
      '.kGGkGGkGGk.',
      '..kkkssskk..',
      '....kssSk...',
      '....kssSk...',
      '....ksSSk...',
      '.....kkk....',
    ],
  },
  // Onion: pale bulb with a pointed top and rings (teardrop shape).
  onion: {
    legend: { k: K, w: 'white', l: 'light', p: 'pink', P: 'darkGrey', g: 'lime' },
    rows: [
      '.....kgk....',
      '.....kgk....',
      '....kwlk....',
      '...kwwllk...',
      '..kwwlllpk..',
      '.kwwlllppPk.',
      '.kwlllppppk.',
      '.kwllpppPPk.',
      '.klllppPPPk.',
      '..klppPPPk..',
      '...kkPPkk...',
      '....kkkk....',
    ],
  },
};

export type BubbleColor = 'red' | 'yellow' | 'green' | 'blue' | 'purple';

const bubble = (body: PaletteColor, dark: PaletteColor, face: readonly string[]): Sprite => ({
  legend: { k: K, b: body, d: dark, w: 'white', e: 'outline' },
  rows: [
    '....kkkk....',
    '..kkbbbbkk..',
    '.kbwbbbbbbk.',
    '.kwbbbbbbbk.',
    'kbbbbbbbbbbk',
    `kbb${face[0]}bbk`,
    `kbb${face[1]}bbk`,
    `kbb${face[2]}bdk`,
    '.kbbbbbbbdk.',
    '.kbbbbbdddk.',
    '..kkddddkk..',
    '....kkkk....',
  ],
});

/** Five bubbles, each with its own face so that colour is never the only cue. */
export const BUBBLES: Record<BubbleColor, Sprite> = {
  red: bubble('red', 'darkRed', ['e....e', '......', '.eeee.']), // smile
  yellow: bubble('yellow', 'darkYellow', ['e....e', '......', 'eeeeee']), // flat mouth
  green: bubble('green', 'darkGreen', ['ee..ee', '......', '..ee..']), // squint
  blue: bubble('blue', 'darkBlue', ['e....e', '..ee..', '.e..e.']), // open mouth
  purple: bubble('purple', 'darkPurple', ['.e..e.', 'e....e', '.eeee.']), // star eyes
};

const icon = (legend: Record<string, PaletteColor>, rows: string[]): Sprite => ({ legend: { k: K, ...legend }, rows });

/** World icons, 12×12. */
export const WORLD_ICONS = {
  arcade: icon({ r: 'red', w: 'light', y: 'yellow' }, ['............', '...kkkkkk...', '..krrrrrrk..', '.krrwwwwrrk.', '.krwkkkkwrk.', '.krwkyykwrk.', '.krwkyykwrk.', '.krwkkkkwrk.', '.krrwwwwrrk.', '..krrkkrrk..', '...kkkkkk...', '............']),
  puzzle: icon({ g: 'green', G: 'darkGreen' }, ['............', '.kkkkk.kkk..', '.kgggkkgGk..', '.kggggggGk..', '.kkkgkkkkk..', '...kgk......', '.kkkgkkkkk..', '.kgggggggk..', '.kGGGkGGGk..', '.kkkkk.kkk..', '............', '............']),
  strategy: icon({ b: 'darkBlue', s: 'grey', w: 'light' }, ['.....kk.....', '....kwwk....', '....kssk....', '...kkbbkk...', '...kbbbbk...', '...kbssbk...', '...kbbbbk...', '...kbbbbk...', '..kkbbbbkk..', '.kbbbbbbbbk.', '.kkkkkkkkkk.', '............']),
  cards: icon({ p: 'purple', w: 'light', r: 'red' }, ['............', '..kkkkkk....', '..kwwwwkkk..', '..kwrwwkwwk.', '..kwwwwkwwk.', '..kwwwwkwwk.', '..kwwwwkwwk.', '..kwwrwkwwk.', '..kwwwwkwwk.', '..kkkkkkwwk.', '....kkkkkk..', '............']),
  bubbles: icon({ s: 'sky', w: 'white', b: 'blue' }, ['............', '...kkk......', '..kswsk.kk..', '.kswsssksbk.', '.kssssskbbk.', '.kssssbk.k..', '..kbbbk.....', '...kkk.kkk..', '......kswsk.', '......kssbk.', '.......kkk..', '............']),
  skill: icon({ r: 'red', w: 'light', y: 'yellow' }, ['............', '...kkkkkk...', '..krrrrrrk..', '.krwwwwwwrk.', '.krwrrrrwrk.', '.krwrkkrwrk.', '.krwrkkrwrk.', '.krwrrrrwrk.', '.krwwwwwwrk.', '..krrrrrrk..', '...kkkkkk...', '............']),
  building: icon({ b: 'brown', o: 'orange', g: 'grey' }, ['............', '.......kk...', '......kook..', '.....kook...', '....kook....', '.kkkkook....', '.kggkok.....', '.kgggkk.....', '.kggbbk.....', '.kbbbbk.....', '.kkkkkk.....', '............']),
  exploration: icon({ l: 'lime', g: 'darkGreen', w: 'light' }, ['............', '.kkkkkkkkkk.', '.klllllllgk.', '.klkkkkklgk.', '.klkwwwklgk.', '.klkwkkklgk.', '.klkwklllgk.', '.klkwkkkkgk.', '.klkwwwwwgk.', '.kggggggggk.', '.kkkkkkkkkk.', '............']),
  memory: icon({ p: 'pink', w: 'light', r: 'red' }, ['............', '..kkk..kkk..', '.kpppkkpppk.', '.kpwpppppppk', '.kppppppppk.', '.kppppppppk.', '..kpppppppk.', '...kpppppk..', '....kpppk...', '.....kpk....', '......k.....', '............']),
  challenges: icon({ y: 'yellow', o: 'darkYellow', w: 'light' }, ['.....kk.....', '....kyyk....', '....kyyk....', '.kkkkyykkkk.', 'kyyyyyyyyyyk', '.kyyyyyyyyk.', '..kyyyyyyk..', '...kyyyyk...', '...kyyyyk...', '..kyykkyyk..', '.kkkk..kkkk.', '............']),
} as const satisfies Record<string, Sprite>;

/** Small UI glyphs, 8×8. */
export const UI_SPRITES = {
  coin: icon({ y: 'yellow', o: 'darkYellow', w: 'light' }, ['..kkkk..', '.kyyyyk.', 'kywyyyok', 'kyykkyok', 'kyykkyok', 'kyyyyook', '.koooook', '..kkkk..']),
  star: icon({ y: 'yellow', o: 'darkYellow' }, ['...kk...', '...kyk..', '..kyyk..', 'kkkyyykk', '.kyyyyk.', '..kyyk..', '.kyooyk.', 'kk....kk']),
  starEmpty: icon({ g: 'grey', d: 'darkGrey' }, ['...kk...', '...kgk..', '..kggk..', 'kkkgggkk', '.kggggk.', '..kggk..', '.kgddgk.', 'kk....kk']),
  lock: icon({ g: 'grey', d: 'darkGrey', y: 'yellow' }, ['..kkkk..', '.kg..gk.', '.kg..gk.', 'kkkkkkkk', 'kggggggk', 'kggkkggk', 'kgggggdk', 'kkkkkkkk']),
  check: icon({ g: 'green', G: 'darkGreen' }, ['......kk', '.....kgk', '....kgGk', 'kk.kgGk.', 'kgkgGk..', 'kgGGk...', '.kGk....', '..k.....']),
  chest: icon({ b: 'brown', d: 'darkBrown', y: 'yellow' }, ['.kkkkkk.', 'kbbbbbbk', 'kbbbbbbk', 'kkkkkkkk', 'kdddyddk', 'kdddkddk', 'kddddddk', 'kkkkkkkk']),
  heart: icon({ r: 'red', R: 'darkRed', w: 'light' }, ['.kk..kk.', 'krwkkrrk', 'krrrrrRk', 'krrrrrRk', '.krrrRk.', '..krRk..', '...kk...', '........']),
} as const satisfies Record<string, Sprite>;

export const ALL_SPRITES: Record<string, Sprite> = {
  blockTile: BLOCK_TILE,
  ...Object.fromEntries(Object.entries(VEGETABLES).map(([k, v]) => [`veg.${k}`, v])),
  ...Object.fromEntries(Object.entries(BUBBLES).map(([k, v]) => [`bubble.${k}`, v])),
  ...Object.fromEntries(Object.entries(WORLD_ICONS).map(([k, v]) => [`world.${k}`, v])),
  ...Object.fromEntries(Object.entries(UI_SPRITES).map(([k, v]) => [`ui.${k}`, v])),
  ...Object.fromEntries(Object.entries(GAME_ICONS).map(([k, v]) => [`game.${k}`, v])),
};
