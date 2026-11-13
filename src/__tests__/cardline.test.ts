import { gameById } from '../game/core/content';
import { BOT_USELESS_CHANCE, playCardlineBot } from '../game/cardline/bot';
import {
  acceptsInput,
  CARDLINE_FAIL_AFTER,
  CARDLINE_ROWS,
  CardlineState,
  createCardline,
  cycles,
  dealRow,
  isSorted,
  minSwaps,
  placingSwap,
  reduceCardline,
  ROW_SHOW_MS,
  rowLength,
  rowScore,
  SWAP_MS,
} from '../game/cardline/engine';

const tap = (state: CardlineState, index: number) => reduceCardline(state, { type: 'tap', index });
const tick = (state: CardlineState, dt = 50) => reduceCardline(state, { type: 'tick', dt });

/** Ticks frame by frame (50 ms) until taps are taken again (or the round is over). */
function settle(state: CardlineState): CardlineState {
  let s = state;
  for (let i = 0; i < 100 && s.status === 'playing' && !acceptsInput(s); i++) s = tick(s);
  return s;
}

/** Swaps two cards (two taps) and lets the guard run out. */
const swapAt = (state: CardlineState, a: number, b: number) => settle(tap(tap(state, a), b));

/** Sorts the current row at par (placing swaps). */
function sortRow(state: CardlineState): CardlineState {
  let s = state;
  const row = s.row;
  while (s.row === row && s.status === 'playing' && s.doneMs === 0) {
    const [a, b] = placingSwap(s.cards) as [number, number];
    s = tap(tap(s, a), b);
    if (s.doneMs === 0) s = settle(s);
  }
  return s;
}

/** A swap that places no card (both cards stay misplaced). */
function wastedPair(cards: readonly number[]): [number, number] {
  for (let a = 0; a < cards.length; a++) for (let b = a + 1; b < cards.length; b++) if (cards[b] !== a + 1 && cards[a] !== b + 1) return [a, b];
  throw new Error('no wasted pair');
}

/** Brute-force minimum number of swaps (breadth-first), to check par = n − cycles on small rows. */
function bfsSwaps(cards: readonly number[]): number {
  const key = (c: readonly number[]) => c.join(',');
  const goal = key([...cards].sort((x, y) => x - y));
  let frontier = [cards.slice()];
  const seen = new Set([key(cards)]);
  for (let d = 0; ; d++) {
    if (frontier.some((c) => key(c) === goal)) return d;
    const next: number[][] = [];
    for (const c of frontier) {
      for (let a = 0; a < c.length; a++) {
        for (let b = a + 1; b < c.length; b++) {
          const n = c.slice();
          [n[a], n[b]] = [n[b], n[a]];
          const k = key(n);
          if (!seen.has(k)) {
            seen.add(k);
            next.push(n);
          }
        }
      }
    }
    frontier = next;
  }
}

describe('Suite de Cartes engine (AC-78)', () => {
  it('AC-78: rows of 5 to 9 cards never start sorted; they are seeded permutations of 1..n (300 seeds × 5 rows)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      let state = createCardline(seed * 7919);
      for (let k = 1; k <= CARDLINE_ROWS; k++) {
        expect(state.row).toBe(k);
        expect(state.cards).toHaveLength(rowLength(k));
        expect(rowLength(k)).toBe(4 + k);
        expect([...state.cards].sort((a, b) => a - b)).toEqual(Array.from({ length: 4 + k }, (_, i) => i + 1));
        expect(isSorted(state.cards)).toBe(false);
        expect(state.par).toBeGreaterThanOrEqual(1);
        state = settle(sortRow(state));
      }
      expect(state.status).toBe('over');
    }
    expect(createCardline(42).cards).toEqual(createCardline(42).cards);
    // Bounded generator: with no shuffle allowed, the fallback is a rotation, never sorted.
    expect(dealRow(5, 1, 0).cards).toEqual([2, 3, 4, 5, 1]);
  });

  it('AC-78: par = n − number of cycles = the minimum number of swaps', () => {
    expect(cycles([1, 2, 3, 4, 5])).toBe(5);
    expect(cycles([2, 1, 3, 4, 5])).toBe(4);
    expect(cycles([2, 3, 4, 5, 1])).toBe(1);
    expect(minSwaps([2, 3, 4, 5, 1])).toBe(4);
    expect(minSwaps([2, 1, 4, 3, 5])).toBe(2);
    for (let seed = 1; seed <= 60; seed++) {
      const { cards } = dealRow(5 + (seed % 3), seed);
      expect(minSwaps(cards)).toBe(bfsSwaps(cards));
    }
    const state = createCardline(9);
    expect(state.par).toBe(state.cards.length - cycles(state.cards));
  });

  it('AC-78: a tap selects, a second tap on the same card unselects, a tap on another card swaps the two', () => {
    let state = createCardline(3);
    const before = state.cards;
    state = tap(state, 1);
    expect(state.selected).toBe(1);
    expect(state.events).toEqual([{ kind: 'select', index: 1 }]);
    state = tap(state, 1);
    expect(state.selected).toBeNull();
    expect(state.events).toEqual([{ kind: 'unselect', index: 1 }]);
    expect(state.swaps).toBe(0);
    state = tap(tap(state, 0), 3);
    expect(state.cards[0]).toBe(before[3]);
    expect(state.cards[3]).toBe(before[0]);
    expect(state.cards.filter((_, i) => i !== 0 && i !== 3)).toEqual(before.filter((_, i) => i !== 0 && i !== 3));
    expect(state.swaps).toBe(1);
    expect(state.selected).toBeNull();
    expect(state.events[0]).toEqual({ kind: 'swap', a: 0, b: 3 });
    // Out-of-range taps are ignored.
    expect(tap(settle(state), 99).selected).toBeNull();
  });

  it('AC-78: row score max(50, 200 − 20 × swaps beyond par); a row sorted at par is a combo; maximum 1 000', () => {
    expect(rowScore(3, 3)).toBe(200);
    expect(rowScore(4, 3)).toBe(180);
    expect(rowScore(10, 3)).toBe(60);
    expect(rowScore(11, 3)).toBe(50);
    expect(rowScore(30, 3)).toBe(50);

    let state = createCardline(77);
    state = sortRow(state);
    expect(state.events).toContainEqual(expect.objectContaining({ kind: 'sorted', row: 1, points: 200 }));
    expect(state.events).toContainEqual({ kind: 'combo' });
    expect(state.combos).toBe(1);
    expect(state.score).toBe(200);

    // Two wasted swaps then sorted: par + 2 (or more) swaps, no combo.
    state = settle(state);
    expect(state.row).toBe(2);
    const par = state.par;
    for (let i = 0; i < 2; i++) {
      const [a, b] = wastedPair(state.cards);
      state = swapAt(state, a, b);
    }
    state = sortRow(state);
    const sorted = state.events.find((e) => e.kind === 'sorted') as { swaps: number; points: number };
    expect(sorted.swaps).toBeGreaterThan(par);
    expect(sorted.points).toBe(rowScore(sorted.swaps, par));
    expect(state.combos).toBe(1);

    let full = createCardline(1234);
    for (let k = 1; k <= CARDLINE_ROWS; k++) full = settle(sortRow(full));
    expect(full.status).toBe('over');
    expect(full.score).toBe(1000);
    expect(full.combos).toBe(5);
  });

  it('AC-78: a row still unsorted after par + 10 swaps is failed (0 points); the round ends after 5 rows', () => {
    let state = createCardline(31);
    const limit = state.par + CARDLINE_FAIL_AFTER;
    // Swapping the same two cards back and forth never sorts the row.
    const [a, b] = wastedPair(state.cards);
    for (let i = 0; i < limit - 1; i++) state = swapAt(state, a, b);
    expect(state.row).toBe(1);
    expect(state.swaps).toBe(limit - 1);
    state = tap(tap(state, a), b);
    expect(state.events).toContainEqual({ kind: 'failed', row: 1 });
    expect(state.score).toBe(0);
    state = settle(state);
    expect(state.row).toBe(2);
    expect(state.events).toEqual([{ kind: 'row', row: 2 }]);
    for (let k = 2; k <= CARDLINE_ROWS; k++) {
      while (state.row === k && state.status === 'playing') {
        const [x, y] = wastedPair(state.cards);
        state = swapAt(state, x, y);
      }
    }
    expect(state.status).toBe('over');
    expect(state.score).toBe(0);
    expect(tap(state, 0).events).toEqual([]);
  });

  it('AC-78: « Indice » gives 1 / 2 / 3 hints; a hint shows a swap that puts one card at its place and is not a swap', () => {
    expect(createCardline(1).hintsLeft).toBe(0);
    expect(reduceCardline(createCardline(1), { type: 'hint' }).events).toEqual([]);
    for (let seed = 1; seed <= 200; seed++) {
      let state = createCardline(seed, { hint: 3 });
      expect(state.hintsLeft).toBe(3);
      state = reduceCardline(state, { type: 'hint' });
      const [a, b] = state.hint as [number, number];
      expect(state.hintsLeft).toBe(2);
      expect(state.swaps).toBe(0);
      expect(state.cards[a] === b + 1 || state.cards[b] === a + 1).toBe(true);
      expect(reduceCardline(state, { type: 'hint' }).hintsLeft).toBe(2); // refused while shown
      const par = state.par;
      state = tap(tap(state, a), b);
      expect(state.hint).toBeNull();
      expect(state.cards[b]).toBe(b + 1);
      // A placing swap is always on a shortest solution.
      if (state.doneMs === 0) expect(minSwaps(state.cards)).toBe(par - 1);
    }
  });
});

describe('Suite de Cartes guard and casual bot (AC-86)', () => {
  it('AC-86: a swap animates in 200 ms: taps (and a double tap) inside the guard change nothing', () => {
    let state = createCardline(8);
    state = tap(tap(state, 0), 1);
    expect(state.busyMs).toBe(SWAP_MS);
    const swapped = state;
    for (const i of [2, 2, 3, 0]) {
      state = tap(state, i);
      expect(state.events).toEqual([{ kind: 'ignored' }]);
      expect(state.selected).toBeNull();
      expect(state.cards).toBe(swapped.cards);
      expect(state.swaps).toBe(1);
    }
    expect(reduceCardline(state, { type: 'hint' }).events).toEqual([{ kind: 'ignored' }]);
    for (let t = 50; t < SWAP_MS; t += 50) {
      state = tick(state);
      expect(tap(state, 2).events).toEqual([{ kind: 'ignored' }]);
    }
    state = tick(state);
    expect(state.busyMs).toBe(0);
    expect(tap(state, 2).selected).toBe(2);
  });

  it('AC-86: a finished row stays shown 600 ms (taps ignored), then the next row comes', () => {
    let state = sortRow(createCardline(5));
    expect(state.doneMs).toBe(ROW_SHOW_MS);
    expect(isSorted(state.cards)).toBe(true);
    for (let t = 50; t < ROW_SHOW_MS; t += 50) {
      state = tick(state);
      expect(state.row).toBe(1);
      expect(tap(state, 0).events).toEqual([{ kind: 'ignored' }]);
    }
    state = tick(state);
    expect(state.row).toBe(2);
    expect(acceptsInput(state)).toBe(true);
  });

  it('AC-86: the casual bot (smallest misplaced card to its place, 25 % useless swaps) has a median between 1 and 3 stars over 50 seeds', () => {
    expect(BOT_USELESS_CHANCE).toBe(0.25);
    const [one, , three] = gameById('cardline').stars;
    const scores = Array.from({ length: 50 }, (_, i) => {
      const end = playCardlineBot(1000 + i * 7);
      expect(end.status).toBe('over');
      return end.score;
    }).sort((a, b) => a - b);
    const median = (scores[24] + scores[25]) / 2;
    // BOT_STATS=1 prints the measured distribution (for the PRD balance table).
    if (process.env.BOT_STATS) console.log(`cardline bot: median ${median}, p10 ${scores[4]}, p90 ${scores[44]} (stars ${gameById('cardline').stars.join(' / ')})`);
    expect(median).toBeGreaterThanOrEqual(one);
    expect(median).toBeLessThan(three);
  });
});
