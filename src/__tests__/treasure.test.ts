import { gameById } from '../game/core/content';
import { bestCells, playTreasureBot } from '../game/treasure/bot';
import {
  acceptsInput,
  bandOf,
  BASE_DIGS,
  createTreasure,
  DIG_MS,
  distance,
  MAP_SHOW_MS,
  mapScore,
  reduceTreasure,
  TREASURE_CELLS,
  TREASURE_MAPS,
  TreasureState,
} from '../game/treasure/engine';

const dig = (state: TreasureState, cell: number) => reduceTreasure(state, { type: 'dig', cell });
const tick = (state: TreasureState, dt = 50) => reduceTreasure(state, { type: 'tick', dt });

function settle(state: TreasureState): TreasureState {
  let s = state;
  for (let i = 0; i < 100 && s.status === 'playing' && !acceptsInput(s); i++) s = tick(s);
  return s;
}

/** Digs `cell` and lets the guard (and a finished map's pause) run out, 50 ms per frame. */
const digAt = (state: TreasureState, cell: number) => settle(dig(state, cell));

/** Undug cells other than the chest, farthest first. */
const misses = (state: TreasureState) =>
  Array.from({ length: TREASURE_CELLS }, (_, c) => c)
    .filter((c) => c !== state.chest && state.dug[c] === null)
    .sort((a, b) => distance(b, state.chest) - distance(a, state.chest));

describe('Chasse au Trésor engine (AC-85)', () => {
  it('AC-85: the bands of the Manhattan distance are 0 / 1-2 / 3-4 / 5-7 / 8+', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 14].map(bandOf)).toEqual(['found', 'burning', 'burning', 'hot', 'hot', 'warm', 'warm', 'warm', 'cold', 'cold']);
    expect(distance(0, 63)).toBe(14);
    expect(distance(9, 18)).toBe(2);
  });

  it('AC-85: each dig shows the band of its distance to the chest; the chest is seeded and every seed starts a round', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const state = createTreasure(seed * 104729);
      expect(state.status).toBe('playing');
      expect(state.chest).toBeGreaterThanOrEqual(0);
      expect(state.chest).toBeLessThan(TREASURE_CELLS);
      const cell = (seed * 13) % TREASURE_CELLS;
      const after = dig(state, cell);
      const band = bandOf(distance(cell, state.chest));
      expect(after.dug[cell]).toBe(band);
      expect(after.events[0]).toEqual({ kind: 'dig', cell, band });
    }
    expect(createTreasure(5).chest).toBe(createTreasure(5).chest);
  });

  it('AC-85: a dug cell cannot be dug again (no dig spent)', () => {
    let state = createTreasure(11);
    const cell = misses(state)[0];
    state = digAt(state, cell);
    expect(state.digsLeft).toBe(BASE_DIGS - 1);
    const again = dig(state, cell);
    expect(again.events).toEqual([{ kind: 'ignored' }]);
    expect(again.digsLeft).toBe(BASE_DIGS - 1);
    expect(again.dug).toBe(state.dug);
  });

  it('AC-85: 8 digs per map, +1 per « Détecteur » level', () => {
    expect(createTreasure(1).digsLeft).toBe(8);
    expect(createTreasure(1, { detector: 1 }).digsLeft).toBe(9);
    expect(createTreasure(1, { detector: 3 }).digsLeft).toBe(11);
  });

  it('AC-85: a found chest scores 100 + 20 × digs left after the finding dig; within 3 digs it is a combo', () => {
    expect(mapScore(7)).toBe(240);
    expect(mapScore(0)).toBe(100);
    // First dig on the chest: 7 digs left → 240, combo.
    let state = createTreasure(21);
    state = dig(state, state.chest);
    expect(state.events).toEqual([
      { kind: 'dig', cell: state.chest, band: 'found' },
      { kind: 'found', map: 1, digs: 1, points: 240 },
      { kind: 'score', points: 240 },
      { kind: 'combo' },
    ]);
    expect(state.score).toBe(240);
    expect(state.combos).toBe(1);
    state = settle(state);
    expect(state.map).toBe(2);

    // Three misses then the chest: 4 digs → 100 + 20 × 4 = 180, no combo.
    for (const cell of misses(state).slice(0, 3)) state = digAt(state, cell);
    state = dig(state, state.chest);
    expect(state.events).toContainEqual({ kind: 'found', map: 2, digs: 4, points: 180 });
    expect(state.events).not.toContainEqual({ kind: 'combo' });
    expect(state.score).toBe(420);
    expect(state.combos).toBe(1);

    // Two misses then the chest: 3 digs → combo.
    state = settle(state);
    for (const cell of misses(state).slice(0, 2)) state = digAt(state, cell);
    state = dig(state, state.chest);
    expect(state.events).toContainEqual({ kind: 'found', map: 3, digs: 3, points: 200 });
    expect(state.events).toContainEqual({ kind: 'combo' });
  });

  it('AC-85: out of digs the map scores 0 and the next one starts; a round is 5 maps', () => {
    let state = createTreasure(77);
    for (const cell of misses(state).slice(0, BASE_DIGS - 1)) state = digAt(state, cell);
    expect(state.digsLeft).toBe(1);
    state = dig(state, misses(state)[0]);
    expect(state.events).toContainEqual({ kind: 'lost', map: 1 });
    expect(state.score).toBe(0);
    state = settle(state);
    expect(state.map).toBe(2);
    expect(state.digsLeft).toBe(BASE_DIGS);
    expect(state.events).toEqual([{ kind: 'map', map: 2 }]);
    for (let k = 2; k <= TREASURE_MAPS; k++) state = settle(dig(state, state.chest));
    expect(state.status).toBe('over');
    expect(state.score).toBe(4 * 240);
    expect(state.events).toEqual([{ kind: 'over', score: 960 }]);
    expect(dig(state, 0).events).toEqual([]);
  });
});

describe('Chasse au Trésor guard and casual bot (AC-86)', () => {
  it('AC-86: a dig animates in 200 ms: taps (and a double tap) inside the guard change nothing', () => {
    let state = createTreasure(3);
    const [a, b] = misses(state);
    state = dig(state, a);
    expect(state.busyMs).toBe(DIG_MS);
    const dug = state;
    for (const cell of [a, b, b]) {
      state = dig(state, cell);
      expect(state.events).toEqual([{ kind: 'ignored' }]);
      expect(state.dug).toBe(dug.dug);
      expect(state.digsLeft).toBe(BASE_DIGS - 1);
    }
    for (let t = 50; t < DIG_MS; t += 50) {
      state = tick(state);
      expect(dig(state, b).events).toEqual([{ kind: 'ignored' }]);
    }
    state = tick(state);
    expect(dig(state, b).digsLeft).toBe(BASE_DIGS - 2);
  });

  it('AC-86: a finished map stays shown 800 ms (taps ignored), then the next map comes', () => {
    let state = dig(createTreasure(4), createTreasure(4).chest);
    expect(state.doneMs).toBe(MAP_SHOW_MS);
    for (let t = 50; t < MAP_SHOW_MS; t += 50) {
      state = tick(state);
      expect(state.map).toBe(1);
      expect(dig(state, 0).events).toEqual([{ kind: 'ignored' }]);
    }
    state = tick(state);
    expect(state.map).toBe(2);
    expect(acceptsInput(state)).toBe(true);
  });

  it('AC-86: the bot digs among the cells that match the most clues', () => {
    let state = createTreasure(9);
    expect(bestCells(state)).toHaveLength(TREASURE_CELLS);
    state = digAt(state, misses(state)[0]);
    const best = bestCells(state);
    for (const cell of best) expect(bandOf(distance(cell, misses(createTreasure(9))[0]))).toBe(state.dug[misses(createTreasure(9))[0]]);
    expect(best).toContain(state.chest);
  });

  it('AC-86: the casual bot (cell matching the most clues, seeded ties) has a median between 1 and 3 stars over 50 seeds', () => {
    const [one, , three] = gameById('treasure').stars;
    const scores = Array.from({ length: 50 }, (_, i) => {
      const end = playTreasureBot(500 + i * 11);
      expect(end.status).toBe('over');
      return end.score;
    }).sort((a, b) => a - b);
    const median = (scores[24] + scores[25]) / 2;
    // BOT_STATS=1 prints the measured distribution (for the PRD balance table).
    if (process.env.BOT_STATS) console.log(`treasure bot: median ${median}, p10 ${scores[4]}, p90 ${scores[44]} (stars ${gameById('treasure').stars.join(' / ')})`);
    expect(median).toBeGreaterThanOrEqual(one);
    expect(median).toBeLessThan(three);
  });
});
