#!/usr/bin/env node
// Generates the launcher icon, the adaptive icon layers, the splash image and the favicon as PNG files in assets/
// from the game's own pixel sprites (no dependency, deterministic: the same bytes on every run).
// Run: node scripts/generate-icons.mjs            writes the files
//      node scripts/generate-icons.mjs --check    exits 1 when a file differs from what would be generated
//      node scripts/generate-icons.mjs --print-sprites   prints the embedded sprites (checked against src/art by Jest)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');

// Subset of src/art/palette.ts (same hex values; src/__tests__/icons.test.ts checks they still match).
const PALETTE = {
  outline: '#1B1A2E',
  white: '#FFFFFF',
  light: '#F4F1DE',
  red: '#E63946',
  darkRed: '#A4161A',
  orange: '#F77F00',
  yellow: '#FFD60A',
  darkYellow: '#D4A200',
  green: '#43AA8B',
  blue: '#277DA1',
  darkBlue: '#1B4F72',
  grey: '#8D99AE',
};

// Copies of four 12×12 sprites of src/art/sprites.ts (checked byte for byte by the Jest test).
const SPRITES = {
  arcade: {
    legend: { k: 'outline', r: 'red', w: 'light', y: 'yellow' },
    rows: ['............', '...kkkkkk...', '..krrrrrrk..', '.krrwwwwrrk.', '.krwkkkkwrk.', '.krwkyykwrk.', '.krwkyykwrk.', '.krwkkkkwrk.', '.krrwwwwrrk.', '..krrkkrrk..', '...kkkkkk...', '............'],
  },
  bubble: {
    legend: { k: 'outline', b: 'blue', d: 'darkBlue', w: 'white', e: 'outline' },
    rows: ['....kkkk....', '..kkbbbbkk..', '.kbwbbbbbbk.', '.kwbbbbbbbk.', 'kbbbbbbbbbbk', 'kbbe....ebbk', 'kbb..ee..bbk', 'kbb.e..e.bdk', '.kbbbbbbbdk.', '.kbbbbbdddk.', '..kkddddkk..', '....kkkk....'],
  },
  tomato: {
    legend: { k: 'outline', g: 'green', r: 'red', R: 'darkRed', w: 'light' },
    rows: ['.....gkg....', '...kkgggkk..', '..krrrkrrrk.', '.krwrrrrrrRk', '.krrrrrrrrRk', 'krrrrrrrrrRk', 'krrrrrrrrRRk', 'krrrrrrrRRRk', '.krrrrrRRRk.', '.kRrrrRRRRk.', '..kkRRRRkk..', '....kkkk....'],
  },
  trophy: {
    legend: { k: 'outline', y: 'yellow', o: 'darkYellow', w: 'light' },
    rows: ['.....kk.....', '....kyyk....', '....kyyk....', '.kkkkyykkkk.', 'kyyyyyyyyyyk', '.kyyyyyyyyk.', '..kyyyyyyk..', '...kyyyyk...', '...kyyyyk...', '..kyykkyyk..', '.kkkk..kkkk.', '............'],
  },
};

// --- Tiny raster + PNG encoder ------------------------------------------------------------------------------------

function canvas(width, height) {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

function hex(color) {
  return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
}

function set(c, x, y, color) {
  if (x < 0 || y < 0 || x >= c.width || y >= c.height) return;
  const i = (y * c.width + x) * 4;
  const [r, g, b] = hex(color);
  c.data[i] = r;
  c.data[i + 1] = g;
  c.data[i + 2] = b;
  c.data[i + 3] = 255;
}

function fill(c, x, y, w, h, color) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(c, i, j, color);
}

/** Draws `sprite` with its top-left pixel at (x, y), one sprite pixel = `scale` canvas pixels. */
function sprite(c, def, x, y, scale) {
  def.rows.forEach((row, sy) => {
    for (let sx = 0; sx < row.length; sx++) {
      const ch = row[sx];
      if (ch === '.') continue;
      fill(c, x + sx * scale, y + sy * scale, scale, scale, PALETTE[def.legend[ch]]);
    }
  });
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

function png(c) {
  const stride = c.width * 4;
  const raw = Buffer.alloc((stride + 1) * c.height);
  for (let y = 0; y < c.height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    raw.set(c.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.width, 0);
  ihdr.writeUInt32BE(c.height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Artwork --------------------------------------------------------------------------------------------------------

/** The 40×40 « toy box » panel: a cream rounded tile holding four game pieces (arcade box, bubble, tomato, trophy). */
export const PANEL = 40;

function panel(c, x, y, scale, mono = false) {
  const ink = (color) => (mono ? PALETTE.white : color);
  const cut = (px, py) => (px < 2 && py < 2 && px + py < 2) || (px > PANEL - 3 && py < 2 && PANEL - 1 - px + py < 2) || (px < 2 && py > PANEL - 3 && px + PANEL - 1 - py < 2) || (px > PANEL - 3 && py > PANEL - 3 && PANEL - 1 - px + PANEL - 1 - py < 2);
  for (let py = 0; py < PANEL; py++) {
    for (let px = 0; px < PANEL; px++) {
      if (cut(px, py)) continue; // rounded corners
      const edge = px === 0 || py === 0 || px === PANEL - 1 || py === PANEL - 1;
      const shadow = !edge && (px === PANEL - 2 || py === PANEL - 2);
      fill(c, x + px * scale, y + py * scale, scale, scale, edge ? ink(PALETTE.outline) : shadow ? ink(PALETTE.grey) : ink(PALETTE.light));
    }
  }
  if (mono) return;
  sprite(c, SPRITES.arcade, x + 4 * scale, y + 4 * scale, scale);
  sprite(c, SPRITES.bubble, x + 24 * scale, y + 4 * scale, scale);
  sprite(c, SPRITES.tomato, x + 4 * scale, y + 24 * scale, scale);
  sprite(c, SPRITES.trophy, x + 24 * scale, y + 24 * scale, scale);
}

function build() {
  const files = {};

  // Adaptive icon: 1024 px layers, the art inside the central safe zone (66 % = 676 px): 40 px × 16 = 640 px.
  const foreground = canvas(1024, 1024);
  panel(foreground, 192, 192, 16);
  files['android-icon-foreground.png'] = png(foreground);

  const background = canvas(1024, 1024);
  fill(background, 0, 0, 1024, 1024, PALETTE.orange);
  files['android-icon-background.png'] = png(background);

  const monochrome = canvas(1024, 1024);
  panel(monochrome, 192, 192, 16, true);
  files['android-icon-monochrome.png'] = png(monochrome);

  // Legacy / iOS / web icon: the full square (orange background + panel).
  const icon = canvas(1024, 1024);
  fill(icon, 0, 0, 1024, 1024, PALETTE.orange);
  panel(icon, 192, 192, 16);
  files['icon.png'] = png(icon);

  // Splash image: Android 12+ masks it to a circle, so the four pieces alone (no tile), kept inside the inscribed
  // circle of the 40 px square (content 28 px wide: the corners stay within the radius). Background from app.json.
  const splash = canvas(1000, 1000);
  sprite(splash, SPRITES.arcade, 6 * 25, 6 * 25, 25);
  sprite(splash, SPRITES.bubble, 22 * 25, 6 * 25, 25);
  sprite(splash, SPRITES.tomato, 6 * 25, 22 * 25, 25);
  sprite(splash, SPRITES.trophy, 22 * 25, 22 * 25, 25);
  files['splash-icon.png'] = png(splash);

  const favicon = canvas(48, 48);
  panel(favicon, 4, 4, 1);
  files['favicon.png'] = png(favicon);

  return files;
}

const mode = process.argv[2];
if (mode === '--print-sprites') {
  process.stdout.write(JSON.stringify({ palette: PALETTE, sprites: SPRITES }));
} else {
  const files = build();
  if (mode === '--check') {
    const stale = Object.entries(files).filter(([name, bytes]) => {
      const target = path.join(ASSETS, name);
      return !fs.existsSync(target) || !fs.readFileSync(target).equals(bytes);
    });
    if (stale.length > 0) {
      console.error(`stale: ${stale.map(([n]) => n).join(', ')} (run node scripts/generate-icons.mjs)`);
      process.exit(1);
    }
    console.log(`${Object.keys(files).length} icon files up to date`);
  } else {
    for (const [name, bytes] of Object.entries(files)) {
      fs.writeFileSync(path.join(ASSETS, name), bytes);
      console.log(`${name}: ${bytes.length} bytes`);
    }
  }
}
