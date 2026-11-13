import { gameById } from '../game/core/content';
import { playArmyBot } from '../game/army/bot';
import {
  addRange,
  applyGate,
  ArmyState,
  BASE_SOLDIERS,
  bestCount,
  createArmy,
  fortFactor,
  fortPoints,
  Gate,
  GatePair,
  generateRun,
  isMultiplicative,
  MAX_RUNS,
  PAIRS_PER_RUN,
  reduceArmy,
  RUN_ATTEMPTS,
  subRange,
  WALK_MS,
} from '../game/army/engine';

const add = (n: number): Gate => ({ op: 'add', n });
const sub = (n: number): Gate => ({ op: 'sub', n });
const MUL: Gate = { op: 'mul', n: 2 };
const DIV: Gate = { op: 'div', n: 2 };

/** A run whose 10 pairs are all `pair` (to script a fort exactly). */
function withPairs(state: ArmyState, pair: GatePair, defenders: number): ArmyState {
  const pairs = Array.from({ length: PAIRS_PER_RUN }, () => pair);
  return { ...state, pairs, best: bestCount(pairs, state.start), defenders };
}

/** Plays the 10 pairs on the given side, waiting out the walk after each gate. */
function playRun(state: ArmyState, side: 'left' | 'right'): ArmyState {
  let s = state;
  const run = s.run;
  for (let i = 0; i < PAIRS_PER_RUN && s.status === 'playing' && s.run === run; i++) {
    s = reduceArmy(s, { type: 'choose', side });
    s = reduceArmy(s, { type: 'tick', dt: WALK_MS });
  }
  return s;
}

describe('Armée de Poche engine (AC-81)', () => {
  it('AC-81: gates follow the shares and ranges per run, with at most one × 2 / ÷ 2 gate per pair', () => {
    const counts = { add: 0, sub: 0, mul: 0, div: 0 };
    let total = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const run = 1 + (seed % 8);
      const { pairs } = generateRun(run, 10, seed * 7919);
      expect(pairs).toHaveLength(PAIRS_PER_RUN);
      for (const pair of pairs) {
        expect(pair.filter(isMultiplicative).length).toBeLessThanOrEqual(1);
        for (const gate of pair) {
          counts[gate.op] += 1;
          total += 1;
          if (gate.op === 'add') {
            const [lo, hi] = addRange(run);
            expect(gate.n).toBeGreaterThanOrEqual(lo);
            expect(gate.n).toBeLessThanOrEqual(hi);
          } else if (gate.op === 'sub') {
            const [lo, hi] = subRange(run);
            expect(gate.n).toBeGreaterThanOrEqual(lo);
            expect(gate.n).toBeLessThanOrEqual(hi);
          } else expect(gate.n).toBe(2);
        }
      }
    }
    expect(addRange(1)).toEqual([2, 6]);
    expect(subRange(3)).toEqual([1, 5]);
    // Shares 45 / 25 / 15 / 15 % per roll; a second × 2 / ÷ 2 in a pair is re-rolled among +n / −n, so per gate the
    // expected shares are about 47.9 / 26.6 / 12.75 / 12.75 %.
    expect(counts.add / total).toBeCloseTo(0.479, 1);
    expect(counts.sub / total).toBeCloseTo(0.266, 1);
    expect(counts.mul / total).toBeCloseTo(0.1275, 1);
    expect(counts.div / total).toBeCloseTo(0.1275, 1);
    expect(Math.abs(counts.mul - counts.div) / total).toBeLessThan(0.02);
  });

  it('AC-81: gates apply +n, −n, × 2, ÷ 2 rounded down, never below 0', () => {
    expect(applyGate(add(7), 10)).toBe(17);
    expect(applyGate(sub(3), 10)).toBe(7);
    expect(applyGate(sub(5), 3)).toBe(0);
    expect(applyGate(MUL, 11)).toBe(22);
    expect(applyGate(DIV, 11)).toBe(5);
    expect(applyGate(DIV, 0)).toBe(0);
  });

  it('AC-81: best is reached by the greedy choice (equal to the best of all 1 024 paths) and is at least the start count', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const start = 10 + 5 * (seed % 4);
      const { pairs, best } = generateRun(1 + (seed % 8), start, seed);
      let optimum = 0;
      for (let mask = 0; mask < 1 << PAIRS_PER_RUN; mask++) {
        let soldiers = start;
        pairs.forEach((pair, i) => (soldiers = applyGate(pair[(mask >> i) & 1], soldiers)));
        optimum = Math.max(optimum, soldiers);
      }
      expect(best).toBe(optimum);
      expect(best).toBeGreaterThanOrEqual(start);
    }
  });

  it('AC-81: D = floor(f × best) with f = 0.25 / 0.3 / 0.35 / 0.4 then 0.45 (amended PRD)', () => {
    expect([1, 2, 3, 4, 5, 8].map(fortFactor)).toEqual([0.25, 0.3, 0.35, 0.4, 0.45, 0.45]);
    const state = createArmy(42);
    expect(state.defenders).toBe(Math.floor(0.25 * state.best));
    // Win run 1 with the greedy choice: run 2 has its own fort.
    let s = state;
    while (s.run === 1 && s.status === 'playing') {
      const [l, r] = s.pairs[s.pair];
      s = reduceArmy(s, { type: 'choose', side: applyGate(l, s.army) >= applyGate(r, s.army) ? 'left' : 'right' });
      s = reduceArmy(s, { type: 'tick', dt: WALK_MS });
    }
    expect(s.run).toBe(2);
    expect(s.army).toBe(s.start);
    expect(s.defenders).toBe(Math.floor(0.3 * s.best));
  });

  it('AC-81: a won run scores 100 + min(200, 5 × (army − D)) and counts as a combo; the army starts again', () => {
    expect(fortPoints(30, 25)).toBe(125);
    expect(fortPoints(200, 20)).toBe(300);
    const s = playRun(withPairs(createArmy(1), [add(3), sub(1)], 30), 'left'); // 10 + 30 = 40 soldiers vs 30
    expect(s.score).toBe(100 + 5 * 10);
    expect(s.combos).toBe(1);
    expect(s.run).toBe(2);
    expect(s.pair).toBe(0);
    expect(s.army).toBe(BASE_SOLDIERS);
    expect(s.lastFort).toEqual({ run: 1, won: true, army: 40, defenders: 30, points: 150 });
    expect(s.status).toBe('playing');
  });

  it('AC-81: a lost fort ends the round (army equal to D loses)', () => {
    const s = playRun(withPairs(createArmy(1), [add(3), sub(1)], 40), 'left');
    expect(s.status).toBe('over');
    expect(s.score).toBe(0);
    expect(s.events).toContainEqual({ kind: 'over', score: 0 });
    expect(s.lastFort?.won).toBe(false);
  });

  it('AC-81: the 8th run ends the round, at most 2 400 points', () => {
    let s: ArmyState = { ...createArmy(3), run: MAX_RUNS };
    s = playRun(withPairs(s, [MUL, add(2)], 0), 'left'); // 10 × 2^10 soldiers vs 0: 300 points
    expect(s.status).toBe('over');
    expect(s.score).toBe(300);
    expect(s.combos).toBe(1);
  });

  it('AC-81: taps during the 500 ms walk are ignored', () => {
    const first = reduceArmy(createArmy(9), { type: 'choose', side: 'left' });
    expect(first.walkMs).toBe(WALK_MS);
    const double = reduceArmy(first, { type: 'choose', side: 'right' });
    expect(double.events).toEqual([{ kind: 'ignored' }]);
    expect({ ...double, events: [] }).toEqual({ ...first, events: [] });
    const almost = reduceArmy(first, { type: 'tick', dt: WALK_MS - 1 });
    expect(reduceArmy(almost, { type: 'choose', side: 'right' }).pair).toBe(1);
    const walked = reduceArmy(almost, { type: 'tick', dt: 1 });
    expect(reduceArmy(walked, { type: 'choose', side: 'right' }).pair).toBe(2);
  });

  it('AC-81: « Recrues » adds 5 soldiers per level', () => {
    expect(createArmy(5).army).toBe(10);
    expect(createArmy(5, { recruits: 1 }).army).toBe(15);
    expect(createArmy(5, { recruits: 3 }).start).toBe(25);
    expect(createArmy(5, { recruits: 3 }).best).toBeGreaterThanOrEqual(25);
  });
});

describe('Armée de Poche balance and guards (AC-86)', () => {
  const [oneStar, , threeStars] = gameById('army').stars;
  const scores = Array.from({ length: 50 }, (_, i) => playArmyBot(i + 1).score).sort((a, b) => a - b);
  const median = (scores[24] + scores[25]) / 2;

  it('AC-86: the generator starts a round for every seed tried (bounded redraws, fallback never needed)', () => {
    for (let seed = 0; seed < 500; seed++) {
      const state = createArmy(seed * 2654435761);
      expect(state.status).toBe('playing');
      expect(state.pairs).toHaveLength(PAIRS_PER_RUN);
      expect(state.best).toBeGreaterThanOrEqual(state.start);
      for (let run = 1; run <= MAX_RUNS; run++) expect(generateRun(run, 10, seed + run * 1000).attempts).toBeLessThanOrEqual(RUN_ATTEMPTS);
    }
  });

  it('AC-86: a double tap during the walk changes nothing', () => {
    const once = reduceArmy(createArmy(11), { type: 'choose', side: 'left' });
    const twice = reduceArmy(reduceArmy(once, { type: 'tick', dt: 50 }), { type: 'choose', side: 'left' });
    expect(twice.army).toBe(once.army);
    expect(twice.pair).toBe(once.pair);
    expect(twice.score).toBe(once.score);
  });

  it('AC-86: the casual bot is deterministic per seed', () => {
    expect(playArmyBot(7).score).toBe(playArmyBot(7).score);
  });

  // Forts amended in the PRD after the first measure (f = 0.6 ... 0.9 gave the bot a median of 0).
  it('AC-86: over 50 seeds the casual bot (better gate 3 times in 4) has a median ≥ the 1-star threshold and < the 3-star one', () => {
    expect(median).toBeGreaterThanOrEqual(oneStar);
    expect(median).toBeLessThan(threeStars);
  });

  it('AC-86 (measured, reported): bot median / p10 / p90 over seeds 1-50', () => {
    expect({ median, p10: scores[5], p90: scores[45] }).toEqual({ median: 470, p10: 145, p90: 1305 });
  });
});
