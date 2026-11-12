import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { PALETTE } from '../art/palette';
import { BUBBLES, VEGETABLES, WORLD_ICONS } from '../art/sprites';

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'generate-icons.mjs');

function pngSize(file: string): { width: number; height: number; colorType: number } {
  const bytes = fs.readFileSync(path.join(ROOT, 'assets', file));
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
}

describe('launcher icon and splash (AC-52)', () => {
  it('the committed PNG files are exactly what the generator produces', () => {
    const out = execFileSync('node', [SCRIPT, '--check'], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toContain('6 icon files up to date');
  });

  it('files have the expected sizes (RGBA)', () => {
    expect(pngSize('icon.png')).toEqual({ width: 1024, height: 1024, colorType: 6 });
    expect(pngSize('android-icon-foreground.png')).toEqual({ width: 1024, height: 1024, colorType: 6 });
    expect(pngSize('android-icon-background.png')).toEqual({ width: 1024, height: 1024, colorType: 6 });
    expect(pngSize('android-icon-monochrome.png')).toEqual({ width: 1024, height: 1024, colorType: 6 });
    expect(pngSize('splash-icon.png')).toEqual({ width: 1000, height: 1000, colorType: 6 });
    expect(pngSize('favicon.png')).toEqual({ width: 48, height: 48, colorType: 6 });
  });

  it('the generator embeds the game sprites and palette colours unchanged', () => {
    const printed = JSON.parse(execFileSync('node', [SCRIPT, '--print-sprites'], { cwd: ROOT, encoding: 'utf8' })) as {
      palette: Record<string, string>;
      sprites: Record<string, { legend: Record<string, string>; rows: string[] }>;
    };
    for (const [name, value] of Object.entries(printed.palette)) expect(PALETTE[name as keyof typeof PALETTE]).toBe(value);
    expect(printed.sprites.arcade).toEqual(WORLD_ICONS.arcade);
    expect(printed.sprites.bubble).toEqual(BUBBLES.blue);
    expect(printed.sprites.tomato).toEqual(VEGETABLES.tomato);
    expect(printed.sprites.trophy).toEqual(WORLD_ICONS.challenges);
  });

  it('app.json uses the generated files for the icon, the adaptive icon and the splash screen', () => {
    const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo;
    expect(app.icon).toBe('./assets/icon.png');
    expect(app.android.adaptiveIcon).toMatchObject({
      backgroundColor: PALETTE.orange,
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    });
    const splash = (app.plugins as unknown[]).find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen') as [string, Record<string, unknown>] | undefined;
    expect(splash?.[1]).toMatchObject({ image: './assets/splash-icon.png', resizeMode: 'contain', backgroundColor: '#F4F1E8' }); // light theme background
    expect(splash?.[1].dark).toMatchObject({ backgroundColor: expect.stringMatching(/^#[0-9A-Fa-f]{6}$/) });
  });
});
