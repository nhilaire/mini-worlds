import { PALETTE } from '../art/palette';
import { ALL_SPRITES, BLOCK_TILE, BUBBLES, spriteSize, UI_SPRITES, validateSprite, VEGETABLES, WORLD_ICONS } from '../art/sprites';

const shapeOf = (rows: readonly string[]) => rows.map((r) => r.replace(/[^.]/g, '#')).join('\n');

describe('pixel sprites (AC-44)', () => {
  it.each(Object.keys(ALL_SPRITES))('%s is rectangular and references only palette colours', (name) => {
    const sprite = ALL_SPRITES[name];
    expect(validateSprite(sprite)).toEqual([]);
    for (const colour of Object.values(sprite.legend)) expect(PALETTE[colour]).toBeTruthy();
  });

  it('sizes: block tile 8×8, vegetables, bubbles and world icons 12×12, UI glyphs 8×8', () => {
    expect(spriteSize(BLOCK_TILE)).toEqual({ width: 8, height: 8 });
    for (const s of Object.values(VEGETABLES)) expect(spriteSize(s)).toEqual({ width: 12, height: 12 });
    for (const s of Object.values(BUBBLES)) expect(spriteSize(s)).toEqual({ width: 12, height: 12 });
    for (const s of Object.values(WORLD_ICONS)) expect(spriteSize(s)).toEqual({ width: 12, height: 12 });
    for (const s of Object.values(UI_SPRITES)) expect(spriteSize(s)).toEqual({ width: 8, height: 8 });
  });

  it('every vegetable has a distinct silhouette (not only a distinct colour)', () => {
    const shapes = Object.values(VEGETABLES).map((s) => shapeOf(s.rows));
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it('every bubble has a distinct face', () => {
    const faces = Object.values(BUBBLES).map((s) => s.rows.join('\n').replace(/[^e.\n]/g, '-'));
    expect(new Set(faces).size).toBe(faces.length);
  });

  it('world icons are all different and the catalogue covers 6 vegetables, 5 bubbles, 10 worlds', () => {
    const icons = Object.values(WORLD_ICONS).map((s) => s.rows.join('\n'));
    expect(new Set(icons).size).toBe(10);
    expect(Object.keys(VEGETABLES)).toHaveLength(6);
    expect(Object.keys(BUBBLES)).toHaveLength(5);
  });

  it('validateSprite reports ragged rows and unknown characters', () => {
    expect(validateSprite({ legend: { k: 'outline' }, rows: ['kk', 'k'] })).toEqual(['row 1 has 1 columns, expected 2']);
    expect(validateSprite({ legend: { k: 'outline' }, rows: ['kx'] })).toEqual(["row 0: 'x' is not in the legend"]);
  });
});
