// « Pluie de Blocs » (docs/PRD.md "Pluie de Blocs"): falling tetrominoes on a 10 × 16 board, pure reducer.
// Time comes in through `tick` (elapsed ms); randomness through the seeded generator kept in the state.
import type { BaseEvent, RoundState } from '../contract';
import { createRng } from '../rng';

export const BLOCKS_COLS = 10;
export const BLOCKS_ROWS = 16;
export const LOCK_DELAY_MS = 300;
export const MIN_INTERVAL_MS = 150;
export const BASE_INTERVAL_MS = 800;
export const SLOW_START_MS_PER_LEVEL = 80;
export const LINE_SCORES = [0, 100, 300, 500, 800] as const;
export const HARD_DROP_POINTS_PER_ROW = 1; // 1, not 2: stars reward lines, not drops (first phone test)
/** Fall interval while a tutorial bubble is shown: slow, never frozen (AC-47). */
export const TUTORIAL_INTERVAL_MS = 2000;
/** The ghost (landing outline) is shown for the first pieces of a round only (AC-46). */
export const GHOST_PIECES = 5;
/** The fall speeds up with the pieces locked, not only with the lines (AC-49). */
export const PIECES_PER_SPEEDUP = 5;
export const SPEEDUP_MS_PER_STEP = 25;
export const BACK_TO_BACK_BONUS = 50;
export const QUEUE_LENGTH = 3;

export type Tetromino = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export const TETROMINOES: readonly Tetromino[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

/** Shapes as lists of [col, row] cells per rotation (0..3, clockwise), relative to the piece origin. */
const SHAPES: Record<Tetromino, readonly (readonly [number, number][])[]> = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
};

export type Cell = Tetromino | null;
export type Board = readonly (readonly Cell[])[]; // rows × cols, row 0 at the top

export type Piece = { type: Tetromino; rotation: number; x: number; y: number };

export type BlocksEvent =
  | BaseEvent
  | { kind: 'move' }
  | { kind: 'rotate' }
  | { kind: 'refused' }
  | { kind: 'drop'; rows: number }
  | { kind: 'lock'; cells: readonly (readonly [number, number])[] }
  | { kind: 'lines'; rows: readonly number[]; points: number; chain: number };

export type BlocksState = RoundState<BlocksEvent> & {
  board: Board;
  piece: Piece | null;
  queue: readonly Tetromino[];
  bag: readonly Tetromino[];
  rngState: number;
  lines: number;
  /** Pieces locked since the start of the round (ghost rule, fall speed-up). */
  locked: number;
  /** Consecutive locked pieces that cleared lines (0 when the last lock cleared nothing). */
  chain: number;
  fallMs: number;
  lockMs: number;
  slowStartLevel: number;
  previewLevel: number;
};

export type BlocksAction =
  | { type: 'move'; dx: -1 | 1 }
  | { type: 'rotate' }
  | { type: 'hardDrop' }
  /** `tutorial`: a help bubble is shown, the piece falls at the slow tutorial interval. */
  | { type: 'tick'; dt: number; tutorial?: boolean };

export function pieceCells(piece: Piece): [number, number][] {
  return SHAPES[piece.type][piece.rotation & 3].map(([c, r]) => [piece.x + c, piece.y + r]);
}

export function fits(board: Board, piece: Piece): boolean {
  return pieceCells(piece).every(([c, r]) => c >= 0 && c < BLOCKS_COLS && r >= 0 && r < BLOCKS_ROWS && board[r][c] === null);
}

/** Fall interval in ms: max(150, 800 + 80 × slowStart − 50 × floor(lines / 10) − 25 × floor(locked / 5)). */
export function fallInterval(lines: number, slowStartLevel: number, locked = 0): number {
  return Math.max(
    MIN_INTERVAL_MS,
    BASE_INTERVAL_MS + SLOW_START_MS_PER_LEVEL * slowStartLevel - 50 * Math.floor(lines / 10) - SPEEDUP_MS_PER_STEP * Math.floor(locked / PIECES_PER_SPEEDUP),
  );
}

export function displayLevel(lines: number): number {
  return Math.floor(lines / 10) + 1;
}

function emptyBoard(): Board {
  return Array.from({ length: BLOCKS_ROWS }, () => Array<Cell>(BLOCKS_COLS).fill(null));
}

/** Draws from the 7-bag, refilling it (shuffled) when empty. */
function draw(bag: readonly Tetromino[], rngState: number): { type: Tetromino; bag: Tetromino[]; rngState: number } {
  const rng = createRng(rngState);
  const source = bag.length > 0 ? bag.slice() : rng.shuffle(TETROMINOES);
  const type = source.shift() as Tetromino;
  return { type, bag: source, rngState: rng.state() };
}

function spawnPiece(type: Tetromino): Piece {
  return { type, rotation: 0, x: Math.floor((BLOCKS_COLS - 4) / 2), y: 0 };
}

export function createBlocks(seed: number, upgrades: { slow_start?: number; preview?: number } = {}): BlocksState {
  let bag: Tetromino[] = [];
  let rngState = seed >>> 0;
  const queue: Tetromino[] = [];
  for (let i = 0; i < QUEUE_LENGTH + 1; i++) {
    const d = draw(bag, rngState);
    queue.push(d.type);
    bag = d.bag;
    rngState = d.rngState;
  }
  const first = queue.shift() as Tetromino;
  return {
    score: 0,
    combos: 0,
    status: 'playing',
    events: [],
    board: emptyBoard(),
    piece: spawnPiece(first),
    queue,
    bag,
    rngState,
    lines: 0,
    locked: 0,
    chain: 0,
    fallMs: 0,
    lockMs: 0,
    slowStartLevel: upgrades.slow_start ?? 0,
    previewLevel: upgrades.preview ?? 0,
  };
}

/** The next pieces the player may see: as many as the « Aperçu » level allows (0..3). */
export function visibleQueue(state: BlocksState): readonly Tetromino[] {
  return state.queue.slice(0, Math.min(state.previewLevel, QUEUE_LENGTH));
}

function lockPiece(state: BlocksState, events: BlocksEvent[]): BlocksState {
  const piece = state.piece as Piece;
  const cells = pieceCells(piece);
  const board = state.board.map((row) => row.slice());
  for (const [c, r] of cells) board[r][c] = piece.type;
  events.push({ kind: 'lock', cells });

  const fullRows = board.map((row, r) => (row.every((cell) => cell !== null) ? r : -1)).filter((r) => r >= 0);
  let score = state.score;
  let chain = 0;
  let combos = state.combos;
  let cleared: Board = board;
  if (fullRows.length > 0) {
    chain = state.chain + 1;
    const points = LINE_SCORES[fullRows.length] + BACK_TO_BACK_BONUS * (chain - 1);
    score += points;
    const kept = board.filter((_, r) => !fullRows.includes(r));
    cleared = [...Array.from({ length: fullRows.length }, () => Array<Cell>(BLOCKS_COLS).fill(null)), ...kept];
    events.push({ kind: 'lines', rows: fullRows, points, chain });
    events.push({ kind: 'score', points });
    if (fullRows.length >= 2 || chain >= 2) {
      combos += 1;
      events.push({ kind: 'combo' });
    }
  }
  const lines = state.lines + fullRows.length;
  const locked = state.locked + 1;

  // Next piece from the queue; the round ends when it does not fit at spawn.
  const queue = state.queue.slice();
  const next = spawnPiece(queue.shift() as Tetromino);
  const d = draw(state.bag, state.rngState);
  queue.push(d.type);
  if (!fits(cleared, next)) {
    events.push({ kind: 'over', score });
    return { ...state, board: cleared, piece: null, queue, bag: d.bag, rngState: d.rngState, lines, locked, chain, score, combos, status: 'over', events, fallMs: 0, lockMs: 0 };
  }
  return { ...state, board: cleared, piece: next, queue, bag: d.bag, rngState: d.rngState, lines, locked, chain, score, combos, events, fallMs: 0, lockMs: 0 };
}

export function reduceBlocks(state: BlocksState, action: BlocksAction): BlocksState {
  if (state.status !== 'playing' || !state.piece) return { ...state, events: [] };
  const events: BlocksEvent[] = [];
  const piece = state.piece;

  switch (action.type) {
    case 'move': {
      const moved = { ...piece, x: piece.x + action.dx };
      if (!fits(state.board, moved)) return { ...state, events: [{ kind: 'refused' }] };
      events.push({ kind: 'move' });
      return { ...state, piece: moved, events, lockMs: 0 };
    }
    case 'rotate': {
      const rotation = (piece.rotation + 1) & 3;
      for (const dx of [0, -1, 1]) {
        const candidate = { ...piece, rotation, x: piece.x + dx };
        if (fits(state.board, candidate)) {
          events.push({ kind: 'rotate' });
          return { ...state, piece: candidate, events, lockMs: 0 };
        }
      }
      return { ...state, events: [{ kind: 'refused' }] };
    }
    case 'hardDrop': {
      let rows = 0;
      let dropped = piece;
      while (fits(state.board, { ...dropped, y: dropped.y + 1 })) {
        dropped = { ...dropped, y: dropped.y + 1 };
        rows++;
      }
      const points = rows * HARD_DROP_POINTS_PER_ROW;
      events.push({ kind: 'drop', rows });
      if (points > 0) events.push({ kind: 'score', points });
      return lockPiece({ ...state, piece: dropped, score: state.score + points }, events);
    }
    case 'tick': {
      let current: BlocksState = { ...state, events };
      let remaining = action.dt;
      // Several gravity steps can elapse in one long tick (the loop is bounded by the board height).
      while (remaining > 0 && current.status === 'playing' && current.piece) {
        const below = { ...current.piece, y: current.piece.y + 1 };
        if (fits(current.board, below)) {
          const interval = action.tutorial ? TUTORIAL_INTERVAL_MS : fallInterval(current.lines, current.slowStartLevel, current.locked);
          const fallMs = current.fallMs + remaining;
          if (fallMs < interval) return { ...current, fallMs, lockMs: 0 };
          current = { ...current, piece: below, fallMs: 0, lockMs: 0 };
          remaining = fallMs - interval;
        } else {
          const lockMs = current.lockMs + remaining;
          if (lockMs < LOCK_DELAY_MS) return { ...current, lockMs, fallMs: 0 };
          current = lockPiece({ ...current, lockMs: 0, fallMs: 0 }, events);
          remaining = 0;
        }
      }
      return current;
    }
  }
}

/** Where the piece would land (ghost outline); null once the first GHOST_PIECES pieces of the round have locked. */
export function ghostPiece(state: BlocksState): Piece | null {
  if (!state.piece || state.locked >= GHOST_PIECES) return null;
  let ghost = state.piece;
  while (fits(state.board, { ...ghost, y: ghost.y + 1 })) ghost = { ...ghost, y: ghost.y + 1 };
  return ghost;
}
