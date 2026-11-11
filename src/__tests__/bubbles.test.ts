import {
  BUBBLE_COLS,
  BUBBLE_ROWS,
  COLOURS,
  LAUNCHER,
  QUEUE_LENGTH,
  ROW_HEIGHT,
  cellCenter,
  createBubbles,
  emptyBoard,
  isCellValid,
  neighbours,
  pushInterval,
  reduceBubbles,
  simulateShot,
} from '../game/bubbles/engine';
import type { BubbleAction, BubbleBoard, BubbleState, Cell, Colour } from '../game/bubbles/engine';

const shoot = (angle: number): BubbleAction => ({ type: 'shoot', angle });

function boardWith(cells: readonly (Cell & { colour: Colour })[]): BubbleBoard {
  const rows = emptyBoard().map((row) => row.slice());
  for (const c of cells) rows[c.row][c.col] = c.colour;
  return rows;
}

function count(board: BubbleBoard): number {
  return board.reduce((n, row) => n + row.filter((c) => c !== null).length, 0);
}

function coloursOn(board: BubbleBoard): Colour[] {
  return COLOURS.filter((colour) => board.some((row) => row.includes(colour)));
}

/** A playing state with a crafted board, a known current colour and a plain queue. */
function crafted(board: BubbleBoard, current: Colour, extra: Partial<BubbleState> = {}): BubbleState {
  return { ...createBubbles(1), board, shift: 0, current, queue: [current, current, current], ...extra };
}

const kinds = (s: BubbleState) => s.events.map((e) => e.kind);

describe('Bulles en Folie: geometry', () => {
  it('centres even rows at col + 0.5 and odd rows half a cell to the right', () => {
    expect(cellCenter(0, 0)).toEqual({ x: 0.5, y: 0.5 });
    expect(cellCenter(8, 0)).toEqual({ x: 8.5, y: 0.5 });
    expect(cellCenter(0, 1)).toEqual({ x: 1, y: 0.5 + ROW_HEIGHT });
    expect(cellCenter(7, 1).x).toBe(8);
    expect(cellCenter(4, 2).y).toBeCloseTo(0.5 + 2 * ROW_HEIGHT);
    // After one push the parity flips: row 0 becomes the shifted one.
    expect(cellCenter(0, 0, 1)).toEqual({ x: 1, y: 0.5 });
    expect(cellCenter(0, 1, 1)).toEqual({ x: 0.5, y: 0.5 + ROW_HEIGHT });
  });

  it('validates 9 cells on even rows, 8 on odd rows, 12 rows', () => {
    expect(isCellValid(8, 0)).toBe(true);
    expect(isCellValid(8, 1)).toBe(false);
    expect(isCellValid(7, 1)).toBe(true);
    expect(isCellValid(0, 11)).toBe(true);
    expect(isCellValid(0, 12)).toBe(false);
    expect(isCellValid(-1, 0)).toBe(false);
    expect(isCellValid(9, 0)).toBe(false);
    expect(isCellValid(8, 0, 1)).toBe(false);
    expect(isCellValid(8, 1, 1)).toBe(true);
  });

  it('lists hexagonal neighbours (six inside, fewer on the edges)', () => {
    expect(neighbours(4, 2)).toEqual(
      expect.arrayContaining([
        { col: 3, row: 2 },
        { col: 5, row: 2 },
        { col: 3, row: 1 },
        { col: 4, row: 1 },
        { col: 3, row: 3 },
        { col: 4, row: 3 },
      ]),
    );
    expect(neighbours(4, 2)).toHaveLength(6);
    expect(neighbours(3, 1)).toEqual(
      expect.arrayContaining([
        { col: 3, row: 0 },
        { col: 4, row: 0 },
        { col: 3, row: 2 },
        { col: 4, row: 2 },
      ]),
    );
    expect(neighbours(0, 0)).toHaveLength(2);
  });

  it('places the launcher centred just under the grid', () => {
    expect(LAUNCHER).toEqual({ x: 4.5, y: 0.5 + BUBBLE_ROWS * ROW_HEIGHT });
  });
});

describe('Bulles en Folie: initial state', () => {
  it('starts with 5 filled rows, 7 empty rows, a current colour and a queue of 3', () => {
    const s = createBubbles(123, { aim: 2, next: 3 });
    expect(s.board).toHaveLength(BUBBLE_ROWS);
    for (let row = 0; row < 5; row++) {
      const expected = row % 2 === 0 ? BUBBLE_COLS : BUBBLE_COLS - 1;
      expect(s.board[row].filter((c) => c !== null)).toHaveLength(expected);
      expect(s.board[row][8] === null).toBe(row % 2 === 1);
    }
    for (let row = 5; row < BUBBLE_ROWS; row++) expect(s.board[row].every((c) => c === null)).toBe(true);
    expect(COLOURS).toContain(s.current);
    expect(s.queue).toHaveLength(QUEUE_LENGTH);
    expect(s.queue.length).toBeGreaterThanOrEqual(3);
    expect(s).toMatchObject({ score: 0, combos: 0, status: 'playing', events: [], shotsFired: 0, shotsUntilPush: 6, aim: 2, next: 3 });
  });

  it('defaults the upgrades to 0', () => {
    expect(createBubbles(7)).toMatchObject({ aim: 0, next: 0 });
  });
});

describe('AC-27: flight, bounces and snapping', () => {
  it('snaps to the top row when the column is empty (straight up)', () => {
    const s = reduceBubbles(crafted(emptyBoard(), 'red'), shoot(90));
    expect(s.board[0][4]).toBe('red');
    expect(count(s.board)).toBe(1);
    const shot = s.events.find((e) => e.kind === 'shot');
    expect(shot).toMatchObject({ kind: 'shot', colour: 'red', landing: { col: 4, row: 0 }, bounces: 0 });
    if (shot?.kind !== 'shot') throw new Error('no shot event');
    expect(shot.path[0]).toEqual(LAUNCHER);
    expect(shot.path[shot.path.length - 1].x).toBeCloseTo(4.5);
    expect(shot.path[shot.path.length - 1].y).toBeCloseTo(0.5);
  });

  it('snaps under the first bubble it touches (straight up on the initial board)', () => {
    const start = createBubbles(99);
    const s = reduceBubbles(start, shoot(90));
    // Rows 0..4 are full; the shot touches row 4 and lands on row 5 (one of the two cells below (4,4)).
    const landing = s.events.find((e) => e.kind === 'shot');
    expect(landing).toMatchObject({ landing: { row: 5 } });
    if (landing?.kind !== 'shot' || !landing.landing) throw new Error('no landing');
    expect([3, 4]).toContain(landing.landing.col);
  });

  it('snaps to the exact free cell adjacent to the touched bubble', () => {
    // (3,1) is centred at (4, 1.366): the straight-up shot touches it and lands on (4,2), centred at (4.5, 2.232).
    const board = boardWith([
      { col: 3, row: 0, colour: 'blue' },
      { col: 3, row: 1, colour: 'blue' },
    ]);
    expect(simulateShot(board, 90).landing).toEqual({ col: 4, row: 2 });
  });

  it('bounces on the walls at 20 degrees and keeps the path inside the playfield', () => {
    const { path, landing, bounces } = simulateShot(emptyBoard(), 20);
    expect(bounces).toBeGreaterThanOrEqual(2);
    expect(path.length).toBe(bounces + 2);
    for (const p of path) {
      expect(p.x).toBeGreaterThanOrEqual(0.5 - 1e-9);
      expect(p.x).toBeLessThanOrEqual(8.5 + 1e-9);
    }
    // The first bounce happens on the right wall, the second on the left wall.
    expect(path[1].x).toBeCloseTo(8.5);
    expect(path[2].x).toBeCloseTo(0.5);
    expect(path[path.length - 1].y).toBeCloseTo(0.5);
    expect(landing).toMatchObject({ row: 0 });
    // The reducer reports the same path in its 'shot' event.
    const s = reduceBubbles(crafted(emptyBoard(), 'green'), shoot(20));
    expect(s.events[0]).toMatchObject({ kind: 'shot', bounces, landing });
  });

  it('bounces symmetrically on the left wall (160 degrees)', () => {
    const { path } = simulateShot(emptyBoard(), 160);
    expect(path[1].x).toBeCloseTo(0.5);
    expect(path[2].x).toBeCloseTo(8.5);
  });

  it('does not shoot when released under 10 degrees from the horizontal', () => {
    const start = createBubbles(5);
    for (const angle of [0, 5, 9.99, 175, 180, -20, 200]) {
      const s = reduceBubbles(start, shoot(angle));
      expect(s.events).toEqual([{ kind: 'too_flat' }]);
      expect({ ...s, events: [] }).toEqual({ ...start, events: [] });
    }
  });

  it('shoots at exactly 10 degrees', () => {
    const s = reduceBubbles(crafted(emptyBoard(), 'red'), shoot(10));
    expect(kinds(s)).toContain('shot');
    expect(s.shotsFired).toBe(1);
  });

  it('ignores actions once the round is over', () => {
    const over: BubbleState = { ...crafted(emptyBoard(), 'red'), status: 'over' };
    const s = reduceBubbles(over, shoot(90));
    expect(s).toEqual({ ...over, events: [] });
  });
});

describe('AC-28: pops, drops and next colour', () => {
  // The straight-up shot touches (3,1) first and lands on (4,2); (3,1) and (3,0) complete a red group of 3.
  const redPair = [
    { col: 3, row: 0, colour: 'red' as const },
    { col: 3, row: 1, colour: 'red' as const },
  ];

  it('pops a group of 3 for 10 points each and draws the next colour among those still present', () => {
    const board = boardWith([...redPair, { col: 4, row: 0, colour: 'blue' }]);
    const s = reduceBubbles(crafted(board, 'red'), shoot(90));
    const pop = s.events.find((e) => e.kind === 'pop');
    expect(pop).toMatchObject({ kind: 'pop', points: 30 });
    if (pop?.kind !== 'pop') throw new Error('no pop');
    expect(pop.cells).toEqual(
      expect.arrayContaining([
        { col: 4, row: 2 },
        { col: 3, row: 1 },
        { col: 3, row: 0 },
      ]),
    );
    expect(pop.cells).toHaveLength(3);
    expect(s.score).toBe(30);
    expect(s.events).toContainEqual({ kind: 'score', points: 30 });
    expect(kinds(s)).not.toContain('drop');
    expect(kinds(s)).not.toContain('combo');
    expect(s.combos).toBe(0);
    expect(coloursOn(s.board)).toEqual(['blue']);
    expect(s.current).toBe('blue');
    expect(s.queue.every((c) => c === 'blue')).toBe(true);
    expect(s.queue).toHaveLength(QUEUE_LENGTH);
  });

  it('does not pop a group of 2', () => {
    const board = boardWith([{ col: 3, row: 1, colour: 'red' }, { col: 3, row: 0, colour: 'blue' }]);
    const s = reduceBubbles(crafted(board, 'red'), shoot(90));
    expect(kinds(s)).not.toContain('pop');
    expect(s.score).toBe(0);
    expect(s.board[2][4]).toBe('red');
    expect(count(s.board)).toBe(3);
  });

  it('drops the bubbles disconnected by a pop (20 each) and counts a combo', () => {
    // (2,1) green hangs only from (3,0)/(3,1): it drops once the red group pops.
    const board = boardWith([...redPair, { col: 4, row: 0, colour: 'blue' }, { col: 2, row: 1, colour: 'green' }]);
    const s = reduceBubbles(crafted(board, 'red'), shoot(90));
    expect(s.events).toContainEqual({ kind: 'drop', cells: [{ col: 2, row: 1 }], points: 20 });
    expect(s.events).toContainEqual({ kind: 'score', points: 50 });
    expect(kinds(s)).toContain('combo');
    expect(s.score).toBe(50);
    expect(s.combos).toBe(1);
    expect(coloursOn(s.board)).toEqual(['blue']);
    expect(s.current).toBe('blue');
    expect(s.status).toBe('playing');
  });

  it('counts a combo for a pop of 5 or more', () => {
    const board = boardWith([
      { col: 4, row: 0, colour: 'blue' },
      { col: 3, row: 1, colour: 'red' },
      { col: 2, row: 1, colour: 'red' },
      { col: 1, row: 1, colour: 'red' },
      { col: 0, row: 1, colour: 'red' },
    ]);
    const s = reduceBubbles(crafted(board, 'red'), shoot(90));
    expect(s.events.find((e) => e.kind === 'pop')).toMatchObject({ points: 50 });
    expect(kinds(s)).not.toContain('drop');
    expect(kinds(s)).toContain('combo');
    expect(s.combos).toBe(1);
    expect(s.score).toBe(50);
    expect(count(s.board)).toBe(1);
  });

  it('does not count a combo for a pop of 4 without a drop', () => {
    const board = boardWith([
      { col: 4, row: 0, colour: 'blue' },
      { col: 3, row: 1, colour: 'red' },
      { col: 2, row: 1, colour: 'red' },
      { col: 1, row: 1, colour: 'red' },
    ]);
    const s = reduceBubbles(crafted(board, 'red'), shoot(90));
    expect(s.score).toBe(40);
    expect(s.combos).toBe(0);
  });
});

describe('AC-29: pressure, end of round and refill', () => {
  it('computes the push interval: 6, then 5 from 20 shots, then 4 from 40', () => {
    expect(pushInterval(0)).toBe(6);
    expect(pushInterval(19)).toBe(6);
    expect(pushInterval(20)).toBe(5);
    expect(pushInterval(39)).toBe(5);
    expect(pushInterval(40)).toBe(4);
    expect(pushInterval(100)).toBe(4);
  });

  it('pushes a row from the top on the 6th shot and flips the row parity', () => {
    // Shots aimed at the top-row columns 2, 4, 6, 8 (then 4 and 6 again): no group of 3 can form, whatever the
    // colours drawn, so every bubble stays where it landed.
    const angles = [100.9, 90, 79.1, 69, 90, 79.1];
    let s = crafted(boardWith([{ col: 0, row: 0, colour: 'red' }]), 'blue');
    for (let i = 1; i <= 5; i++) {
      s = reduceBubbles(s, shoot(angles[i - 1]));
      expect(kinds(s)).not.toContain('push');
      expect(kinds(s)).not.toContain('pop');
      expect(s.shotsUntilPush).toBe(6 - i);
    }
    expect(s.board[0].map((c) => (c ? 'x' : '.')).join('')).toBe('x.x.x.x.x');
    const before = s.board;
    s = reduceBubbles(s, shoot(angles[5]));
    expect(kinds(s)).not.toContain('pop');
    expect(kinds(s)).toContain('push');
    expect(s.shotsFired).toBe(6);
    expect(s.shotsSincePush).toBe(0);
    expect(s.shotsUntilPush).toBe(6);
    expect(s.shift).toBe(1);
    // The new row 0 is shifted (8 cells); the old rows (plus the bubble just shot) moved down one row.
    expect(s.board[0].filter((c) => c !== null)).toHaveLength(8);
    expect(s.board[0][8]).toBeNull();
    const shot = s.events[0];
    if (shot.kind !== 'shot' || !shot.landing) throw new Error('no landing');
    expect(s.board[shot.landing.row + 1][shot.landing.col]).toBe(shot.colour);
    before.forEach((row, r) => row.forEach((c, col) => c && expect(s.board[r + 1][col]).toBe(c)));
    expect(s.board[1][0]).toBe('red');
    expect(s.status).toBe('playing');
  });

  it('pushes every 5 shots after 20 shots and every 4 after 40', () => {
    const base = crafted(emptyBoard(), 'blue');
    const at = (shotsFired: number, shotsSincePush: number) =>
      reduceBubbles({ ...base, shotsFired, shotsSincePush, shotsUntilPush: pushInterval(shotsFired) - shotsSincePush }, shoot(90));
    // Before 20 shots: 6 is the threshold.
    expect(kinds(at(18, 4))).not.toContain('push');
    expect(at(18, 4).shotsUntilPush).toBe(1);
    expect(kinds(at(18, 5))).toContain('push');
    // 20th shot: the threshold becomes 5.
    expect(kinds(at(19, 4))).toContain('push');
    expect(at(19, 2).shotsUntilPush).toBe(2);
    expect(kinds(at(24, 3))).not.toContain('push');
    expect(kinds(at(24, 4))).toContain('push');
    expect(at(24, 4).shotsUntilPush).toBe(5);
    // 40th shot: the threshold becomes 4.
    expect(kinds(at(39, 3))).toContain('push');
    expect(kinds(at(44, 2))).not.toContain('push');
    expect(at(44, 2).shotsUntilPush).toBe(1);
    expect(kinds(at(44, 3))).toContain('push');
    expect(at(44, 3).shotsUntilPush).toBe(4);
  });

  it('ends the round when a push brings a bubble to the bottom row', () => {
    const board = boardWith([{ col: 0, row: 0, colour: 'red' }, { col: 0, row: 10, colour: 'green' }]);
    const s = reduceBubbles(crafted(board, 'blue', { shotsFired: 4, shotsSincePush: 4, shotsUntilPush: 2 }), shoot(90));
    expect(kinds(s)).not.toContain('push');
    expect(s.status).toBe('playing');
    const t = reduceBubbles(s, shoot(90));
    expect(kinds(t)).toContain('push');
    expect(t.board[11][0]).toBe('green');
    expect(t.status).toBe('over');
    expect(t.events).toContainEqual({ kind: 'over', score: 0 });
  });

  it('ends the round when a bubble snaps on the bottom row', () => {
    const board = boardWith([{ col: 4, row: 0, colour: 'red' }, { col: 4, row: 10, colour: 'green' }]);
    const s = reduceBubbles(crafted(board, 'blue'), shoot(90));
    expect(s.events[0]).toMatchObject({ kind: 'shot', landing: { row: 11 } });
    expect(s.board[11].filter((c) => c !== null)).toEqual(['blue']);
    expect(s.status).toBe('over');
    expect(s.events[s.events.length - 1]).toEqual({ kind: 'over', score: 0 });
    // Nothing happens after the end.
    expect(reduceBubbles(s, shoot(90)).events).toEqual([]);
  });

  it('does not end the round while the bottom row stays empty', () => {
    const board = boardWith([{ col: 4, row: 0, colour: 'red' }, { col: 4, row: 8, colour: 'green' }]);
    const s = reduceBubbles(crafted(board, 'blue'), shoot(90));
    expect(s.events[0]).toMatchObject({ kind: 'shot', landing: { row: 9 } });
    expect(s.status).toBe('playing');
  });

  it('grants 500 on an empty board, refills 5 rows and keeps the shot counter', () => {
    const board = boardWith([{ col: 3, row: 0, colour: 'red' }, { col: 3, row: 1, colour: 'red' }]);
    const s = reduceBubbles(crafted(board, 'red', { shotsFired: 7, shotsSincePush: 1, shotsUntilPush: 5 }), shoot(90));
    expect(kinds(s)).toEqual(['shot', 'pop', 'refill', 'score']);
    expect(s.events).toContainEqual({ kind: 'refill', bonus: 500 });
    expect(s.score).toBe(530);
    expect(s.status).toBe('playing');
    for (let row = 0; row < 5; row++) {
      expect(s.board[row].filter((c) => c !== null)).toHaveLength(row % 2 === 0 ? 9 : 8);
    }
    for (let row = 5; row < BUBBLE_ROWS; row++) expect(s.board[row].every((c) => c === null)).toBe(true);
    expect(s.shotsFired).toBe(8);
    expect(s.shotsSincePush).toBe(2);
    expect(s.shotsUntilPush).toBe(4);
    expect(coloursOn(s.board)).toContain(s.current);
  });

  it('refills before a push that is due on the same shot', () => {
    const board = boardWith([{ col: 3, row: 0, colour: 'red' }, { col: 3, row: 1, colour: 'red' }]);
    const s = reduceBubbles(crafted(board, 'red', { shotsFired: 5, shotsSincePush: 5, shotsUntilPush: 1 }), shoot(90));
    expect(kinds(s)).toEqual(['shot', 'pop', 'refill', 'push', 'score']);
    expect(s.board.slice(0, 6).every((row) => row.some((c) => c !== null))).toBe(true);
    expect(s.board[6].every((c) => c === null)).toBe(true);
    expect(s.status).toBe('playing');
  });
});

describe('AC-16: determinism', () => {
  const actions = [90, 45, 120, 60, 100, 30, 150, 80, 90, 70, 110, 95];

  function play(seed: number): BubbleState[] {
    const states: BubbleState[] = [createBubbles(seed, { aim: 1, next: 2 })];
    for (const angle of actions) states.push(reduceBubbles(states[states.length - 1], shoot(angle)));
    return states;
  }

  it('gives the same states and scores for the same seed and the same shots', () => {
    const a = play(2026);
    const b = play(2026);
    expect(a).toEqual(b);
    expect(a[a.length - 1].shotsFired).toBeGreaterThan(0);
  });

  it('gives different boards for different seeds', () => {
    expect(createBubbles(1).board).not.toEqual(createBubbles(2).board);
  });

  it('never leaves the rng state unchanged across a fired shot and never mutates the input state', () => {
    const start = createBubbles(11);
    const snapshot = JSON.parse(JSON.stringify(start));
    const s = reduceBubbles(start, shoot(90));
    expect(s.rngState).not.toBe(start.rngState);
    expect(start).toEqual(snapshot);
  });
});
