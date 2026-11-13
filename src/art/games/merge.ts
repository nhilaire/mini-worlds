// Board sprites of « Fusion de Guerriers » (10×10): one warrior per level 1..8, each with its own headgear and
// equipment (shape), so levels read without colour; the screen also prints the level number on each warrior.
// Levels above 8 reuse the level-8 sprite. Sprites are composed from layers (head, body, items) on a 10×10 canvas.
import type { PaletteColor } from '../palette';
import type { Sprite } from '../sprites';

const SIZE = 10;

/** Places `layer` rows at (x, y) on the canvas; '.' in a layer keeps what is below. */
function stamp(canvas: string[][], layer: readonly string[], x: number, y: number): void {
  layer.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) if (row[dx] !== '.') canvas[y + dy][x + dx] = row[dx];
  });
}

const HEADS = {
  bare: ['.....', '.kkk.', 'kpppk', 'kpkpk'],
  helmet: ['.kkk.', 'kgggk', 'kpppk', 'kpkpk'],
  hood: ['..k..', '.kGk.', 'kGppk', 'kpkpk'],
  visor: ['..r..', '.kkk.', 'kgggk', 'kGkGk'],
  crown: ['y.y.y', 'yyyyy', 'kpppk', 'kpkpk'],
  wizard: ['..k..', '.kuk.', 'kuuuk', 'kpkpk'],
} as const;

/** Body (neck, tunic `t`, belt `T`, legs), 5 wide, rows 4-9. */
const BODY = ['.kpk.', 'ktttk', 'ktttk', 'kTTTk', '.k.k.', 'kk.kk'];

/** Right-hand items, 3 wide, from row 0. */
const ITEMS = {
  stick: ['.b.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.'],
  sword: ['...', '.w.', '.w.', '.w.', '.w.', 'yyy', '.B.', '...'],
  bow: ['.k.', '..k', '.wk', '.wk', '.wk', '.wk', '..k', '.k.'],
  spear: ['.g.', 'ggg', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.'],
  flag: ['brr', 'brr', 'b..', 'b..', 'b..', 'b..', 'b..', 'b..', 'b..'],
  staff: ['.u.', 'uuu', '.u.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.'],
} as const;

/** Left-hand shield, 3 wide, rows 4-7. */
const SHIELD = ['kkk', 'kUk', 'kUk', '.k.'];

const LEGEND: Record<string, PaletteColor> = {
  k: 'outline',
  p: 'pink',
  g: 'grey',
  G: 'darkGrey',
  b: 'brown',
  B: 'darkBrown',
  w: 'white',
  y: 'yellow',
  r: 'red',
  u: 'sky',
  U: 'darkBlue',
};

function warrior(head: keyof typeof HEADS, item: keyof typeof ITEMS, tunic: PaletteColor, belt: PaletteColor, shield: boolean): Sprite {
  const canvas = Array.from({ length: SIZE }, () => new Array<string>(SIZE).fill('.'));
  stamp(canvas, BODY, 2, 4);
  stamp(canvas, HEADS[head], 2, 0);
  stamp(canvas, ITEMS[item], 7, 0);
  if (shield) stamp(canvas, SHIELD, 0, 4);
  return { legend: { ...LEGEND, t: tunic, T: belt }, rows: canvas.map((row) => row.join('')) };
}

/** Warrior sprites by level − 1 (level 1 = index 0). */
export const WARRIORS: readonly Sprite[] = [
  warrior('bare', 'stick', 'brown', 'darkBrown', false), // 1 paysan
  warrior('helmet', 'sword', 'red', 'darkRed', false), // 2 soldat
  warrior('helmet', 'sword', 'red', 'darkRed', true), // 3 soldat au bouclier
  warrior('hood', 'bow', 'green', 'darkGreen', false), // 4 archer
  warrior('visor', 'spear', 'blue', 'darkBlue', true), // 5 chevalier
  warrior('visor', 'flag', 'orange', 'darkOrange', true), // 6 capitaine
  warrior('crown', 'sword', 'purple', 'darkPurple', true), // 7 roi
  warrior('wizard', 'staff', 'darkBlue', 'yellow', false), // 8 mage
];

export const warriorSprite = (level: number): Sprite => WARRIORS[Math.min(WARRIORS.length, Math.max(1, level)) - 1];
