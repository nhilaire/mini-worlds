// Bloc Glissant rules shared by the engine, the generator and the casual bot: the board, the legal one-cell moves and
// the breadth-first searches (par = minimum number of one-cell moves, hints = first move of a shortest solution).
// A layout is keyed by the moving coordinate of each block (0..4, base 5): a plain number, no string and no object
// per visited layout, so a whole round of generation stays well under a second.

export const SLIDE_SIZE = 6;
/** Row of the red block (3rd from the top). */
export const RED_ROW = 2;
/** Column of the red block's left cell when solved (it covers columns 4-5 and touches the exit). */
export const EXIT_COL = SLIDE_SIZE - 2;
/** Safety cap of the shortest-path search; a 6 × 6 board with ≤ 11 blocks reaches far fewer layouts. */
export const SOLVER_MAX_STATES = 400_000;

export type Block = { row: number; col: number; len: number; horizontal: boolean };
export type Layout = readonly Block[];
/** One block, one cell: delta −1 = left / up, +1 = right / down. */
export type SlideMove = { block: number; delta: -1 | 1 };

export const isSolved = (blocks: Layout): boolean => blocks[0].col === EXIT_COL;

function occupancy(blocks: Layout): Uint8Array {
  const grid = new Uint8Array(SLIDE_SIZE * SLIDE_SIZE);
  for (const b of blocks) for (let i = 0; i < b.len; i++) grid[b.horizontal ? b.row * SLIDE_SIZE + b.col + i : (b.row + i) * SLIDE_SIZE + b.col] = 1;
  return grid;
}

/** Every one-cell move into a free cell, block by block, backward (−1) before forward (+1). */
export function legalMoves(blocks: Layout): SlideMove[] {
  const grid = occupancy(blocks);
  const out: SlideMove[] = [];
  blocks.forEach((b, block) => {
    if (b.horizontal) {
      if (b.col > 0 && !grid[b.row * SLIDE_SIZE + b.col - 1]) out.push({ block, delta: -1 });
      if (b.col + b.len < SLIDE_SIZE && !grid[b.row * SLIDE_SIZE + b.col + b.len]) out.push({ block, delta: 1 });
    } else {
      if (b.row > 0 && !grid[(b.row - 1) * SLIDE_SIZE + b.col]) out.push({ block, delta: -1 });
      if (b.row + b.len < SLIDE_SIZE && !grid[(b.row + b.len) * SLIDE_SIZE + b.col]) out.push({ block, delta: 1 });
    }
  });
  return out;
}

export function applyMove(blocks: Layout, move: SlideMove): Block[] {
  return blocks.map((b, i) => (i !== move.block ? b : b.horizontal ? { ...b, col: b.col + move.delta } : { ...b, row: b.row + move.delta }));
}

/** Numeric view of a layout: fixed line and length of each block, base-5 weights of the moving coordinate. */
export type Board = { n: number; horizontal: boolean[]; len: number[]; line: number[]; weight: number[] };

/** Most blocks a layout may hold: keys (5^11) and parent links (key × 32) stay within 31 bits. */
export const MAX_BLOCKS = 11;

export function boardOf(blocks: Layout): Board {
  if (blocks.length > MAX_BLOCKS) throw new Error(`at most ${MAX_BLOCKS} blocks`);
  const weight: number[] = [];
  for (let i = 0, w = 1; i < blocks.length; i++, w *= 5) weight.push(w);
  return {
    n: blocks.length,
    horizontal: blocks.map((b) => b.horizontal),
    len: blocks.map((b) => b.len),
    line: blocks.map((b) => (b.horizontal ? b.row : b.col)),
    weight,
  };
}

export function keyOf(board: Board, blocks: Layout): number {
  let key = 0;
  for (let i = 0; i < board.n; i++) key += (board.horizontal[i] ? blocks[i].col : blocks[i].row) * board.weight[i];
  return key;
}

/** The layout of a key (fixed lines and lengths taken from `like`, a layout of the same board). */
export function layoutOf(board: Board, key: number, like: Layout): Block[] {
  let rest = key;
  return like.map((b, i) => {
    const p = rest % 5;
    rest = (rest - p) / 5;
    return board.horizontal[i] ? { ...b, col: p } : { ...b, row: p };
  });
}

/** Red block's moving coordinate in a key (block 0 has weight 1). */
export const redOf = (key: number): number => key % 5;

/** Open-addressing hash table from a layout key (≥ 0) to an integer, on typed arrays (much faster than a Map). */
class KeyTable {
  size = 0;
  private keys: Int32Array;
  private vals: Int32Array;
  private mask: number;
  private shift: number;
  constructor(bits = 12) {
    this.keys = new Int32Array(1 << bits).fill(-1);
    this.vals = new Int32Array(1 << bits);
    this.mask = (1 << bits) - 1;
    this.shift = 32 - bits;
  }
  private slot(key: number): number {
    // Fibonacci hashing: the high bits of key × 2^32/φ spread the base-5 keys evenly.
    let i = Math.imul(key, 0x9e3779b1) >>> this.shift;
    while (this.keys[i] !== -1 && this.keys[i] !== key) i = (i + 1) & this.mask;
    return i;
  }
  /** The value of `key`, or −1 when absent. */
  get(key: number): number {
    const i = this.slot(key);
    return this.keys[i] === -1 ? -1 : this.vals[i];
  }
  set(key: number, value: number): void {
    if ((this.size + 1) * 2 > this.keys.length) this.grow();
    const i = this.slot(key);
    if (this.keys[i] === -1) {
      this.keys[i] = key;
      this.size++;
    }
    this.vals[i] = value;
  }
  values(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.keys.length; i++) if (this.keys[i] !== -1) out.push(this.vals[i]);
    return out;
  }
  private grow(): void {
    const { keys, vals } = this;
    this.keys = new Int32Array(keys.length * 2).fill(-1);
    this.vals = new Int32Array(keys.length * 2);
    this.mask = this.keys.length - 1;
    this.shift -= 1;
    this.size = 0;
    for (let i = 0; i < keys.length; i++) if (keys[i] !== -1) this.set(keys[i], vals[i]);
  }
}

/** Scratch buffers of the searches: one per board size, reused. */
type Scratch = { pos: Int8Array; grid: Uint8Array; next: Int32Array; move: Int8Array };
const scratchOf = (n: number): Scratch => ({ pos: new Int8Array(n), grid: new Uint8Array(SLIDE_SIZE * SLIDE_SIZE), next: new Int32Array(2 * n), move: new Int8Array(2 * n) });

/** Fills `s.next` with the keys reachable in one move from `key` (`s.move` = block * 2 + (delta > 0)); returns their count. */
function expand(board: Board, key: number, s: Scratch): number {
  const { n, horizontal, len, line, weight } = board;
  const { pos, grid } = s;
  let rest = key;
  for (let i = 0; i < n; i++) {
    pos[i] = rest % 5;
    rest = (rest - pos[i]) / 5;
  }
  grid.fill(0);
  for (let i = 0; i < n; i++) for (let c = 0; c < len[i]; c++) grid[horizontal[i] ? line[i] * SLIDE_SIZE + pos[i] + c : (pos[i] + c) * SLIDE_SIZE + line[i]] = 1;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const p = pos[i];
    if (p > 0 && !grid[horizontal[i] ? line[i] * SLIDE_SIZE + p - 1 : (p - 1) * SLIDE_SIZE + line[i]]) {
      s.next[count] = key - weight[i];
      s.move[count++] = i * 2;
    }
    if (p + len[i] < SLIDE_SIZE && !grid[horizontal[i] ? line[i] * SLIDE_SIZE + p + len[i] : (p + len[i]) * SLIDE_SIZE + line[i]]) {
      s.next[count] = key + weight[i];
      s.move[count++] = i * 2 + 1;
    }
  }
  return count;
}

/**
 * Shortest solution from a layout (the list of one-cell moves, empty when already solved), or null when none exists
 * within SOLVER_MAX_STATES layouts. Breadth-first; moves are tried in `legalMoves` order, so the answer is
 * deterministic.
 */
export function solve(blocks: Layout): SlideMove[] | null {
  if (isSolved(blocks)) return [];
  const board = boardOf(blocks);
  const s = scratchOf(board.n);
  const start = keyOf(board, blocks);
  // parent key * 32 + move (block * 2 + (delta > 0)) of every reached layout; the start has −1.
  const parent = new KeyTable();
  parent.set(start, -1);
  const queue: number[] = [start];
  let goal = -1;
  for (let head = 0; head < queue.length && goal < 0; head++) {
    const key = queue[head];
    const count = expand(board, key, s);
    for (let j = 0; j < count; j++) {
      const next = s.next[j];
      if (parent.get(next) !== -1 || next === start) continue;
      parent.set(next, key * 32 + s.move[j]);
      if (redOf(next) === EXIT_COL) {
        goal = next;
        break;
      }
      queue.push(next);
    }
    if (parent.size > SOLVER_MAX_STATES) return null;
  }
  if (goal < 0) return null;
  const path: SlideMove[] = [];
  for (let key = goal; key !== start; ) {
    const link = parent.get(key);
    const m = link % 32;
    path.push({ block: m >> 1, delta: m & 1 ? 1 : -1 });
    key = (link - m) / 32;
  }
  return path.reverse();
}

/**
 * Par of every layout reachable from `blocks` (moves are reversible, so this is its whole connected component):
 * a breadth-first search lists the component, then a multi-source one from its solved layouts gives each layout its
 * distance to the nearest solved one. Null when the component exceeds `cap` layouts (bounded generator).
 */
export function parMap(blocks: Layout, cap: number): { board: Board; keys: number[]; par: (key: number) => number } | null {
  const board = boardOf(blocks);
  const s = scratchOf(board.n);
  const start = keyOf(board, blocks);
  const index = new KeyTable();
  index.set(start, 0);
  const all: number[] = [start];
  for (let i = 0; i < all.length; i++) {
    const count = expand(board, all[i], s);
    for (let j = 0; j < count; j++) {
      const next = s.next[j];
      if (index.get(next) === -1) {
        index.set(next, all.length);
        all.push(next);
      }
    }
    if (all.length > cap) return null;
  }
  const par = new Int32Array(all.length).fill(-1);
  const queue: number[] = [];
  all.forEach((key, i) => {
    if (redOf(key) === EXIT_COL) {
      par[i] = 0;
      queue.push(i);
    }
  });
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const count = expand(board, all[i], s);
    for (let j = 0; j < count; j++) {
      const k = index.get(s.next[j]);
      if (par[k] === -1) {
        par[k] = par[i] + 1;
        queue.push(k);
      }
    }
  }
  return { board, keys: all, par: (key) => par[index.get(key)] };
}
