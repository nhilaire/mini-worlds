// Board sprites of « Fruits en Fusion » (10×10): the 8 fruits, index 0..7 (cerise, fraise, raisin, orange, pomme,
// poire, ananas, pastèque). Each fruit has its own silhouette, not only its own colour (colour-blind safe).
import type { Sprite } from '../sprites';

const CHERRY: Sprite = {
  legend: { k: 'outline', g: 'green', G: 'darkGreen', w: 'white', r: 'red', R: 'darkRed' },
  rows: ['.....gG...', '....g.g...', '...g...g..', '..g....g..', '.kkk..kkk.', 'kwrrk.kwrk', 'krrRkkrrRk', 'kRRRkkrRRk', '.kkk..kkk.', '..........'],
};

const STRAWBERRY: Sprite = {
  legend: { k: 'outline', g: 'green', r: 'red', R: 'darkRed', y: 'yellow' },
  rows: ['...g..g...', '..gggggg..', '.kkkkkkkk.', 'krryrrryrk', 'krrrryrrrk', '.kryrrryk.', '.krrryrrk.', '..krrrrk..', '...kRRk...', '....kk....'],
};

const GRAPES: Sprite = {
  legend: { k: 'outline', g: 'green', p: 'purple', P: 'darkPurple' },
  rows: ['.....g....', '....gg....', '.kk.kk.kk.', 'kpPkpPkpPk', '.kkpkkpkk.', '..kpPkpPk.', '...kkpkk..', '....kpPk..', '.....kk...', '..........'],
};

const ORANGE: Sprite = {
  legend: { k: 'outline', g: 'green', w: 'light', o: 'orange', O: 'darkOrange' },
  rows: ['....gk....', '...kkkk...', '..kwooOk..', '.kwoooOOk.', '.kooooOOk.', '.kooooOOk.', '.koooOOOk.', '..kOOOOk..', '...kkkk...', '..........'],
};

const APPLE: Sprite = {
  legend: { k: 'outline', b: 'brown', g: 'green', w: 'white', l: 'lime', G: 'darkGreen' },
  rows: ['....kb.gg.', '..kkkbkk..', '.kwllkllk.', 'kwlllllllk', 'klllllllGk', 'klllllllGk', 'kllllllGGk', '.kllllGGk.', '..kkkkkk..', '..........'],
};

const PEAR: Sprite = {
  legend: { k: 'outline', b: 'brown', y: 'yellow', Y: 'darkYellow' },
  rows: ['.....b....', '....kbk...', '...kyyk...', '...kyyyk..', '..kyyyyk..', '.kyyyyyyk.', 'kyyyyyyyYk', 'kyyyyyyYYk', '.kYYYYYYk.', '..kkkkkk..'],
};

const PINEAPPLE: Sprite = {
  legend: { k: 'outline', g: 'green', o: 'yellow', b: 'darkOrange' },
  rows: ['...g.g.g..', '....ggg...', '...kkkkk..', '..kobobok.', '..kbobobk.', '..kobobok.', '..kbobobk.', '..kobobok.', '...kkkkk..', '..........'],
};

const WATERMELON: Sprite = {
  legend: { k: 'outline', g: 'green', G: 'darkGreen' },
  rows: ['..kkkkkk..', '.kgGgGgGk.', 'kgGgGgGgGk', 'kgGgGgGgGk', 'kgGgGgGgGk', 'kgGgGgGgGk', 'kgGgGgGgGk', 'kgGgGgGgGk', '.kgGgGgGk.', '..kkkkkk..'],
};

/** A stone (Fruits en Fusion, v0.4.0 phone test): never merges; a rough grey block, unlike any fruit. */
export const STONE_SPRITE: Sprite = {
  legend: { k: 'outline', g: 'grey', G: 'darkGrey', w: 'light' },
  rows: ['..........', '..kkkkk...', '.kwggggk..', 'kwggGgggk.', 'kgggggGgkk', 'kgGgggggGk', 'kggggGgggk', '.kgGggggGk', '..kkkkkkk.', '..........'],
};

/** Fruit sprites by index (0 cerise ... 7 pastèque). */
export const FRUITS: readonly Sprite[] = [CHERRY, STRAWBERRY, GRAPES, ORANGE, APPLE, PEAR, PINEAPPLE, WATERMELON];
