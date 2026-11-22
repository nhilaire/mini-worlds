import { gameById } from '../game/core/content';
import { BOT_RANDOM_CHANCE, greedyMove, playTilesBot } from '../game/tiles/bot';
import {
  acceptsInput,
  bestGem,
  canMove,
  createTiles,
  Dir,
  DIRS,
  EMPTY,
  JOKER,
  JOKER_EVERY,
  JOKER_PAIR_LEVEL,
  LEVEL_TWO_CHANCE,
  mergedLevel,
  mergeScore,
  MOVE_MS,
  movesLeft,
  reduceTiles,
  slide,
  START_GEMS,
  TILES_CELLS,
  TILES_MAX_LEVEL,
  TILES_MOVES,
  TILES_SIZE,
  TilesState,
} from '../game/tiles/engine';

const UP: Dir = 0;
const RIGHT: Dir = 1;
const DOWN: Dir = 2;
const LEFT: Dir = 3;
const J = JOKER;

const swipe = (state: TilesState, dir: Dir) => reduceTiles(state, { type: 'swipe', dir });
const undo = (state: TilesState) => reduceTiles(state, { type: 'undo' });
const tick = (state: TilesState, dt = 50) => reduceTiles(state, { type: 'tick', dt });

/** Ticks frame by frame (50 ms) until inputs are taken again (or the round is over). */
function settle(state: TilesState): TilesState {
  let s = state;
  for (let i = 0; i < 100 && s.status === 'playing' && !acceptsInput(s); i++) s = tick(s);
  return s;
}

/** A round whose board is replaced by the given rows (top to bottom). */
function withBoard(rows: number[][], base: TilesState = createTiles(1)): TilesState {
  return { ...base, cells: rows.flat() };
}

/** The first direction that changes the board. */
function anyMove(state: TilesState): Dir {
  return DIRS.find((dir) => slide(state.cells, dir).changed) as Dir;
}

const rowsOf = (cells: readonly number[]) => Array.from({ length: TILES_SIZE }, (_, y) => cells.slice(y * TILES_SIZE, (y + 1) * TILES_SIZE));
const count = (cells: readonly number[]) => cells.filter((v) => v !== EMPTY).length;

describe('Glisse-Fusion engine (AC-97)', () => {
  it('AC-97: a round starts with two level-1 gems on seeded cells of the 4 × 4 board (300 seeds)', () => {
    expect(TILES_CELLS).toBe(16);
    expect(START_GEMS).toBe(2);
    const layouts = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const state = createTiles(seed * 7919);
      expect(state.cells).toHaveLength(16);
      expect(state.cells.filter((v) => v === 1)).toHaveLength(2);
      expect(count(state.cells)).toBe(2);
      expect(state).toMatchObject({ score: 0, combos: 0, moves: 0, status: 'playing', undosLeft: 0, previous: null });
      expect(canMove(state.cells)).toBe(true);
      layouts.add(state.cells.join(''));
    }
    expect(layouts.size).toBeGreaterThan(50);
    expect(createTiles(42).cells).toEqual(createTiles(42).cells);
    expect(movesLeft(createTiles(1))).toBe(80);
  });

  it('AC-97: a swipe slides every gem as far as it can, in the four directions', () => {
    const cells = [
      [0, 1, 0, 0],
      [0, 0, 0, 3],
      [2, 0, 0, 0],
      [0, 0, 4, 0],
    ].flat();
    expect(rowsOf(slide(cells, LEFT).cells)).toEqual([[1, 0, 0, 0], [3, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0]]);
    expect(rowsOf(slide(cells, RIGHT).cells)).toEqual([[0, 0, 0, 1], [0, 0, 0, 3], [0, 0, 0, 2], [0, 0, 0, 4]]);
    expect(rowsOf(slide(cells, UP).cells)).toEqual([[2, 1, 4, 3], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    expect(rowsOf(slide(cells, DOWN).cells)).toEqual([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [2, 1, 4, 3]]);
    // Gems of different levels stack without merging; origins tell where each gem came from.
    const stacked = slide([[1, 0, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]].flat(), RIGHT);
    expect(rowsOf(stacked.cells)[0]).toEqual([0, 0, 1, 2]);
    expect(stacked.origins[3]).toBe(2);
    expect(stacked.origins[2]).toBe(0);
    expect(stacked.points).toBe(0);
    expect(stacked.merges).toEqual([]);
  });

  it('AC-97: equal neighbours merge once per move, from the side they slide to, scoring 2^L × 5', () => {
    expect(mergeScore(2)).toBe(20);
    expect(mergeScore(3)).toBe(40);
    expect(mergeScore(11)).toBe(10_240);
    const line = (row: number[], dir: Dir) => {
      const slid = slide([row, [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]].flat(), dir);
      return { row: rowsOf(slid.cells)[0], points: slid.points, merges: slid.merges.length };
    };
    // Three equal gems: the pair on the side they slide to merges, the third stays.
    expect(line([1, 1, 1, 0], LEFT)).toEqual({ row: [2, 1, 0, 0], points: 20, merges: 1 });
    expect(line([1, 1, 1, 0], RIGHT)).toEqual({ row: [0, 0, 1, 2], points: 20, merges: 1 });
    // Four equal gems make two pairs, not one big gem; a merged gem does not merge again in the same move.
    expect(line([1, 1, 1, 1], LEFT)).toEqual({ row: [2, 2, 0, 0], points: 40, merges: 2 });
    expect(line([2, 1, 1, 0], LEFT)).toEqual({ row: [2, 2, 0, 0], points: 20, merges: 1 });
    expect(line([1, 1, 2, 0], LEFT)).toEqual({ row: [2, 2, 0, 0], points: 20, merges: 1 });
    // Gems merge across empty cells.
    expect(line([3, 0, 0, 3], RIGHT)).toEqual({ row: [0, 0, 0, 4], points: 80, merges: 1 });
    expect(line([1, 2, 1, 2], LEFT)).toEqual({ row: [1, 2, 1, 2], points: 0, merges: 0 });
    // The same vertically.
    const column = slide([[5, 0, 0, 0], [5, 0, 0, 0], [5, 0, 0, 0], [0, 0, 0, 0]].flat(), DOWN);
    expect(column.cells.filter((_, i) => i % 4 === 0)).toEqual([0, 0, 5, 6]);
    expect(column.points).toBe(mergeScore(6));
    expect(column.merges).toEqual([{ cell: 12, level: 6 }]);
    // The merged gem comes from the farther of the two cells.
    expect(column.origins[12]).toBe(4);

    // Through the reducer: score, events, and a move with 2 merges or more is a combo.
    let state = swipe(withBoard([[1, 1, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), LEFT);
    expect(state.score).toBe(20 + 40);
    expect(state.combos).toBe(1);
    expect(state.events).toContainEqual({ kind: 'move', dir: LEFT, merges: 2 });
    expect(state.events).toContainEqual({ kind: 'merge', cell: 0, level: 2, points: 20 });
    expect(state.events).toContainEqual({ kind: 'merge', cell: 1, level: 3, points: 40 });
    expect(state.events).toContainEqual({ kind: 'score', points: 60 });
    expect(state.events).toContainEqual({ kind: 'combo' });
    state = swipe(withBoard([[1, 1, 0, 3], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), LEFT);
    expect(state.score).toBe(20);
    expect(state.combos).toBe(0);
    expect(state.events).not.toContainEqual({ kind: 'combo' });
  });

  it('AC-97: a level-11 gem is the last one: it merges with nothing', () => {
    expect(TILES_MAX_LEVEL).toBe(11);
    expect(mergedLevel(10, 10)).toBe(11);
    expect(mergedLevel(11, 11)).toBe(0);
    expect(mergedLevel(11, J)).toBe(0);
    expect(mergedLevel(3, 4)).toBe(0);
    expect(mergedLevel(0, 0)).toBe(0);
    expect(bestGem([11, J, 0, 3])).toBe(11);
  });

  it('AC-97: a move that changes nothing is ignored (no move counted, no new gem)', () => {
    const state = withBoard([[1, 2, 0, 0], [3, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    expect(slide(state.cells, LEFT).changed).toBe(false);
    for (const dir of [LEFT, UP]) {
      const after = swipe(state, dir);
      expect(after.events).toEqual([{ kind: 'blocked', dir }]);
      expect(after.cells).toBe(state.cells);
      expect(after).toMatchObject({ moves: 0, score: 0, busyMs: 0, previous: null, rngState: state.rngState });
    }
    expect(swipe(state, RIGHT).moves).toBe(1);
    // An unknown direction is ignored too.
    expect(reduceTiles(state, { type: 'swipe', dir: 7 as Dir }).events).toEqual([]);
  });

  it('AC-97: after each move a new gem of level 1 (90 %) or 2 (10 %) appears on a seeded empty cell', () => {
    expect(LEVEL_TWO_CHANCE).toBe(0.1);
    let ones = 0;
    let twos = 0;
    for (let seed = 1; seed <= 60; seed++) {
      let state = createTiles(seed);
      for (let n = 1; n <= 40 && state.status === 'playing'; n++) {
        const dir = anyMove(state);
        const slid = slide(state.cells, dir);
        state = swipe(state, dir);
        const spawn = state.events.find((e) => e.kind === 'spawn') as { cell: number; gem: number };
        expect(slid.cells[spawn.cell]).toBe(EMPTY);
        expect(state.cells[spawn.cell]).toBe(spawn.gem);
        expect(state.spawned).toBe(spawn.cell);
        // Nothing else changed after the slide: one gem more.
        expect(state.cells.filter((v, i) => i !== spawn.cell && v !== slid.cells[i])).toEqual([]);
        expect(count(state.cells)).toBe(count(slid.cells) + 1);
        if (n % JOKER_EVERY === 0) expect(spawn.gem).toBe(JOKER);
        else {
          expect([1, 2]).toContain(spawn.gem);
          if (spawn.gem === 1) ones += 1;
          else twos += 1;
        }
        state = settle(state);
      }
    }
    const share = twos / (ones + twos);
    expect(share).toBeGreaterThan(0.06);
    expect(share).toBeLessThan(0.14);
    // Seeded: the same seed and moves give the same gems.
    const a = swipe(createTiles(5), anyMove(createTiles(5)));
    const b = swipe(createTiles(5), anyMove(createTiles(5)));
    expect(a.cells).toEqual(b.cells);
  });

  it('AC-97: every 10th move the new gem is a joker', () => {
    expect(JOKER_EVERY).toBe(10);
    let state = createTiles(77);
    const jokersAt: number[] = [];
    while (state.status === 'playing' && state.moves < 45) {
      state = swipe(state, anyMove(state));
      const spawn = state.events.find((e) => e.kind === 'spawn') as { cell: number; gem: number };
      if (spawn.gem === JOKER) jokersAt.push(state.moves);
      state = settle(state);
    }
    expect(jokersAt).toEqual([10, 20, 30, 40]);
  });

  it('AC-97: a joker merges with any gem it meets (next level of that gem); two jokers make a level-3 gem', () => {
    expect(JOKER_PAIR_LEVEL).toBe(3);
    for (let level = 1; level < TILES_MAX_LEVEL; level++) {
      expect(mergedLevel(J, level)).toBe(level + 1);
      expect(mergedLevel(level, J)).toBe(level + 1);
    }
    expect(mergedLevel(J, J)).toBe(3);
    const line = (row: number[], dir: Dir) => {
      const slid = slide([row, [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]].flat(), dir);
      return { row: rowsOf(slid.cells)[0], points: slid.points };
    };
    expect(line([J, 0, 5, 0], LEFT)).toEqual({ row: [6, 0, 0, 0], points: mergeScore(6) });
    expect(line([4, J, 0, 0], RIGHT)).toEqual({ row: [0, 0, 0, 5], points: mergeScore(5) });
    expect(line([J, 0, 0, J], LEFT)).toEqual({ row: [3, 0, 0, 0], points: mergeScore(3) });
    // From the side they slide to, once per move: the joker takes the first gem it meets on that side.
    expect(line([2, J, 7, 0], LEFT)).toEqual({ row: [3, 7, 0, 0], points: mergeScore(3) });
    expect(line([2, J, 7, 0], RIGHT)).toEqual({ row: [0, 0, 2, 8], points: mergeScore(8) });
    expect(line([J, 2, 2, 0], LEFT)).toEqual({ row: [3, 2, 0, 0], points: mergeScore(3) });
    // A joker alone just slides.
    expect(line([0, J, 0, 0], LEFT)).toEqual({ row: [J, 0, 0, 0], points: 0 });
    const state = swipe(withBoard([[J, 9, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), LEFT);
    expect(state.cells[0]).toBe(10);
    expect(state.score).toBe(5120);
  });

  it('AC-97: « Annuler » gives 1 / 2 / 3 uses; a use restores the board, the score and the move count of before the last move, one step only', () => {
    expect(createTiles(1).undosLeft).toBe(0);
    expect(createTiles(1, { undo: 3 }).undosLeft).toBe(3);
    // Not owned, or nothing to take back: refused.
    let none = settle(swipe(createTiles(3), anyMove(createTiles(3))));
    none = undo(none);
    expect(none.events).toEqual([]);
    expect(none.moves).toBe(1);
    expect(undo(createTiles(3, { undo: 2 })).undosLeft).toBe(2);

    const start = withBoard([[1, 1, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], createTiles(3, { undo: 2 }));
    const first = settle(swipe(start, RIGHT));
    const second = settle(swipe(first, anyMove(first)));
    expect(second.moves).toBe(2);
    let state = undo(second);
    expect(state.events).toEqual([{ kind: 'undo' }]);
    expect(state.cells).toEqual(first.cells);
    expect(state).toMatchObject({ score: first.score, moves: 1, combos: first.combos, undosLeft: 1, previous: null, busyMs: 0 });
    // One step back only: a second undo in a row is refused.
    const again = undo(state);
    expect(again.events).toEqual([]);
    expect(again).toMatchObject({ moves: 1, undosLeft: 1 });
    expect(again.cells).toEqual(first.cells);
    // After a new move the second use takes that move back; then none is left.
    state = settle(swipe(state, anyMove(state)));
    state = undo(state);
    expect(state.cells).toEqual(first.cells);
    expect(state).toMatchObject({ score: 60, moves: 1, undosLeft: 0 });
    state = settle(swipe(state, anyMove(state)));
    expect(undo(state).events).toEqual([]);
    expect(undo(state).moves).toBe(2);
  });

  it('AC-97: the round ends after 80 moves', () => {
    expect(TILES_MOVES).toBe(80);
    // A joker comes every 10 moves, so a move stays possible in practice; the bot's order keeps the board open.
    let state = createTiles(2026);
    while (state.status === 'playing' && state.moves < TILES_MOVES - 1) state = settle(swipe(state, greedyMove(state.cells) as Dir));
    expect(state.status).toBe('playing');
    expect(movesLeft(state)).toBe(1);
    state = swipe(state, greedyMove(state.cells) as Dir);
    expect(state.moves).toBe(80);
    // The last move lands first (150 ms), then the round is over.
    expect(state.status).toBe('playing');
    expect(swipe(state, anyMove(state)).events).toEqual([{ kind: 'ignored' }]);
    state = tick(tick(state));
    expect(state.status).toBe('playing');
    state = tick(state);
    expect(state.status).toBe('over');
    expect(state.events).toEqual([{ kind: 'over', score: state.score }]);
    expect(swipe(state, LEFT).events).toEqual([]);
    expect(swipe(state, LEFT).moves).toBe(80);
    expect(undo(state).status).toBe('over');
  });

  it('AC-97: the round ends earlier when no move is possible', () => {
    const dead = [
      [1, 2, 1, 2],
      [2, 1, 2, 1],
      [1, 2, 1, 2],
      [2, 1, 2, 1],
    ];
    expect(canMove(dead.flat())).toBe(false);
    expect(canMove([[1, 2, 1, 2], [2, 1, 2, 1], [1, 2, 1, 2], [2, 1, 2, 2]].flat())).toBe(true);
    expect(canMove([[1, 2, 1, 2], [2, 1, 2, 1], [1, 2, 1, 2], [2, 1, 2, 0]].flat())).toBe(true);
    // A joker always has a neighbour to merge with (unless the neighbours are diamants).
    expect(canMove([[1, 2, 1, 2], [2, J, 2, 1], [1, 2, 1, 2], [2, 1, 2, 1]].flat())).toBe(true);

    // The last free cell is filled by the new gem of a move: when nothing can move then, the round ends at move 2.
    let ended = 0;
    for (let seed = 1; seed <= 40; seed++) {
      // Sliding right merges the two 4s; the gem that appears (1 or 2) lands on the only free cell, top left.
      let state = withBoard([[3, 4, 4, 5], [5, 6, 7, 8], [3, 4, 3, 4], [5, 6, 5, 6]], createTiles(seed));
      state = swipe(state, RIGHT);
      expect(state.cells.slice(0, 4)).toEqual([state.cells[0], 3, 5, 5]);
      expect(state.status).toBe('playing');
      state = settle(state);
      // [gem, 3, 5, 5] still has a move (the two 5s): not over.
      expect(state.status).toBe('playing');
      state = settle(swipe(state, RIGHT));
      // [gem, gem', 3, 6] over [5, 6, 7, 8]...: over exactly when no move is left.
      expect(state.status).toBe(canMove(state.cells) ? 'playing' : 'over');
      if (state.status === 'over') {
        ended += 1;
        expect(state.moves).toBe(2);
        expect(state.events).toEqual([{ kind: 'over', score: state.score }]);
      }
    }
    expect(ended).toBeGreaterThan(0);
  });
});

describe('Glisse-Fusion guard and casual bot (AC-108)', () => {
  it('AC-108: a move animates in 150 ms: swipes and undos inside the guard change nothing', () => {
    expect(MOVE_MS).toBe(150);
    let state = createTiles(8, { undo: 3 });
    state = swipe(state, anyMove(state));
    expect(state.busyMs).toBe(MOVE_MS);
    const moved = state;
    for (const dir of DIRS) {
      state = swipe(state, dir);
      expect(state.events).toEqual([{ kind: 'ignored' }]);
      expect(state.cells).toBe(moved.cells);
      expect(state).toMatchObject({ moves: 1, score: moved.score, undosLeft: 3, rngState: moved.rngState, busyMs: MOVE_MS });
    }
    state = undo(state);
    expect(state.events).toEqual([{ kind: 'ignored' }]);
    expect(state).toMatchObject({ moves: 1, undosLeft: 3 });
    for (let t = 50; t < MOVE_MS; t += 50) {
      state = tick(state);
      expect(swipe(state, anyMove(state)).events).toEqual([{ kind: 'ignored' }]);
    }
    state = tick(state);
    expect(state.busyMs).toBe(0);
    expect(acceptsInput(state)).toBe(true);
    expect(swipe(state, anyMove(state)).moves).toBe(2);
    // A tick without a guard, or of no time, changes nothing.
    expect(tick(state)).toBe(state);
    expect(tick(moved, 0).busyMs).toBe(MOVE_MS);
  });

  it('AC-108: every seed starts and finishes a round; the casual bot (best immediate merge, 25 % random moves) has a median between 1 and 3 stars over 50 seeds', () => {
    expect(BOT_RANDOM_CHANCE).toBe(0.25);
    const [one, , three] = gameById('tiles').stars;
    const scores = Array.from({ length: 50 }, (_, i) => {
      const end = playTilesBot(i + 1);
      expect(end.status).toBe('over');
      expect(end.moves).toBeLessThanOrEqual(TILES_MOVES);
      expect(end.moves === TILES_MOVES || !canMove(end.cells)).toBe(true);
      return end.score;
    }).sort((a, b) => a - b);
    const median = (scores[24] + scores[25]) / 2;
    // BOT_STATS=1 prints the measured distribution (for the PRD balance table).
    if (process.env.BOT_STATS) console.log(`tiles bot: min ${scores[0]}, p25 ${scores[12]}, median ${median}, p90 ${scores[44]}, max ${scores[49]} (stars ${gameById('tiles').stars.join(' / ')})`);
    expect(playTilesBot(7).score).toBe(playTilesBot(7).score);
    expect(median).toBeGreaterThanOrEqual(one);
    expect(median).toBeLessThan(three);
  });
});
