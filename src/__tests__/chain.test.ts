import { BOT_MAX_LENGTH, BOT_MIN_LENGTH, botChain, playChainBot } from '../game/chain/bot';
import {
  adjacent,
  CHAIN_CELLS,
  CHAIN_COLS,
  CHAIN_GUARD_MS,
  CHAIN_MIN,
  CHAIN_ROUND,
  CHAIN_ROWS,
  chainGain,
  chainPoints,
  ChainState,
  cellOf,
  collapse,
  createChain,
  dealBoard,
  hasPair,
  LONG_CHAIN,
  LONG_GAIN,
  neighbours,
  POINTS_FACTOR,
  REDEAL_ATTEMPTS,
  reduceChain,
  SEED_MAX,
  SHORT_GAIN,
} from '../game/chain/engine';
import { gameById } from '../game/core/content';
import { createRng } from '../game/rng';

/** A board from 6 rows of 5 numbers. */
function board(rows: readonly (readonly number[])[]): number[] {
  expect(rows).toHaveLength(CHAIN_ROWS);
  for (const row of rows) expect(row).toHaveLength(CHAIN_COLS);
  return rows.flat();
}

/** A diagonal of 1s from (1, 1) to (4, 4), plus two 1s on the top row: (0, 0) and (1, 0). */
const DIAGONAL = [
  [1, 1, 2, 3, 2],
  [2, 1, 3, 2, 3],
  [3, 2, 1, 3, 2],
  [2, 3, 2, 1, 3],
  [3, 2, 3, 2, 1],
  [2, 3, 2, 3, 2],
];

/** No two neighbours alike (values 5 to 8 by row and column parity). */
const NO_PAIR = Array.from({ length: CHAIN_ROWS }, (_, r) => Array.from({ length: CHAIN_COLS }, (_, c) => 5 + (r % 2) * 2 + (c % 2)));

function on(rows: readonly (readonly number[])[], extra: Partial<ChainState> = {}): ChainState {
  const cells = board(rows);
  return { ...createChain(7), cells, best: Math.max(...cells), ...extra };
}

function taps(state: ChainState, cells: readonly number[]): ChainState {
  let s = state;
  for (const cell of cells) s = reduceChain(s, { type: 'tap', cell });
  return s;
}

const sorted = (values: readonly number[]) => values.slice().sort((a, b) => a - b);
const quantile = (values: readonly number[], q: number) => sorted(values)[Math.round(q * (values.length - 1))];
const median = (values: number[]) => {
  const s = sorted(values);
  return (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2;
};

/** A player who taps cells at random: `count` taps, each after the guard. */
function playRandom(seed: number, count: number): ChainState {
  const rng = createRng(seed);
  let state = createChain(seed);
  for (let i = 0; i < count && state.status === 'playing'; i++) {
    state = reduceChain(state, { type: 'tap', cell: rng.int(CHAIN_CELLS) });
    state = reduceChain(state, { type: 'tick', dt: CHAIN_GUARD_MS });
  }
  return state;
}

describe('Chaîne de Nombres engine (AC-105)', () => {
  it('AC-108: the generator starts a round for 200 seeds: 5 × 6 numbers of 1 to 3 with a pair, 25 chains to make', () => {
    for (let seed = 0; seed < 200; seed++) {
      const state = createChain(seed);
      expect(state.status).toBe('playing');
      expect(state.cells).toHaveLength(CHAIN_CELLS);
      expect(state.cells.every((v) => Number.isInteger(v) && v >= 1 && v <= SEED_MAX)).toBe(true);
      expect(hasPair(state.cells)).toBe(true);
      expect(state.chain).toEqual([]);
      expect(state.chainsLeft).toBe(CHAIN_ROUND);
      expect(state.best).toBe(Math.max(...state.cells));
      expect(state.shufflesLeft).toBe(0);
      expect(state).toEqual(createChain(seed)); // seeded
    }
    expect(CHAIN_ROUND).toBe(25);
    expect(createChain(3, { shuffle: 2 }).shufflesLeft).toBe(2);
  });

  it('AC-105: a deal is bounded and always holds a pair, by force after the last attempt', () => {
    for (let seed = 0; seed < 100; seed++) {
      const dealt = dealBoard(seed);
      expect(dealt.attempts).toBeLessThanOrEqual(REDEAL_ATTEMPTS + 1);
      expect(hasPair(dealt.cells)).toBe(true);
      // No attempt allowed: one board is drawn and gets its pair by force.
      const forced = dealBoard(seed, 0);
      expect(forced).toMatchObject({ attempts: 1, forced: true });
      expect(forced.cells[1]).toBe(forced.cells[0]);
      expect(hasPair(forced.cells)).toBe(true);
      expect(forced.cells.every((v) => v >= 1 && v <= SEED_MAX)).toBe(true);
    }
    expect(hasPair(board(NO_PAIR))).toBe(false);
    expect(hasPair(board(DIAGONAL))).toBe(true);
  });

  it('AC-105: cells are neighbours in 8 directions', () => {
    expect(neighbours(cellOf(0, 0))).toHaveLength(3);
    expect(neighbours(cellOf(4, 5))).toHaveLength(3);
    expect(neighbours(cellOf(2, 0))).toHaveLength(5);
    expect(neighbours(cellOf(2, 2)).sort((a, b) => a - b)).toEqual(
      [cellOf(1, 1), cellOf(2, 1), cellOf(3, 1), cellOf(1, 2), cellOf(3, 2), cellOf(1, 3), cellOf(2, 3), cellOf(3, 3)].sort((a, b) => a - b),
    );
    expect(adjacent(cellOf(4, 0), cellOf(0, 1))).toBe(false); // no wrap around the edges
    expect(adjacent(cellOf(2, 2), cellOf(2, 2))).toBe(false);
    expect(adjacent(cellOf(2, 2), cellOf(4, 2))).toBe(false);
  });

  it('AC-105: a chain grows through neighbours of the same value: across, down and diagonally', () => {
    const state = on(DIAGONAL);
    const one = reduceChain(state, { type: 'tap', cell: cellOf(0, 0) });
    expect(one.chain).toEqual([cellOf(0, 0)]);
    expect(one.events).toEqual([{ kind: 'start', cell: cellOf(0, 0) }]);
    const two = reduceChain(one, { type: 'tap', cell: cellOf(1, 0) }); // across
    expect(two.events).toEqual([{ kind: 'extend', cell: cellOf(1, 0) }]);
    const three = reduceChain(two, { type: 'tap', cell: cellOf(1, 1) }); // down
    const four = reduceChain(three, { type: 'tap', cell: cellOf(2, 2) }); // diagonal
    expect(four.chain).toEqual([cellOf(0, 0), cellOf(1, 0), cellOf(1, 1), cellOf(2, 2)]);
    expect(four.cells).toBe(state.cells); // nothing moves before the validation
    expect(four.guardMs).toBe(0);
    // The other diagonals: up-left, up-right, down-left.
    expect(taps(state, [cellOf(2, 2), cellOf(1, 1)]).chain).toHaveLength(2);
    expect(taps(on([[2, 1, 2, 3, 2], [1, 3, 3, 2, 3], ...DIAGONAL.slice(2)]), [cellOf(0, 1), cellOf(1, 0)]).chain).toHaveLength(2);
    expect(taps(on([[2, 1, 2, 3, 2], [1, 3, 3, 2, 3], ...DIAGONAL.slice(2)]), [cellOf(1, 0), cellOf(0, 1)]).chain).toHaveLength(2);
  });

  it('AC-105: a tap on another value, a far cell or a cell of the chain cancels the chain; the board does not change', () => {
    const state = on(DIAGONAL);
    // A neighbour holding another value.
    const other = taps(state, [cellOf(0, 0), cellOf(1, 0), cellOf(2, 0)]);
    expect(other.chain).toEqual([]);
    expect(other.events).toEqual([{ kind: 'cancel', cell: cellOf(2, 0) }]);
    // The same value, but not next to the last cell.
    expect(taps(state, [cellOf(0, 0), cellOf(2, 2)]).chain).toEqual([]);
    // A cell already in the chain, next to the last one: each cell once.
    const again = taps(state, [cellOf(0, 0), cellOf(1, 0), cellOf(1, 1), cellOf(0, 0)]);
    expect(again.chain).toEqual([]);
    expect(again.events).toEqual([{ kind: 'cancel', cell: cellOf(0, 0) }]);
    // A chain of one cell is too short: its second tap cancels it.
    expect(CHAIN_MIN).toBe(2);
    const single = taps(state, [cellOf(0, 0), cellOf(0, 0)]);
    expect(single.events).toEqual([{ kind: 'cancel', cell: cellOf(0, 0) }]);
    for (const s of [other, again, single]) {
      expect(s.cells).toBe(state.cells);
      expect(s.score).toBe(0);
      expect(s.chainsLeft).toBe(CHAIN_ROUND);
      expect(s.guardMs).toBe(0);
      expect(s.rngState).toBe(state.rngState);
    }
    // A cell off the board is ignored and keeps the chain.
    expect(taps(state, [cellOf(0, 0), 99]).chain).toEqual([cellOf(0, 0)]);
    expect(taps(state, [cellOf(0, 0), 1.5]).events).toEqual([{ kind: 'ignored' }]);
  });

  it('AC-105: tapping the last cell again validates 2 cells: value + 1 on the last, the other refilled from the seed, 10 × value × cells', () => {
    expect(chainGain(2)).toBe(SHORT_GAIN);
    expect(chainGain(3)).toBe(SHORT_GAIN);
    expect(chainGain(4)).toBe(LONG_GAIN);
    expect(chainGain(7)).toBe(LONG_GAIN);
    expect([SHORT_GAIN, LONG_GAIN, LONG_CHAIN, POINTS_FACTOR]).toEqual([1, 2, 4, 10]);
    expect(chainPoints(3, 5)).toBe(150);

    const state = on(DIAGONAL);
    const done = taps(state, [cellOf(0, 0), cellOf(1, 0), cellOf(1, 0)]);
    const refill = 1 + createRng(state.rngState).int(SEED_MAX);
    expect(done.cells).toEqual(board([[refill, 2, 2, 3, 2], ...DIAGONAL.slice(1)]));
    expect(done.events).toEqual([
      { kind: 'chain', cells: [cellOf(0, 0), cellOf(1, 0)], value: 1, result: 2, at: cellOf(1, 0), changed: [cellOf(0, 0)], points: 20 },
      { kind: 'score', points: 20 },
    ]);
    expect(done).toMatchObject({ score: 20, combos: 0, chainsLeft: CHAIN_ROUND - 1, chain: [], guardMs: CHAIN_GUARD_MS, best: 3, status: 'playing' });
    expect(done.rngState).not.toBe(state.rngState);
  });

  it('AC-105: 3 cells give value + 1, 4 cells or more value + 2 and a combo', () => {
    const state = on(DIAGONAL);
    const three = taps(state, [cellOf(0, 0), cellOf(1, 0), cellOf(1, 1), cellOf(1, 1)]);
    expect(three.cells[cellOf(1, 1)]).toBe(2);
    expect(three).toMatchObject({ score: 30, combos: 0 });
    const four = taps(state, [cellOf(0, 0), cellOf(1, 0), cellOf(1, 1), cellOf(2, 2), cellOf(2, 2)]);
    expect(four.cells[cellOf(2, 2)]).toBe(3);
    expect(four).toMatchObject({ score: 40, combos: 1, best: 3 });
    expect(four.events.map((e) => e.kind)).toEqual(['chain', 'score', 'combo']);
    const six = taps(state, [cellOf(0, 0), cellOf(1, 0), cellOf(1, 1), cellOf(2, 2), cellOf(3, 3), cellOf(4, 4), cellOf(4, 4)]);
    expect(six.cells[cellOf(4, 4)]).toBe(3);
    expect(six).toMatchObject({ score: 60, combos: 1 });
    // The points follow the value: two 3s score 60 and make a 4.
    const threes = taps(on([[3, 3, 2, 1, 2], ...DIAGONAL.slice(1)]), [cellOf(0, 0), cellOf(1, 0), cellOf(1, 0)]);
    expect(threes.score).toBe(60);
    expect(threes.cells[cellOf(1, 0)]).toBe(4);
    expect(threes.best).toBe(4);
  });

  it('AC-105: the other cells of the chain empty, the numbers above fall and seeded numbers fill the top, column by column', () => {
    const state = on(DIAGONAL);
    // Up the diagonal: (4, 4), (3, 3), (2, 2) empty, (1, 1) becomes 3.
    const done = taps(state, [cellOf(4, 4), cellOf(3, 3), cellOf(2, 2), cellOf(1, 1), cellOf(1, 1)]);
    const rng = createRng(state.rngState);
    const [a, b, c] = [1 + rng.int(SEED_MAX), 1 + rng.int(SEED_MAX), 1 + rng.int(SEED_MAX)]; // columns 2, 3, 4
    expect(done.cells).toEqual(
      board([
        [1, 1, a, b, c],
        [2, 3, 2, 3, 2],
        [3, 2, 3, 2, 3],
        [2, 3, 2, 3, 2],
        [3, 2, 3, 2, 3],
        [2, 3, 2, 3, 2],
      ]),
    );
    expect(done.rngState).toBe(rng.state());
    const event = done.events.find((e) => e.kind === 'chain');
    expect(event).toMatchObject({ value: 1, result: 3, at: cellOf(1, 1), points: 40 });
    if (event?.kind !== 'chain') throw new Error('no chain event');
    expect(sorted(event.changed)).toEqual(
      sorted([cellOf(2, 0), cellOf(2, 1), cellOf(2, 2), cellOf(3, 0), cellOf(3, 1), cellOf(3, 2), cellOf(3, 3), cellOf(4, 0), cellOf(4, 1), cellOf(4, 2), cellOf(4, 3), cellOf(4, 4)]),
    );

    // The new number falls too when a cell of its chain was under it.
    const fallen = taps(state, [cellOf(1, 1), cellOf(1, 0), cellOf(1, 0)]);
    expect(fallen.cells[cellOf(1, 1)]).toBe(2);
    expect(fallen.cells[cellOf(1, 0)]).toBe(1 + createRng(state.rngState).int(SEED_MAX));
    expect(fallen.events[0]).toMatchObject({ kind: 'chain', at: cellOf(1, 1), changed: [cellOf(1, 0)] });
  });

  it('AC-105: collapse keeps the order of every column and refills exactly the emptied count', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = createRng(seed);
      const cells = Array.from({ length: CHAIN_CELLS }, (_, i) => 100 + i);
      const removed = rng.shuffle(cells.map((_, i) => i)).slice(0, 1 + rng.int(8));
      const keep = cells.findIndex((_, i) => !removed.includes(i));
      const out = collapse(cells, removed, keep, seed);
      expect(out.cells[out.at]).toBe(100 + keep);
      for (let col = 0; col < CHAIN_COLS; col++) {
        const before = Array.from({ length: CHAIN_ROWS }, (_, r) => cellOf(col, r)).filter((c) => !removed.includes(c)).map((c) => cells[c]);
        const after = Array.from({ length: CHAIN_ROWS }, (_, r) => out.cells[cellOf(col, r)]);
        const filled = CHAIN_ROWS - before.length;
        expect(after.slice(filled)).toEqual(before);
        expect(after.slice(0, filled).every((v) => v >= 1 && v <= SEED_MAX)).toBe(true);
      }
      expect(out).toEqual(collapse(cells, removed, keep, seed)); // seeded
    }
  });

  it('AC-105: a board without any pair is dealt again, seeded, and no chain is spent for it', () => {
    // The only pair: two 20s on the top row. Their chain leaves a 21 and a refill of 1 to 3 among 5 to 8.
    const rows = NO_PAIR.map((row) => row.slice());
    rows[0][0] = 20;
    rows[0][1] = 20;
    const state = on(rows);
    const done = taps(state, [cellOf(0, 0), cellOf(1, 0), cellOf(1, 0)]);
    expect(done.events.map((e) => e.kind)).toEqual(['chain', 'score', 'redeal']);
    expect(done.cells.every((v) => v >= 1 && v <= SEED_MAX)).toBe(true);
    expect(hasPair(done.cells)).toBe(true);
    const afterRefill = collapse(state.cells, [cellOf(0, 0)], cellOf(1, 0), state.rngState).rngState;
    const dealt = dealBoard(afterRefill);
    expect(done.cells).toEqual(dealt.cells);
    expect(done.rngState).toBe(dealt.rngState);
    expect(done).toMatchObject({ score: 400, chainsLeft: CHAIN_ROUND - 1, best: 21, status: 'playing' });
  });

  it('AC-105: « Mélange » shuffles the numbers of the board (seeded), cancels the chain and counts down; refused at 0', () => {
    const state = taps(createChain(11, { shuffle: 2 }), [0]);
    const done = reduceChain(state, { type: 'shuffle' });
    expect(done.events[0]).toEqual({ kind: 'shuffle' });
    expect(done.shufflesLeft).toBe(1);
    expect(done.chain).toEqual([]);
    expect(done.cells).not.toEqual(state.cells);
    expect(sorted(done.cells)).toEqual(sorted(state.cells));
    expect(done.cells).toEqual(createRng(state.rngState).shuffle(state.cells));
    expect(done).toMatchObject({ score: 0, chainsLeft: CHAIN_ROUND, guardMs: CHAIN_GUARD_MS });
    // During its 250 ms a second shuffle is ignored; then the last one; then none is left.
    expect(reduceChain(done, { type: 'shuffle' })).toEqual({ ...done, events: [{ kind: 'ignored' }] });
    const last = reduceChain(reduceChain(done, { type: 'tick', dt: CHAIN_GUARD_MS }), { type: 'shuffle' });
    expect(last.shufflesLeft).toBe(0);
    const none = reduceChain(reduceChain(last, { type: 'tick', dt: CHAIN_GUARD_MS }), { type: 'shuffle' });
    expect(none.events).toEqual([{ kind: 'ignored' }]);
    expect(none.cells).toBe(last.cells);
    expect(reduceChain(createChain(11), { type: 'shuffle' }).events).toEqual([{ kind: 'ignored' }]);
    // A shuffled board without any pair (30 different numbers) is dealt again.
    const unique = { ...createChain(11, { shuffle: 1 }), cells: Array.from({ length: CHAIN_CELLS }, (_, i) => 100 + i) };
    const redealt = reduceChain(unique, { type: 'shuffle' });
    expect(redealt.events).toEqual([{ kind: 'shuffle' }, { kind: 'redeal' }]);
    expect(hasPair(redealt.cells)).toBe(true);
  });

  it('AC-105: a round is 25 chains: the 25th ends it with the sum of the chains, then nothing changes', () => {
    let state = createChain(21);
    let points = 0;
    let chains = 0;
    while (state.status === 'playing') {
      const chain = botChain(state.cells, 3);
      const value = state.cells[chain[0]];
      state = taps(state, [...chain, chain[chain.length - 1]]);
      chains += 1;
      points += POINTS_FACTOR * value * chain.length;
      expect(state.score).toBe(points);
      expect(state.chainsLeft).toBe(CHAIN_ROUND - chains);
      expect(state.status).toBe(chains === CHAIN_ROUND ? 'over' : 'playing');
      if (state.status === 'playing') expect(hasPair(state.cells)).toBe(true);
      state = reduceChain(state, { type: 'tick', dt: CHAIN_GUARD_MS });
    }
    expect(chains).toBe(CHAIN_ROUND);
    const end = playChainBot(21);
    expect(end.status).toBe('over');
    expect(reduceChain(end, { type: 'tap', cell: 0 })).toBe(end);
    expect(reduceChain(end, { type: 'shuffle' })).toBe(end);
    // The last transition carries the `over` event with the final score.
    let last = createChain(21);
    while (last.chainsLeft > 1) {
      const chain = botChain(last.cells, 2);
      last = reduceChain(taps(last, [...chain, chain[1]]), { type: 'tick', dt: CHAIN_GUARD_MS });
    }
    const chain = botChain(last.cells, 2);
    const final = taps(last, [...chain, chain[1]]);
    expect(final.events[final.events.length - 1]).toEqual({ kind: 'over', score: final.score });
    expect(final.cells).toHaveLength(CHAIN_CELLS);
  });

  it('AC-108: a tap or a shuffle during the 250 ms a chain resolves changes nothing', () => {
    expect(CHAIN_GUARD_MS).toBe(250);
    const state = createChain(8, { shuffle: 1 });
    const chain = botChain(state.cells, 2);
    const done = taps(state, [...chain, chain[1]]);
    expect(done.guardMs).toBe(CHAIN_GUARD_MS);
    for (let cell = 0; cell < CHAIN_CELLS; cell++) {
      expect(reduceChain(done, { type: 'tap', cell })).toEqual({ ...done, events: [{ kind: 'ignored' }] });
    }
    expect(reduceChain(done, { type: 'shuffle' })).toEqual({ ...done, events: [{ kind: 'ignored' }] });
    const almost = reduceChain(done, { type: 'tick', dt: CHAIN_GUARD_MS - 1 });
    expect(reduceChain(almost, { type: 'tap', cell: 0 }).chain).toEqual([]);
    const ready = reduceChain(almost, { type: 'tick', dt: 1 });
    expect(ready.guardMs).toBe(0);
    expect(reduceChain(ready, { type: 'tap', cell: 0 }).chain).toEqual([0]);
    expect(reduceChain(ready, { type: 'tick', dt: 50 })).toBe(ready);
    // Taps that build a chain start no guard: a chain is tapped at the player's pace.
    expect(taps(state, chain).guardMs).toBe(0);
  });
});

describe('Chaîne de Nombres balance (AC-108)', () => {
  it('AC-108: the casual bot links the first pair it finds, up to its length limit, through neighbours of the same value', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { cells } = createChain(seed);
      for (let limit = BOT_MIN_LENGTH; limit <= BOT_MAX_LENGTH; limit++) {
        const chain = botChain(cells, limit);
        expect(chain.length).toBeGreaterThanOrEqual(BOT_MIN_LENGTH);
        expect(chain.length).toBeLessThanOrEqual(limit);
        expect(new Set(chain).size).toBe(chain.length);
        for (let i = 1; i < chain.length; i++) {
          expect(adjacent(chain[i - 1], chain[i])).toBe(true);
          expect(cells[chain[i]]).toBe(cells[chain[0]]);
        }
        // No cell before its first one has a neighbour of the same value.
        for (let c = 0; c < chain[0]; c++) expect(neighbours(c).some((n) => cells[n] === cells[c])).toBe(false);
      }
    }
    expect(botChain(board(NO_PAIR), 4)).toEqual([]);
  });

  it('AC-108: the casual bot finishes every one of 50 seeds, with a median between 1 and 3 stars, above a random player', () => {
    const { stars } = gameById('chain');
    const scores: number[] = [];
    for (let seed = 1; seed <= 50; seed++) {
      const end = playChainBot(seed);
      expect(end.status).toBe('over');
      expect(end.chainsLeft).toBe(0);
      expect(end).toEqual(playChainBot(seed)); // seeded
      scores.push(end.score);
    }
    // A player tapping 300 cells at random (three times the taps of the bot) hardly validates a chain.
    const random = Array.from({ length: 50 }, (_, i) => playRandom(i + 1, 300).score);
    expect(median(scores)).toBeGreaterThan(median(random));
    // Measured over seeds 1..50: min 1140, p25 1370, median 1440, p90 1580, max 1690 (random player: median 0, max 60);
    // stars by the PRD formula: 1 350 / 1 600 / 2 900.
    expect(quantile(scores, 0)).toBeGreaterThan(0);
    expect(quantile(scores, 0.25)).toBeLessThanOrEqual(quantile(scores, 0.9));
    expect(median(scores)).toBeGreaterThanOrEqual(stars[0]);
    expect(median(scores)).toBeLessThan(stars[2]);
  });
});
