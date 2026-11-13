import {
  angularDistance,
  CAKE_PAUSE_MS,
  CandlesState,
  candlesLeft,
  candlesNeeded,
  createCandles,
  normalize,
  presetCount,
  reduceCandles,
  spinSpeed,
  THROW_COOLDOWN_MS,
} from '../game/candles/engine';

/** Turns the cake to `rotation` directly (the turning itself is tested on its own). */
function at(state: CandlesState, rotation: number): CandlesState {
  return { ...state, rotation: normalize(rotation), cooldownMs: 0, pauseMs: 0 };
}

/** Throws into the current cake at angles spread evenly away from the existing candles, until it is complete. */
function completeCake(state: CandlesState): CandlesState {
  let s = state;
  const cake = s.cake;
  while (s.cake === cake && s.status === 'playing') {
    // Largest free gap: plant in its middle.
    const angles = s.candles.map((c) => c.angle).sort((a, b) => a - b);
    let target = 0;
    if (angles.length > 0) {
      let best = -1;
      angles.forEach((a, i) => {
        const b = i + 1 < angles.length ? angles[i + 1] : angles[0] + 360;
        if (b - a > best) {
          best = b - a;
          target = normalize(a + (b - a) / 2);
        }
      });
    }
    s = reduceCandles(at(s, -target), { type: 'throw' });
  }
  return s;
}

describe('Bougies Folles engine (AC-66)', () => {
  it('AC-66: cake n needs 5 + n candles (max 12) and holds min(n − 1, 4) pre-placed ones', () => {
    expect([1, 2, 3, 7, 8, 20].map(candlesNeeded)).toEqual([6, 7, 8, 12, 12, 12]);
    expect([1, 2, 3, 5, 6, 9].map(presetCount)).toEqual([0, 1, 2, 4, 4, 4]);
    const s = createCandles(42, {});
    expect(s.cake).toBe(1);
    expect(s.candles).toEqual([]);
    expect(candlesLeft(s)).toBe(6);
  });

  it('AC-66: the cake turns at min(250, 90 × (1 + 0.15 × (n − 1))) °/s, clockwise first, and reverses at each cake', () => {
    expect(spinSpeed(1, 0)).toBe(90);
    expect(spinSpeed(2, 0)).toBeCloseTo(103.5);
    expect(spinSpeed(12, 0)).toBeCloseTo(238.5);
    expect(spinSpeed(13, 0)).toBe(250);
    let s = createCandles(42, {});
    expect(s.dir).toBe(1);
    s = reduceCandles(s, { type: 'tick', dt: 1000 });
    expect(s.rotation).toBeCloseTo(90);
    s = reduceCandles(s, { type: 'tick', dt: 3500 });
    expect(s.rotation).toBeCloseTo(45); // wraps at 360
    s = completeCake(createCandles(42, {}));
    expect(s.cake).toBe(2);
    expect(s.dir).toBe(-1);
    expect(reduceCandles({ ...s, pauseMs: 0 }, { type: 'tick', dt: 1000 }).rotation).toBeCloseTo(360 - 103.5);
    s = completeCake(s);
    expect(s.cake).toBe(3);
    expect(s.dir).toBe(1);
  });

  it('AC-66: « Gâteau lent » slows the rotation by 8 % per level after the 250°/s cap', () => {
    expect(spinSpeed(1, 1)).toBeCloseTo(82.8);
    expect(spinSpeed(1, 3)).toBeCloseTo(68.4);
    expect(spinSpeed(20, 2)).toBeCloseTo(210);
    const s = reduceCandles(createCandles(1, { slow_spin: 2 }), { type: 'tick', dt: 1000 });
    expect(s.rotation).toBeCloseTo(75.6);
  });

  it('AC-66: a tap plants a candle at the bottom point (cake frame) and scores 10', () => {
    const s = reduceCandles(at(createCandles(7, {}), 90), { type: 'throw' });
    expect(s.candles).toEqual([{ angle: 270, preset: false }]);
    expect(s.score).toBe(10);
    expect(candlesLeft(s)).toBe(5);
    expect(s.events).toContainEqual({ kind: 'plant', angle: 270 });
    expect(s.combos).toBe(0);
  });

  it('AC-66: a candle closer than 14° to another ends the round; 14° exactly is allowed', () => {
    let s = reduceCandles(at(createCandles(7, {}), 0), { type: 'throw' }); // candle at 0
    const ok = reduceCandles(at(s, -14), { type: 'throw' });
    expect(ok.status).toBe('playing');
    expect(ok.score).toBe(20);
    s = reduceCandles(at(s, 13.9), { type: 'throw' }); // lands at 346.1: 13.9° from the first
    expect(s.status).toBe('over');
    expect(s.score).toBe(10);
    expect(s.events).toContainEqual({ kind: 'over', score: 10 });
    expect(reduceCandles(s, { type: 'throw' })).toBe(s);
    expect(reduceCandles(s, { type: 'tick', dt: 50 })).toBe(s);
  });

  it('AC-66: a cake completed scores 100 (+10 for its last candle), emits one combo and deals the next with its seeded candles', () => {
    const s = completeCake(createCandles(42, {}));
    expect(s.status).toBe('playing');
    expect(s.score).toBe(6 * 10 + 100);
    expect(s.combos).toBe(1);
    expect(s.events.filter((e) => e.kind === 'combo')).toHaveLength(1);
    expect(s.events).toContainEqual({ kind: 'cake', cake: 2 });
    expect(s.candles).toHaveLength(1);
    expect(s.candles[0].preset).toBe(true);
    expect(s.thrown).toBe(0);
    expect(s.rotation).toBe(0);
    expect(candlesLeft(s)).toBe(7);
  });

  it('AC-66: pre-placed candles are seeded (same seed, same cakes) and at least 30° apart', () => {
    const play = (seed: number) => {
      let s = createCandles(seed, {});
      const presets: number[][] = [];
      for (let cake = 1; cake <= 6; cake++) {
        presets.push(s.candles.filter((c) => c.preset).map((c) => c.angle));
        s = completeCake(s);
      }
      return { presets, s };
    };
    const a = play(1234);
    expect(play(1234).presets).toEqual(a.presets);
    expect(a.presets.map((p) => p.length)).toEqual([0, 1, 2, 3, 4, 4]);
    expect(a.s.combos).toBe(6);
    for (const preset of a.presets) {
      for (let i = 0; i < preset.length; i++) for (let j = i + 1; j < preset.length; j++) expect(angularDistance(preset[i], preset[j])).toBeGreaterThanOrEqual(30);
    }
    const other = play(99).presets;
    expect(other).not.toEqual(a.presets);
  });
});

describe('Bougies Folles timing guards (AC-72)', () => {
  it('ignores a throw during the 250 ms after the previous one, then accepts it', () => {
    let s = reduceCandles(createCandles(5), { type: 'throw' });
    expect(s.cooldownMs).toBe(THROW_COOLDOWN_MS);
    const early = reduceCandles(reduceCandles(s, { type: 'tick', dt: 200 }), { type: 'throw' });
    expect(early.events).toEqual([{ kind: 'ignored' }]);
    expect(early.thrown).toBe(1);
    expect(early.status).toBe('playing');
    s = reduceCandles(reduceCandles(s, { type: 'tick', dt: 250 }), { type: 'throw' });
    expect(s.thrown).toBe(2);
  });

  it('a double tap can no longer end the round: the candle 250 ms later is at least 22.5 degrees away', () => {
    let s = reduceCandles(createCandles(5), { type: 'throw' });
    for (let i = 0; i < 20; i++) s = reduceCandles(reduceCandles(s, { type: 'tick', dt: 16 }), { type: 'throw' });
    expect(s.status).toBe('playing');
    const [a, b] = s.candles.filter((c) => !c.preset).map((c) => c.angle);
    expect(angularDistance(a, b)).toBeGreaterThanOrEqual(22.5 - 1e-9);
  });

  it('pauses 1 s between two cakes: the new cake stands still and throws are ignored', () => {
    const done = completeCake(createCandles(5));
    expect(done.cake).toBe(2);
    expect(done.pauseMs).toBe(CAKE_PAUSE_MS);
    const still = reduceCandles(done, { type: 'tick', dt: 500 });
    expect(still.rotation).toBe(done.rotation);
    expect(reduceCandles(still, { type: 'throw' }).events).toEqual([{ kind: 'ignored' }]);
    const after = reduceCandles(reduceCandles(still, { type: 'tick', dt: 500 }), { type: 'tick', dt: 100 });
    expect(after.pauseMs).toBe(0);
    expect(after.rotation).not.toBe(done.rotation);
    expect(reduceCandles(after, { type: 'throw' }).thrown).toBe(1);
  });
});
