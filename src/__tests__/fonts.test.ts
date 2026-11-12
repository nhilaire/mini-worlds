import fs from 'node:fs';
import path from 'node:path';

import { PIXEL_FONT, PIXEL_FONT_BOLD, PIXEL_MIN_SIZE, PIXEL_SCALE } from '../ui/theme';

const ROOT = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('pixel font (AC-48)', () => {
  it('ships Pixelify Sans Regular and Bold and no longer Press Start 2P', () => {
    const fonts = fs.readdirSync(path.join(ROOT, 'assets', 'fonts')).sort();
    expect(fonts).toEqual(['PixelifySans-Bold.ttf', 'PixelifySans-Regular.ttf']);
    for (const file of fonts) {
      const head = fs.readFileSync(path.join(ROOT, 'assets', 'fonts', file)).subarray(0, 4);
      expect(head).toEqual(Buffer.from([0, 1, 0, 0])); // TrueType outlines
    }
  });

  it('loads both files at start under the names the theme uses', () => {
    const app = read('src/App.tsx');
    expect(app).toMatch(/PixelifySans: require\('\.\.\/assets\/fonts\/PixelifySans-Regular\.ttf'\)/);
    expect(app).toMatch(/'PixelifySans-Bold': require\('\.\.\/assets\/fonts\/PixelifySans-Bold\.ttf'\)/);
    expect(app).not.toContain('PressStart2P');
    expect(PIXEL_FONT).toBe('PixelifySans');
    expect(PIXEL_FONT_BOLD).toBe('PixelifySans-Bold');
    expect(PIXEL_SCALE).toBeGreaterThan(1);
    expect(PIXEL_MIN_SIZE).toBeGreaterThanOrEqual(13); // digits stay legible (5 vs S)
  });

  it('is credited under the OFL in the asset licences and the README', () => {
    const licences = read('assets/LICENSES.md');
    expect(licences).toContain('PixelifySans-Regular.ttf');
    expect(licences).toContain('PixelifySans-Bold.ttf');
    expect(licences).toMatch(/Pixelify Sans.*SIL Open Font License 1\.1/);
    expect(licences).not.toContain('Press Start 2P');
    expect(read('README.md')).toContain('Pixelify Sans (OFL)');
  });
});
