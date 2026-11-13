// The 12 socks of Chaussettes Perdues (12×12 each). Every sock has the same outline and its own pattern AND
// colour: plain dark, plain light, thin stripes, wide bands, one band, vertical stripes, checks, diagonals, dots,
// crosses, zigzag and a two-tone sock, so a pair is recognisable without colour (colour-blind safe).
import type { PaletteColor } from '../palette';
import type { Sprite } from '../sprites';

// Shape: c = cuff, b = body (pattern), h = heel, t = toe, k = outline. The foot points left.
const MASK = [
  '....kkkkkkk.',
  '....kccccck.',
  '....kccccck.',
  '....kbbbbbk.',
  '....kbbbbbk.',
  '....kbbbbbk.',
  '....kbbbbbk.',
  '.kkkkbbbbhhk',
  'kttbbbbbbhhk',
  'kttbbbbbbhhk',
  'kttbbbbbbbbk',
  '.kkkkkkkkkk.',
] as const;

type SockDef = {
  /** Body colour, pattern colour, cuff / heel / toe colour. */
  base: PaletteColor;
  motif: PaletteColor;
  trim: PaletteColor;
  /** True where the body shows the motif colour. */
  pattern: (x: number, y: number) => boolean;
};

const DEFS: readonly SockDef[] = [
  { base: 'red', motif: 'red', trim: 'white', pattern: () => false }, // 0 plain, light trim
  { base: 'light', motif: 'light', trim: 'darkRed', pattern: () => false }, // 1 plain light, dark trim
  { base: 'white', motif: 'blue', trim: 'blue', pattern: (_x, y) => y % 2 === 1 }, // 2 thin stripes
  { base: 'brown', motif: 'yellow', trim: 'darkBrown', pattern: (_x, y) => y % 4 < 2 }, // 3 wide bands
  { base: 'grey', motif: 'darkGrey', trim: 'darkGrey', pattern: (_x, y) => y === 5 || y === 9 }, // 4 two thin bands
  { base: 'darkGreen', motif: 'lime', trim: 'green', pattern: (x) => x % 2 === 0 }, // 5 vertical stripes
  { base: 'purple', motif: 'white', trim: 'darkPurple', pattern: (x, y) => (x + y) % 2 === 0 }, // 6 checks
  { base: 'orange', motif: 'darkBrown', trim: 'darkOrange', pattern: (x, y) => (x + y) % 3 === 0 }, // 7 diagonals
  { base: 'yellow', motif: 'outline', trim: 'darkYellow', pattern: (x, y) => x % 3 === 1 && y % 3 === 1 }, // 8 dots
  { base: 'pink', motif: 'darkRed', trim: 'white', pattern: (x, y) => (x % 4 === 2 && y % 4 !== 0) || (y % 4 === 2 && x % 4 !== 0) }, // 9 crosses
  { base: 'sky', motif: 'darkBlue', trim: 'darkBlue', pattern: (x, y) => (y + Math.abs((x % 4) - 2)) % 4 === 0 }, // 10 zigzag
  { base: 'lime', motif: 'darkGreen', trim: 'outline', pattern: (x, y) => x - y > -2 }, // 11 two-tone (diagonal split)
];

function buildSock(def: SockDef): Sprite {
  const rows = MASK.map((row, y) =>
    [...row]
      .map((ch, x) => {
        if (ch === 'b') return def.pattern(x, y) ? 'm' : 'b';
        if (ch === 'c' || ch === 'h' || ch === 't') return 'r';
        return ch;
      })
      .join(''),
  );
  return { legend: { k: 'outline', b: def.base, m: def.motif, r: def.trim }, rows };
}

export const SOCKS: readonly Sprite[] = DEFS.map(buildSock);

/** Back of a card (face down): a purple tile with a light diamond, 12×12. */
export const CARD_BACK: Sprite = {
  legend: { k: 'outline', p: 'purple', d: 'darkPurple', l: 'light' },
  rows: [
    'pppppppppppp',
    'pdpdpdpdpdpd',
    'pppppppppppp',
    'pdpdpllpdpdp',
    'ppppllllpppp',
    'pdplllllldpd',
    'pppllllllppp',
    'pdpdllllpdpd',
    'pppppllppppp',
    'pdpdpdpdpdpd',
    'pppppppppppp',
    'pdpdpdpdpdpd',
  ],
};
