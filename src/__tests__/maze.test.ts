import { gameById } from '../game/core/content';
import { playMazeBot } from '../game/maze/bot';
import {
  bit,
  CELL_MS,
  createMaze,
  Dir,
  DIRS,
  DX,
  DY,
  explorerAt,
  generateMaze,
  mazePoints,
  mazeSize,
  MazeState,
  neighbour,
  opposite,
  reduceMaze,
  runPath,
  secondsLeft,
} from '../game/maze/engine';

const N: Dir = 0;
const E: Dir = 1;
const S: Dir = 2;
const W: Dir = 3;

/**
 * Hand-made 3 × 3 perfect maze (cell = y × 3 + x):
 *   0 → 1 → 2         corridor east along the top, down at 2
 *   3 ← 4 ← 5         5 is a junction (north, west, south)
 *   6 → 7     8       3 turns down to 6, 7 is a dead end, 8 is the exit (below 5)
 */
const HAND_OPEN = [2, 10, 12, 6, 10, 13, 3, 8, 1];

function handMaze(over: Partial<MazeState> = {}): MazeState {
  return { ...createMaze(1), size: 3, open: HAND_OPEN, pos: 0, exit: 8, pathCells: 5, ...over };
}

function tickFor(state: MazeState, ms: number, step = 50): MazeState {
  let s = state;
  for (let t = 0; t < ms && s.status === 'playing'; t += step) s = reduceMaze(s, { type: 'tick', dt: Math.min(step, ms - t) });
  return s;
}

/** Checks a maze is perfect: openings are symmetric, inside the board, size² − 1 passages, all cells connected. */
function expectPerfect(open: readonly number[], size: number) {
  let passages = 0;
  const bad: string[] = [];
  for (let cell = 0; cell < open.length; cell++) {
    const x = cell % size;
    const y = Math.floor(cell / size);
    for (const d of DIRS) {
      if (!(open[cell] & bit(d))) continue;
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) bad.push(`${cell} opens outside towards ${d}`);
      else if (!(open[ny * size + nx] & bit(opposite(d)))) bad.push(`${cell} → ${d} is one-way`);
      passages += 1;
    }
  }
  expect(bad).toEqual([]);
  expect(passages / 2).toBe(size * size - 1);
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) {
    const cell = stack.pop() as number;
    for (const d of DIRS) {
      if (!(open[cell] & bit(d))) continue;
      const next = neighbour(size, cell, d);
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  expect(seen.size).toBe(size * size); // connected with n − 1 passages: a tree, one path between any two cells
}

describe('Labyrinthe Express engine (AC-83)', () => {
  it('AC-83: every generated maze is perfect (one path between any two cells)', () => {
    expectPerfect(HAND_OPEN, 3);
    for (let seed = 0; seed < 200; seed++) {
      const size = mazeSize(1 + (seed % 4));
      expectPerfect(generateMaze(size, seed * 7919).open, size);
    }
  });

  it('AC-83: mazes grow with n: 7 × 7, 9 × 9, 11 × 11...', () => {
    expect([1, 2, 3, 4].map(mazeSize)).toEqual([7, 9, 11, 13]);
    const state = createMaze(5);
    expect(state.size).toBe(7);
    expect(state.open).toHaveLength(49);
    expect(state.pos).toBe(0);
    expect(state.exit).toBe(48);
    // Solving maze 1 (teleported next to the exit) opens a 9 × 9 maze.
    const s = tickFor(reduceMaze(handMaze({ pos: 5 }), { type: 'swipe', dir: S }), 200);
    expect(s.maze).toBe(2);
    expect(s.size).toBe(9);
    expect(s.open).toHaveLength(81);
    expect(s.pos).toBe(0);
  });

  it('AC-83: a swipe runs until a wall ahead, a junction or the exit, and does nothing into a wall', () => {
    const open = HAND_OPEN;
    expect(runPath(open, 3, 0, 8, E)).toEqual([1, 2]); // through the corridor cell 1, stops at 2 (wall ahead, turn)
    expect(runPath(open, 3, 2, 8, S)).toEqual([5]); // 5 is a junction
    expect(runPath(open, 3, 5, 8, S)).toEqual([8]); // the exit
    expect(runPath(open, 3, 5, 8, W)).toEqual([4, 3]); // 3 has a wall ahead and turns south
    expect(runPath(open, 3, 0, 8, S)).toEqual([]);
    const blocked = reduceMaze(handMaze(), { type: 'swipe', dir: N });
    expect(blocked.events).toEqual([{ kind: 'blocked', dir: N }]);
    expect(blocked.run).toBeNull();
    expect(blocked.pos).toBe(0);
    // Generated mazes: every cell crossed before the stop is a straight corridor.
    for (let seed = 0; seed < 50; seed++) {
      const m = createMaze(seed);
      for (const d of DIRS) {
        const path = runPath(m.open, m.size, 0, m.exit, d);
        for (const cell of path.slice(0, -1)) expect(m.open[cell]).toBe(bit(d) | bit(opposite(d)));
      }
    }
  });

  it('AC-83: the run animates at 12 cells/s and lands on its last cell', () => {
    let s = reduceMaze(handMaze(), { type: 'swipe', dir: E });
    expect(s.events).toEqual([{ kind: 'run', dir: E, cells: 2 }]);
    s = reduceMaze(s, { type: 'tick', dt: CELL_MS });
    expect(explorerAt(s)).toEqual({ x: 1, y: 0 });
    s = reduceMaze(s, { type: 'tick', dt: CELL_MS / 2 });
    expect(explorerAt(s).x).toBeCloseTo(1.5);
    expect(s.pos).toBe(0);
    s = reduceMaze(s, { type: 'tick', dt: CELL_MS / 2 });
    expect(s.run).toBeNull();
    expect(s.pos).toBe(2);
    expect(explorerAt(s)).toEqual({ x: 2, y: 0 });
  });

  it('AC-83: reaching the exit scores 100 + 2 × shortest path cells (start and exit included)', () => {
    expect(createMaze(1).pathCells).toBeGreaterThanOrEqual(13); // at least the Manhattan distance + 1 on 7 × 7
    expect(mazePoints(5)).toBe(110);
    let s = handMaze();
    for (const dir of [E, S, S]) s = tickFor(reduceMaze(s, { type: 'swipe', dir }), 300);
    expect(s.score).toBe(110);
    expect(s.maze).toBe(2);
  });

  it('AC-83: the round lasts 60 s + 5 s per « Sablier » level', () => {
    expect(createMaze(1).timeLeftMs).toBe(60_000);
    expect(createMaze(1, { extra_time: 2 }).timeLeftMs).toBe(70_000);
    let s = tickFor(createMaze(1), 59_950);
    expect(s.status).toBe('playing');
    expect(secondsLeft(s)).toBe(1);
    s = reduceMaze(s, { type: 'tick', dt: 50 });
    expect(s.status).toBe('over');
    expect(s.events).toContainEqual({ kind: 'over', score: 0 });
  });

  it('AC-83: a maze solved in under 15 s is a combo, not at 15 s or more', () => {
    const fast = tickFor(reduceMaze(handMaze({ pos: 5, mazeMs: 14_000 }), { type: 'swipe', dir: S }), 100);
    expect(fast.combos).toBe(1);
    expect(fast.events).toContainEqual({ kind: 'combo' });
    const slow = tickFor(reduceMaze(handMaze({ pos: 5, mazeMs: 15_000 }), { type: 'swipe', dir: S }), 100);
    expect(slow.score).toBe(110);
    expect(slow.combos).toBe(0);
  });

  it('AC-83: a swipe during a run is ignored', () => {
    const running = reduceMaze(handMaze(), { type: 'swipe', dir: E });
    const again = reduceMaze(running, { type: 'swipe', dir: W });
    expect(again.events).toEqual([{ kind: 'ignored' }]);
    expect(again.run).toEqual(running.run);
  });
});

describe('Labyrinthe Express balance and guards (AC-86)', () => {
  const [oneStar, , threeStars] = gameById('maze').stars;

  it('AC-86: the generator starts a round for every seed tried', () => {
    for (let seed = 0; seed < 300; seed++) {
      const s = createMaze(seed * 2654435761);
      expect(s.status).toBe('playing');
      expect(s.pathCells).toBeGreaterThanOrEqual(13);
    }
  });

  it('AC-86: a double swipe during the run changes nothing', () => {
    const once = reduceMaze(handMaze(), { type: 'swipe', dir: E });
    const twice = reduceMaze(reduceMaze(once, { type: 'tick', dt: 50 }), { type: 'swipe', dir: E });
    const single = reduceMaze(once, { type: 'tick', dt: 50 });
    expect({ ...twice, events: [] }).toEqual({ ...single, events: [] });
    expect(tickFor(twice, 300).pos).toBe(2);
  });

  it('AC-86: over 50 seeds the casual bot (left wall, one swipe per 0.6 s) has a median ≥ the 1-star threshold and < the 3-star one', () => {
    const scores = Array.from({ length: 50 }, (_, i) => playMazeBot(i + 1).score).sort((a, b) => a - b);
    const median = (scores[24] + scores[25]) / 2;
    // Measured: median 338, p10 174, p90 478.
    expect(median).toBeGreaterThanOrEqual(oneStar);
    expect(median).toBeLessThan(threeStars);
  });
});
