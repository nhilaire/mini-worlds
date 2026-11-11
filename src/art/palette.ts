// Limited pixel-art palette (colour-blind safe: hues differ in lightness too, and every piece also has its own
// shape). Sprites reference colours by name; the renderer resolves them to hex once per theme.

export const PALETTE = {
  transparent: 'transparent',
  outline: '#1B1A2E',
  white: '#FFFFFF',
  light: '#F4F1DE',
  shade: '#2B2D42',
  red: '#E63946',
  darkRed: '#A4161A',
  orange: '#F77F00',
  darkOrange: '#C25E00',
  yellow: '#FFD60A',
  darkYellow: '#D4A200',
  green: '#43AA8B',
  darkGreen: '#2A7F62',
  lime: '#90BE6D',
  blue: '#277DA1',
  darkBlue: '#1B4F72',
  sky: '#4CC9F0',
  purple: '#9D4EDD',
  darkPurple: '#6A2C9E',
  pink: '#F28482',
  brown: '#8D5B2E',
  darkBrown: '#5A3A1C',
  grey: '#8D99AE',
  darkGrey: '#4A5568',
} as const;

export type PaletteColor = keyof typeof PALETTE;
export const PALETTE_COLORS = Object.keys(PALETTE) as PaletteColor[];

/** Dominant colour of each world (cards, world detail header). */
export const WORLD_COLORS = {
  arcade: 'red',
  puzzle: 'green',
  strategy: 'darkBlue',
  cards: 'purple',
  bubbles: 'sky',
  skill: 'orange',
  building: 'brown',
  exploration: 'lime',
  memory: 'pink',
  challenges: 'yellow',
} as const satisfies Record<string, PaletteColor>;

/** Colour of each tetromino tile. */
export const TETROMINO_COLORS = {
  I: 'sky',
  O: 'yellow',
  T: 'purple',
  S: 'green',
  Z: 'red',
  J: 'blue',
  L: 'orange',
} as const satisfies Record<string, PaletteColor>;
