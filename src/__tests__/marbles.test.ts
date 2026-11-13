import { playMarblesBot } from '../game/marbles/bot';
import {
  applyMove,
  coloursOf,
  COMBO_MS,
  createMarbles,
  EMPTY_TUBES,
  fallbackLayout,
  generatePuzzle,
  isSorted,
  MarblesState,
  MOVE_GUARD_MS,
  moveCount,
  puzzlePoints,
  reduceMarbles,
  roundMs,
  secondsLeft,
  solve,
  TUBE_SIZE,
  Tubes,
} from '../game/marbles/engine';
import { createRng } from '../game/rng';

const tick = (s: MarblesState, dt: number) => reduceMarbles(s, { type: 'tick', dt });
const tap = (s: MarblesState, tube: number) => reduceMarbles(s, { type: 'tap', tube });
/** A move (two taps) with the input guard already elapsed. */
const move = (s: MarblesState, from: number, to: number) => tap(tap({ ...s, guardMs: 0 }, from), to);
const withTubes = (s: MarblesState, tubes: Tubes): MarblesState => ({ ...s, tubes, start: tubes, colours: 2, selected: null, guardMs: 0 });

/** Plays the solver's moves on the current puzzle. */
function solveCurrent(s: MarblesState): MarblesState {
  const path = solve(s.tubes);
  if (!path) throw new Error('unsolved');
  let state = s;
  for (const m of path) state = move(state, m.from, m.to);
  return state;
}

function countColours(tubes: Tubes): Map<number, number> {
  const counts = new Map<number, number>();
  for (const t of tubes) for (const c of t) counts.set(c, (counts.get(c) ?? 0) + 1);
  return counts;
}

describe('Tri de Billes engine (AC-79)', () => {
  it('AC-79: a move takes the top run of one colour onto an empty tube or the same colour, as many as fit', () => {
    const tubes: Tubes = [[0, 1, 1], [2, 1], [], [0, 0, 2, 2]];
    expect(moveCount(tubes, 0, 1)).toBe(2); // run of 2 onto the same colour, 2 places left
    expect(applyMove(tubes, 0, 1)).toEqual([[0], [2, 1, 1, 1], [], [0, 0, 2, 2]]);
    expect(moveCount(tubes, 1, 2)).toBe(1); // onto an empty tube
    expect(moveCount(tubes, 0, 3)).toBe(0); // full tube
    expect(moveCount(tubes, 3, 0)).toBe(0); // another colour on top
    expect(moveCount(tubes, 2, 0)).toBe(0); // empty source
    expect(moveCount([[1, 1, 1], [0, 0, 1]], 0, 1)).toBe(1); // as many as fit
    expect(applyMove([[1, 1, 1], [0, 0, 1]], 0, 1)).toEqual([[1, 1], [0, 0, 1, 1]]);
  });

  it('AC-79: tap a tube then another plays the move; an illegal target is refused; the same tube twice deselects', () => {
    let s = withTubes(createMarbles(1), [[0, 1], [1, 0], [0, 1], []]);
    s = tap(s, 3); // empty tube: nothing to select
    expect(s.selected).toBeNull();
    s = tap(s, 0);
    expect(s.selected).toBe(0);
    s = tap(s, 0);
    expect(s.selected).toBeNull();
    s = tap(tap(s, 0), 1); // 1 on top of 0? top of tube 1 is 0: refused, tube 1 becomes the selection
    expect(s.tubes[0]).toEqual([0, 1]);
    expect(s.events.some((e) => e.kind === 'refused')).toBe(true);
    expect(s.selected).toBe(1);
    s = tap(s, 3);
    expect(s.tubes).toEqual([[0, 1], [1], [0, 1], [0]]);
    expect(s.selected).toBeNull();
    expect(s.events).toContainEqual({ kind: 'move', from: 1, to: 3, count: 1 });
  });

  it('AC-79 / AC-86: a move starts a 200 ms guard; a double tap during it changes nothing', () => {
    let s = withTubes(createMarbles(1), [[0, 1], [1, 0], [0, 1], []]);
    s = tap(tap(s, 0), 3);
    expect(s.guardMs).toBe(MOVE_GUARD_MS);
    const before = s;
    const doubled = tap(tap(s, 2), 3);
    expect(doubled.tubes).toEqual(before.tubes);
    expect(doubled.selected).toBeNull();
    expect(doubled.events).toEqual([{ kind: 'ignored' }]);
    // 150 ms later still guarded; after 200 ms a tap is taken again.
    s = tick(s, 150);
    expect(tap(s, 2).selected).toBeNull();
    s = tick(s, 50);
    expect(tap(s, 2).selected).toBe(2);
  });

  it('AC-79: every generated puzzle has 2 + n colours (max 6) of 4 marbles, 2 empty tubes, is not sorted and is solvable', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const puzzle of [1, 2, 3, 4, 5]) {
        const colours = coloursOf(puzzle);
        const { tubes } = generatePuzzle(colours, seed * 7919 + puzzle);
        expect(tubes).toHaveLength(colours + EMPTY_TUBES);
        expect(tubes.every((t) => t.length <= TUBE_SIZE)).toBe(true);
        const counts = countColours(tubes);
        expect(counts.size).toBe(colours);
        for (const n of counts.values()) expect(n).toBe(TUBE_SIZE);
        expect(isSorted(tubes)).toBe(false);
        expect(solve(tubes)).not.toBeNull();
      }
    }
    expect([1, 2, 3, 4, 5, 9].map(coloursOf)).toEqual([3, 4, 5, 6, 6, 6]);
  });

  it('AC-79: the fallback layout (legal moves backwards from the sorted state) is never sorted and always solvable', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const colours = 3 + (seed % 4);
      const tubes = fallbackLayout(colours, createRng(seed));
      const counts = countColours(tubes);
      expect(counts.size).toBe(colours);
      for (const n of counts.values()) expect(n).toBe(TUBE_SIZE);
      expect(isSorted(tubes)).toBe(false);
      expect(solve(tubes, 200_000)).not.toBeNull();
    }
  });

  it('AC-86: every seed tried starts a round (200 seeds)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = createMarbles(seed * 104729);
      expect(s.status).toBe('playing');
      expect(s.puzzle).toBe(1);
      expect(s.colours).toBe(3);
      expect(s.tubes).toHaveLength(5);
      expect(isSorted(s.tubes)).toBe(false);
    }
  });

  it('AC-79: a sorted puzzle scores 100 + 20 × colours and deals the next; under 20 s it is a combo', () => {
    let s = createMarbles(42);
    s = solveCurrent(s);
    expect(s.score).toBe(puzzlePoints(3));
    expect(puzzlePoints(3)).toBe(160);
    expect(s.combos).toBe(1);
    expect(s.puzzle).toBe(2);
    expect(s.colours).toBe(4);
    expect(s.tubes).toHaveLength(6);
    expect(s.events).toContainEqual({ kind: 'combo' });
    expect(s.events).toContainEqual({ kind: 'solved', puzzle: 1, points: 160 });
    // The second puzzle takes 20 s or more: no combo.
    s = tick(s, COMBO_MS);
    s = solveCurrent(s);
    expect(s.score).toBe(160 + 180);
    expect(s.combos).toBe(1);
    expect(s.puzzle).toBe(3);
  });

  it('AC-79: « Recommencer » restores the puzzle start without stopping the timer', () => {
    let s = createMarbles(5);
    const start = s.tubes;
    s = tick(s, 3000);
    const path = solve(s.tubes)!;
    s = move(s, path[0].from, path[0].to);
    expect(s.tubes).not.toEqual(start);
    s = reduceMarbles(s, { type: 'restart' });
    expect(s.tubes).toEqual(start);
    expect(s.selected).toBeNull();
    expect(s.timeLeftMs).toBe(90_000 - 3000);
    expect(s.puzzle).toBe(1);
    s = tick(s, 1000);
    expect(s.timeLeftMs).toBe(90_000 - 4000);
  });

  it('AC-79: the timer is 90 s + 10 s per « Sablier » level and ends the round at 0', () => {
    expect([0, 1, 2, 3].map((l) => roundMs({ extra_time: l }))).toEqual([90_000, 100_000, 110_000, 120_000]);
    expect(createMarbles(1, { extra_time: 2 }).timeLeftMs).toBe(110_000);
    let s = createMarbles(1);
    expect(secondsLeft(s)).toBe(90);
    s = tick(s, 999);
    expect(secondsLeft(s)).toBe(90);
    s = tick(s, 1);
    expect(secondsLeft(s)).toBe(89);
    for (let t = 1000; t < 90_000 - 50; t += 50) s = tick(s, 50);
    expect(s.status).toBe('playing');
    s = tick(s, 50);
    expect(s.status).toBe('over');
    expect(s.events).toEqual([{ kind: 'over', score: 0 }]);
    expect(tap(s, 0)).toBe(s);
  });

  it('AC-86: the casual bot reaches a median ≥ 1 star (300) and < 3 stars (1 000) over 50 seeds', () => {
    const scores = Array.from({ length: 50 }, (_, i) => playMarblesBot(i + 1).score).sort((a, b) => a - b);
    const median = (scores[24] + scores[25]) / 2;
    // Measured: median 540, p10 340, p90 760.
    expect(median).toBeGreaterThanOrEqual(300);
    expect(median).toBeLessThan(1000);
  });
});
