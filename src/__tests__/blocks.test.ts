import {
  BLOCKS_COLS,
  BLOCKS_ROWS,
  BlocksState,
  Board,
  Cell,
  createBlocks,
  displayLevel,
  fallInterval,
  fits,
  ghostPiece,
  LOCK_DELAY_MS,
  pieceCells,
  reduceBlocks,
  TETROMINOES,
  Tetromino,
  visibleQueue,
} from '../game/blocks/engine';

function boardWith(rows: string[]): Board {
  // rows are given from the bottom: 'X' = filled, '.' = empty; missing rows are empty.
  const board: Cell[][] = Array.from({ length: BLOCKS_ROWS }, () => Array<Cell>(BLOCKS_COLS).fill(null));
  rows.forEach((row, i) => {
    const r = BLOCKS_ROWS - 1 - i;
    for (let c = 0; c < BLOCKS_COLS; c++) board[r][c] = row[c] === 'X' ? 'O' : null;
  });
  return board;
}

function withPiece(state: BlocksState, type: Tetromino, board: Board = state.board): BlocksState {
  return { ...state, board, piece: { type, rotation: 0, x: 3, y: 0 }, fallMs: 0, lockMs: 0 };
}

const bottom = (board: Board, r: number) => board[BLOCKS_ROWS - 1 - r].map((c) => (c ? 'X' : '.')).join('');

describe('7-bag (AC-17)', () => {
  it('every 7 consecutive pieces contain each tetromino once', () => {
    let state = createBlocks(5);
    const seen: Tetromino[] = [state.piece!.type];
    const empty = createBlocks(5).board;
    while (seen.length < 28) {
      // the board is emptied after each lock so that the round never ends
      state = { ...reduceBlocks(state, { type: 'hardDrop' }), board: empty };
      seen.push(state.piece!.type);
    }
    for (let i = 0; i + 7 <= 28; i += 7) expect(seen.slice(i, i + 7).slice().sort()).toEqual(TETROMINOES.slice().sort());
  });

  it('the preview shows as many next pieces as the upgrade level', () => {
    expect(visibleQueue(createBlocks(1))).toEqual([]);
    expect(visibleQueue(createBlocks(1, { preview: 2 }))).toHaveLength(2);
    expect(visibleQueue(createBlocks(1, { preview: 3 }))).toHaveLength(3);
    expect(createBlocks(1).queue).toHaveLength(3);
  });
});

describe('moves, rotation, hard drop (AC-18)', () => {
  it('moves one cell and refuses to leave the board', () => {
    let state = withPiece(createBlocks(1), 'O');
    state = reduceBlocks(state, { type: 'move', dx: -1 });
    expect(state.piece?.x).toBe(2);
    expect(state.events).toEqual([{ kind: 'move' }]);
    for (let i = 0; i < 10; i++) state = reduceBlocks(state, { type: 'move', dx: -1 });
    expect(pieceCells(state.piece!).every(([c]) => c >= 0)).toBe(true);
    expect(state.events).toEqual([{ kind: 'refused' }]);
    for (let i = 0; i < 20; i++) state = reduceBlocks(state, { type: 'move', dx: 1 });
    expect(pieceCells(state.piece!).every(([c]) => c < BLOCKS_COLS)).toBe(true);
  });

  it('rotates clockwise with wall kicks and refuses an impossible rotation', () => {
    // I piece against the right wall: vertical rotation needs a kick.
    let state = withPiece(createBlocks(1), 'I');
    for (let i = 0; i < 10; i++) state = reduceBlocks(state, { type: 'move', dx: 1 });
    expect(state.piece?.x).toBe(6);
    state = reduceBlocks(state, { type: 'rotate' });
    expect(state.piece?.rotation).toBe(1);
    expect(fits(state.board, state.piece!)).toBe(true);
    // Boxed in: I vertical in a one-wide well cannot rotate.
    const well = boardWith(['XXXXXXXX.X', 'XXXXXXXX.X', 'XXXXXXXX.X', 'XXXXXXXX.X']);
    const boxed: BlocksState = { ...state, board: well, piece: { type: 'I', rotation: 1, x: 6, y: BLOCKS_ROWS - 4 } };
    expect(fits(well, boxed.piece!)).toBe(true);
    const refused = reduceBlocks(boxed, { type: 'rotate' });
    expect(refused.piece).toEqual(boxed.piece);
    expect(refused.events).toEqual([{ kind: 'refused' }]);
  });

  it('never overlaps blocks: moving into a filled column is refused', () => {
    const board = boardWith(Array(BLOCKS_ROWS).fill('.....XXXXX'));
    const state = withPiece(createBlocks(1), 'O', board); // O occupies cols 4-5 at x=3
    const moved = reduceBlocks(state, { type: 'move', dx: 1 });
    expect(moved.piece).toEqual(state.piece);
    expect(moved.events).toEqual([{ kind: 'refused' }]);
  });

  it('hard drop scores 2 points per row and locks the piece', () => {
    const state = withPiece(createBlocks(1), 'O');
    const dropped = reduceBlocks(state, { type: 'hardDrop' });
    expect(dropped.score).toBe(14 * 2); // O piece: rows 0-1 of the shape, lands with bottom at row 15 → 14 rows
    expect(dropped.events).toEqual(expect.arrayContaining([{ kind: 'drop', rows: 14 }, { kind: 'score', points: 28 }]));
    expect(bottom(dropped.board, 0)).toBe('....XX....');
    expect(ghostPiece(state)?.y).toBe(14);
  });
});

describe('lines, scoring, gravity, end (AC-19, AC-20)', () => {
  it.each([
    [1, 100],
    [2, 300],
    [3, 500],
    [4, 800],
  ])('%i line(s) score %i and the rows above shift down', (count, points) => {
    // Fill `count` rows except cols 4-7 ... use an I piece vertical for 1-4 lines: cols 0-8 filled on `count` rows, col 9 free.
    const rows = Array(count).fill('XXXXXXXXX.');
    const board = boardWith([...rows, '.X........']); // a marker row above the full rows
    let state: BlocksState = { ...createBlocks(1), board, piece: { type: 'I', rotation: 1, x: 7, y: 0 } }; // vertical I at col 9
    state = reduceBlocks(state, { type: 'hardDrop' });
    const dropRows = BLOCKS_ROWS - 4; // column 9 is free down to the bottom: the vertical I drops 12 rows
    expect(state.lines).toBe(count);
    expect(state.score).toBe(points + dropRows * 2);
    expect(state.events).toEqual(expect.arrayContaining([{ kind: 'lines', rows: expect.any(Array), points, chain: 1 }]));
    // marker row shifted down to the bottom; the rest of the I above it
    expect(bottom(state.board, 0).startsWith('.X')).toBe(true);
    expect(state.combos).toBe(count >= 2 ? 1 : 0);
  });

  it('back-to-back clears add 50 × (chain − 1) and count as combos', () => {
    const board = boardWith(['XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.']);
    let state: BlocksState = { ...createBlocks(1), board, piece: { type: 'I', rotation: 1, x: 7, y: 0 }, queue: ['I', 'I', 'I'] };
    state = reduceBlocks(state, { type: 'hardDrop' }); // 4 lines, chain 1
    const after1 = state.score;
    expect(state.chain).toBe(1);
    state = { ...state, piece: { type: 'I', rotation: 1, x: 7, y: 0 } };
    state = reduceBlocks(state, { type: 'hardDrop' }); // 4 lines, chain 2 → +50
    expect(state.chain).toBe(2);
    expect(state.score - after1).toBe(800 + 50 + (BLOCKS_ROWS - 4) * 2);
    expect(state.combos).toBe(2);
    // a lock that clears nothing resets the chain
    state = { ...state, piece: { type: 'O', rotation: 0, x: 0, y: 0 } };
    state = reduceBlocks(state, { type: 'hardDrop' });
    expect(state.chain).toBe(0);
  });

  it('fall interval follows max(150, 800 + 80 × slow − 50 × floor(lines / 10))', () => {
    expect(fallInterval(0, 0)).toBe(800);
    expect(fallInterval(9, 0)).toBe(800);
    expect(fallInterval(10, 0)).toBe(750);
    expect(fallInterval(200, 0)).toBe(150);
    expect(fallInterval(200, 3)).toBe(150);
    expect(fallInterval(0, 3)).toBe(1040);
    expect(fallInterval(100, 1)).toBe(380);
    expect(displayLevel(0)).toBe(1);
    expect(displayLevel(23)).toBe(3);
  });

  it('gravity moves the piece one row per interval and locks after 300 ms on the ground', () => {
    let state = withPiece(createBlocks(1), 'O');
    state = reduceBlocks(state, { type: 'tick', dt: 799 });
    expect(state.piece?.y).toBe(0);
    state = reduceBlocks(state, { type: 'tick', dt: 1 });
    expect(state.piece?.y).toBe(1);
    state = reduceBlocks(state, { type: 'tick', dt: 1600 }); // two more rows
    expect(state.piece?.y).toBe(3);
    // drop to the ground and wait for the lock
    state = { ...state, piece: { ...state.piece!, y: 14 } };
    state = reduceBlocks(state, { type: 'tick', dt: LOCK_DELAY_MS - 1 });
    expect(state.piece?.y).toBe(14);
    expect(bottom(state.board, 0)).toBe('..........');
    state = reduceBlocks(state, { type: 'tick', dt: 1 });
    expect(bottom(state.board, 0)).toBe('....XX....');
    expect(state.piece?.y).toBe(0); // next piece spawned
  });

  it('a move on the ground resets the lock delay', () => {
    let state = withPiece(createBlocks(1), 'O');
    state = { ...state, piece: { ...state.piece!, y: 14 } };
    state = reduceBlocks(state, { type: 'tick', dt: 250 });
    state = reduceBlocks(state, { type: 'move', dx: 1 });
    state = reduceBlocks(state, { type: 'tick', dt: 250 });
    expect(state.piece?.y).toBe(14);
    state = reduceBlocks(state, { type: 'tick', dt: 50 });
    expect(bottom(state.board, 0)).toBe('.....XX...');
  });

  it('the round ends when the next piece cannot spawn', () => {
    const board = boardWith(Array(BLOCKS_ROWS - 4).fill('.XXXXXXXXX')); // col 0 stays free: no line ever clears
    let state: BlocksState = { ...createBlocks(1), board, piece: { type: 'O', rotation: 0, x: 3, y: 0 }, queue: ['O', 'O', 'O'] };
    state = reduceBlocks(state, { type: 'hardDrop' });
    expect(state.status).toBe('playing');
    state = reduceBlocks(state, { type: 'hardDrop' });
    expect(state.status).toBe('over');
    expect(state.piece).toBeNull();
    expect(state.events).toEqual(expect.arrayContaining([{ kind: 'over', score: state.score }]));
    expect(reduceBlocks(state, { type: 'tick', dt: 1000 }).status).toBe('over');
  });
});

describe('determinism (AC-16)', () => {
  it('same seed and same inputs give identical states', () => {
    const actions = Array.from({ length: 60 }, (_, i) => (i % 4 === 0 ? { type: 'rotate' as const } : i % 4 === 1 ? { type: 'move' as const, dx: 1 as const } : i % 4 === 2 ? { type: 'tick' as const, dt: 900 } : { type: 'hardDrop' as const }));
    const run = () => actions.reduce((s, a) => reduceBlocks(s, a), createBlocks(123, { preview: 1 }));
    expect(run()).toEqual(run());
    expect(run()).not.toEqual(actions.reduce((s, a) => reduceBlocks(s, a), createBlocks(124, { preview: 1 })));
  });
});
