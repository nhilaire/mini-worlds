import fs from 'node:fs';
import path from 'node:path';

import { PIXEL_FONT, PIXEL_FONT_BOLD, PIXEL_MIN_SIZE, PIXEL_SCALE } from '../ui/theme';

const ROOT = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('pixel font (AC-48)', () => {
  it('ships Jersey 20 only (no Press Start 2P, no Pixelify Sans)', () => {
    const fonts = fs.readdirSync(path.join(ROOT, 'assets', 'fonts')).sort();
    expect(fonts).toEqual(['Jersey20-Regular.ttf']);
    const head = fs.readFileSync(path.join(ROOT, 'assets', 'fonts', fonts[0])).subarray(0, 4);
    expect(head).toEqual(Buffer.from([0, 1, 0, 0])); // TrueType outlines
  });

  it('loads the file at start under the name the theme uses', () => {
    const app = read('src/App.tsx');
    expect(app).toMatch(/Jersey20: require\('\.\.\/assets\/fonts\/Jersey20-Regular\.ttf'\)/);
    expect(app).not.toContain('PressStart2P');
    expect(app).not.toContain('PixelifySans');
    expect(PIXEL_FONT).toBe('Jersey20');
    expect(PIXEL_FONT_BOLD).toBe('Jersey20'); // single weight
    expect(PIXEL_SCALE).toBeGreaterThan(1);
    expect(PIXEL_MIN_SIZE).toBeGreaterThanOrEqual(13); // digits stay legible
  });

  it('is credited under the OFL in the asset licences and the README', () => {
    const licences = read('assets/LICENSES.md');
    expect(licences).toContain('Jersey20-Regular.ttf');
    expect(licences).toMatch(/Jersey 20.*SIL Open Font License 1\.1/);
    expect(licences).not.toContain('Press Start 2P');
    expect(licences).not.toContain('Pixelify');
    expect(read('README.md')).toContain('Jersey 20 (OFL)');
  });
});
