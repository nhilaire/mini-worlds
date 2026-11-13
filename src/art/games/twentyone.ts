// Pixel sprites of Vingt-et-Un: the four suits (7×7, each its own shape: red hearts and diamonds, dark clubs and
// spades) and the three figures (7×7: jack cap, queen tiara, king crown), drawn instead of letters so that the cards
// read the same in every language. The ace shows « A ».
import type { Sprite } from '../sprites';
import type { Suit } from '../../game/twentyone/engine';

export const SUIT_SPRITES: Readonly<Record<Suit, Sprite>> = {
  hearts: {
    legend: { r: 'red', d: 'darkRed' },
    rows: ['.rr.rr.', 'rrrrrrr', 'rrrrrrd', 'rrrrrrd', '.rrrrd.', '..rrd..', '...d...'],
  },
  diamonds: {
    legend: { r: 'red', d: 'darkRed' },
    rows: ['...r...', '..rrr..', '.rrrrr.', 'rrrrrrd', '.rrrrd.', '..rrd..', '...d...'],
  },
  clubs: {
    legend: { k: 'outline' },
    rows: ['..kkk..', '..kkk..', 'kk.k.kk', 'kkkkkkk', 'kk.k.kk', '...k...', '..kkk..'],
  },
  spades: {
    legend: { k: 'outline' },
    rows: ['...k...', '..kkk..', '.kkkkk.', 'kkkkkkk', 'kkkkkkk', '.k.k.k.', '..kkk..'],
  },
};

/** Figures: rank 11 (jack), 12 (queen), 13 (king). */
export const FIGURE_SPRITES: Readonly<Record<11 | 12 | 13, Sprite>> = {
  11: {
    legend: { b: 'blue', d: 'darkBlue', y: 'yellow', s: 'pink', k: 'outline' },
    rows: ['..bbby.', '.bbbbb.', 'dddddd.', '.sssss.', '.sksks.', '.sssss.', '..sss..'],
  },
  12: {
    legend: { y: 'yellow', p: 'purple', s: 'pink', k: 'outline' },
    rows: ['.y.p.y.', '.yyyyy.', '.sssss.', 'psksksp', 'psssssp', 'p.sss.p', 'p.....p'],
  },
  13: {
    legend: { y: 'yellow', o: 'darkYellow', r: 'red', s: 'pink', k: 'outline' },
    rows: ['y.yry.y', 'yyyyyyy', 'ooooooo', '.sssss.', '.sksks.', '.sssss.', '.kkkkk.'],
  },
};

/** Back of a card (the dealer's hidden card): a blue lattice, 7×7. */
export const CARD_BACK: Sprite = {
  legend: { b: 'blue', d: 'darkBlue', l: 'sky' },
  rows: ['bdbdbdb', 'dbdbdbd', 'bdblbdb', 'dblllbd', 'bdblbdb', 'dbdbdbd', 'bdbdbdb'],
};
