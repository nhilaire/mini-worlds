// Icon of the game « maze » (12×12): a small maze with the explorer (red) at its entrance and the exit (yellow),
// shown on its world card, Game sheet and Result.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', g: 'lime', r: 'red', y: 'yellow' },
  rows: [
    'kkkkkkkkkkkk',
    'krggkgggggkk',
    'kkkgkgkkkgkk',
    'kgggkgggkgkk',
    'kgkkkkkgkgkk',
    'kgggggkgkgkk',
    'kkkkkgkgkggk',
    'kgggkgggkkgk',
    'kgkgkkkkkggk',
    'kgkgggggggkk',
    'kgkkkkkkkgyk',
    'kkkkkkkkkkkk',
  ],
};
