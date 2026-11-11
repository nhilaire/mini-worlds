#!/usr/bin/env node
// Generates the sound effects as small 16-bit mono WAV files in assets/sounds/ (no dependency, deterministic).
// Run: node scripts/generate-sounds.mjs   (a Jest test checks the headers; see src/__tests__/sounds.test.ts)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 22050;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');

/** A tone: frequency (Hz, or a function of t in [0,1]), duration (s), envelope decay, waveform. */
function tone({ freq, seconds, decay = 8, wave = 'square', gain = 0.35 }) {
  const n = Math.floor(RATE * seconds);
  const samples = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const f = typeof freq === 'function' ? freq(t) : freq;
    phase += (2 * Math.PI * f) / RATE;
    const raw = wave === 'square' ? Math.sign(Math.sin(phase)) : wave === 'saw' ? ((phase / Math.PI) % 2) - 1 : Math.sin(phase);
    const env = Math.exp(-decay * t);
    samples[i] = raw * env * gain;
  }
  return samples;
}

function concat(...parts) {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function noise(seconds, decay = 10, gain = 0.3) {
  const n = Math.floor(RATE * seconds);
  const samples = new Float32Array(n);
  let x = 12345;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    samples[i] = ((x / 4294967296) * 2 - 1) * Math.exp((-decay * i) / n) * gain;
  }
  return samples;
}

const SOUNDS = {
  tick: () => tone({ freq: 880, seconds: 0.05, decay: 12 }),
  drop: () => tone({ freq: (t) => 300 - 150 * t, seconds: 0.12, decay: 6 }),
  clear: () => concat(tone({ freq: 523, seconds: 0.08, decay: 4 }), tone({ freq: 659, seconds: 0.08, decay: 4 }), tone({ freq: 784, seconds: 0.14, decay: 5 })),
  combo: () => concat(tone({ freq: 659, seconds: 0.07, decay: 4 }), tone({ freq: 880, seconds: 0.07, decay: 4 }), tone({ freq: 1175, seconds: 0.16, decay: 5 })),
  shoot: () => tone({ freq: (t) => 400 + 500 * t, seconds: 0.1, decay: 5, wave: 'saw', gain: 0.25 }),
  pop: () => concat(tone({ freq: (t) => 900 - 500 * t, seconds: 0.06, decay: 6 }), noise(0.04, 12, 0.15)),
  over: () => concat(tone({ freq: 392, seconds: 0.18, decay: 3 }), tone({ freq: 330, seconds: 0.18, decay: 3 }), tone({ freq: 262, seconds: 0.35, decay: 4 })),
  star: () => concat(tone({ freq: 784, seconds: 0.08, decay: 3, wave: 'sine' }), tone({ freq: 1047, seconds: 0.08, decay: 3, wave: 'sine' }), tone({ freq: 1568, seconds: 0.3, decay: 4, wave: 'sine' })),
  coin: () => concat(tone({ freq: 988, seconds: 0.06, decay: 5 }), tone({ freq: 1319, seconds: 0.18, decay: 6 })),
  levelup: () => concat(tone({ freq: 523, seconds: 0.1, decay: 3 }), tone({ freq: 659, seconds: 0.1, decay: 3 }), tone({ freq: 784, seconds: 0.1, decay: 3 }), tone({ freq: 1047, seconds: 0.35, decay: 4 })),
  refused: () => tone({ freq: 150, seconds: 0.12, decay: 6 }),
};

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, make] of Object.entries(SOUNDS)) {
  const file = path.join(OUT, `${name}.wav`);
  fs.writeFileSync(file, wav(make()));
  console.log(`${name}.wav ${fs.statSync(file).size} bytes`);
}
