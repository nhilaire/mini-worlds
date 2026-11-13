import { PALETTE } from '../art/palette';
import { CARD_BACK, SOCKS } from '../art/games/socks';
import { ICON } from '../art/icons/socks';
import { validateSprite } from '../art/sprites';
import {
  BOARD_POINTS,
  MAX_MISSES,
  PEEK_MS_PER_LEVEL,
  SOCK_KINDS,
  createSocks,
  pairsForBoard,
  reduceSocks,
  rowsForBoard,
  withCards,
  type SocksAction,
  type SocksState,
} from '../game/socks/engine';

const flip = (index: number): SocksAction => ({ type: 'flip', index });
const run = (state: SocksState, actions: readonly SocksAction[]): SocksState => actions.reduce(reduceSocks, state);
const kinds = (s: SocksState) => s.events.map((e) => e.kind);
/** Indices of both cards of each sock on the board. */
function pairsOf(s: SocksState): [number, number][] {
  const bySock = new Map<number, number[]>();
  s.cards.forEach((card, i) => bySock.set(card.sock, [...(bySock.get(card.sock) ?? []), i]));
  return [...bySock.values()].map(([a, b]) => [a, b]);
}
/** Two cards of different socks. */
function missOf(s: SocksState): [number, number] {
  const b = s.cards.findIndex((card) => card.sock !== s.cards[0].sock);
  return [0, b];
}
/** Finds every pair of the current board. */
const clearBoard = (s: SocksState) => run(s, pairsOf(s).flatMap(([a, b]) => [flip(a), flip(b)]));

describe('Chaussettes Perdues engine (AC-64)', () => {
  it('AC-64: board n holds 6 + 2 × (n − 1) pairs (max 12), each sock exactly twice, in 4 columns', () => {
    expect([1, 2, 3, 4, 5].map(pairsForBoard)).toEqual([6, 8, 10, 12, 12]);
    expect([1, 2, 3, 4].map(rowsForBoard)).toEqual([3, 4, 5, 6]);
    let s = createSocks(42);
    for (let board = 1; board <= 5; board++) {
      expect(s.board).toBe(board);
      expect(s.cards).toHaveLength(2 * pairsForBoard(board));
      const counts = new Map<number, number>();
      for (const card of s.cards) counts.set(card.sock, (counts.get(card.sock) ?? 0) + 1);
      expect([...counts.values()].every((c) => c === 2)).toBe(true);
      expect([...counts.keys()].every((k) => k >= 0 && k < SOCK_KINDS)).toBe(true);
      expect(s.cards.every((c) => c.state === 'down')).toBe(true);
      s = clearBoard(s);
    }
  });

  it('AC-64: the deal is seeded (same seed, same board; another seed, another board)', () => {
    expect(createSocks(7).cards).toEqual(createSocks(7).cards);
    expect(createSocks(7).cards).not.toEqual(createSocks(8).cards);
  });

  it('AC-64: a pair scores 100 + 50 × the pairs found in a row just before it and stays up', () => {
    let s = createSocks(3);
    const pairs = pairsOf(s);
    s = run(s, [flip(pairs[0][0])]);
    expect(kinds(s)).toEqual(['flip']);
    expect(s.score).toBe(0);
    s = reduceSocks(s, flip(pairs[0][1]));
    expect(s.score).toBe(100);
    expect(s.cards[pairs[0][0]].state).toBe('found');
    expect(s.cards[pairs[0][1]].state).toBe('found');
    expect(s.events).toContainEqual({ kind: 'pair', a: pairs[0][0], b: pairs[0][1], points: 100, streak: 1 });
    s = run(s, [flip(pairs[1][0]), flip(pairs[1][1])]);
    expect(s.score).toBe(100 + 150);
    s = run(s, [flip(pairs[2][0]), flip(pairs[2][1])]);
    expect(s.score).toBe(100 + 150 + 200);
    expect(s.streak).toBe(3);
  });

  it('AC-64: a miss counts, resets the streak and the next tap only hides both cards (no card turned)', () => {
    let s = createSocks(5);
    const pairs = pairsOf(s);
    s = run(s, [flip(pairs[0][0]), flip(pairs[0][1])]);
    expect(s.streak).toBe(1);
    const a = pairs[1][0];
    const b = pairs[2][0];
    s = run(s, [flip(a), flip(b)]);
    expect(kinds(s)).toEqual(['flip', 'miss']);
    expect(s.misses).toBe(1);
    expect(s.streak).toBe(0);
    expect(s.missPending).toBe(true);
    expect(s.cards[a].state).toBe('up');
    const other = pairs[3][0];
    s = reduceSocks(s, flip(other));
    expect(kinds(s)).toEqual(['hide']);
    expect(s.cards[a].state).toBe('down');
    expect(s.cards[b].state).toBe('down');
    expect(s.cards[other].state).toBe('down');
    // The streak restarts: the next pair scores 100 again.
    s = run(s, [flip(pairs[1][0]), flip(pairs[1][1])]);
    expect(s.score).toBe(100 + 100);
  });

  it('AC-64: « hide » (sent by the screen after 700 ms) turns the miss back down; otherwise it is ignored', () => {
    let s = createSocks(9);
    const [a, b] = missOf(s);
    expect(reduceSocks(s, { type: 'hide' })).toBe(s);
    s = run(s, [flip(a), flip(b), { type: 'hide' }]);
    expect(kinds(s)).toEqual(['hide']);
    expect(s.missPending).toBe(false);
    expect(s.cards[a].state).toBe('down');
    expect(s.up).toEqual([]);
    // After the hide, a tap turns a card again.
    s = reduceSocks(s, flip(a));
    expect(kinds(s)).toEqual(['flip']);
  });

  it('AC-64: tapping a card already up or found is ignored', () => {
    let s = createSocks(11);
    const pairs = pairsOf(s);
    s = run(s, [flip(pairs[0][0])]);
    expect(reduceSocks(s, flip(pairs[0][0])).events).toEqual([]);
    s = run(s, [flip(pairs[0][1])]);
    expect(reduceSocks(s, flip(pairs[0][0])).events).toEqual([]);
    expect(reduceSocks(s, flip(99)).events).toEqual([]);
  });

  it('AC-64: the 8th miss ends the round with the current score', () => {
    let s = createSocks(13);
    const pairs = pairsOf(s);
    s = run(s, [flip(pairs[0][0]), flip(pairs[0][1])]);
    const [a, b] = [pairs[1][0], pairs[2][0]];
    for (let i = 1; i < MAX_MISSES; i++) s = run(s, [flip(a), flip(b), { type: 'hide' }]);
    expect(s.misses).toBe(MAX_MISSES - 1);
    expect(s.status).toBe('playing');
    s = run(s, [flip(a), flip(b)]);
    expect(s.status).toBe('over');
    expect(s.events).toContainEqual({ kind: 'over', score: 100 });
    expect(reduceSocks(s, flip(pairs[3][0])).status).toBe('over');
  });

  it('AC-64: a full board scores 200 more and deals the next one; the streak carries over', () => {
    let s = withCards(createSocks(1), [0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5]);
    s = run(s, [0, 1, 2, 3, 4].flatMap((i) => [flip(i), flip(i + 6)]));
    expect(s.board).toBe(1);
    const before = s.score;
    s = run(s, [flip(5), flip(11)]);
    expect(s.score).toBe(before + 100 + 50 * 5 + BOARD_POINTS);
    expect(s.board).toBe(2);
    expect(s.cards).toHaveLength(16);
    expect(s.cards.every((c) => c.state === 'down')).toBe(true);
    expect(s.events).toContainEqual({ kind: 'board', board: 2, points: BOARD_POINTS });
    expect(s.streak).toBe(6);
    const [p] = pairsOf(s);
    s = run(s, [flip(p[0]), flip(p[1])]);
    expect(s.events).toContainEqual(expect.objectContaining({ kind: 'pair', points: 100 + 50 * 6 }));
  });

  it('AC-64: a combo is emitted on every 3rd pair found in a row, exactly', () => {
    let s = createSocks(21);
    const pairs = pairsOf(s);
    const combosAfter: number[] = [];
    for (const [a, b] of pairs) {
      s = run(s, [flip(a), flip(b)]);
      combosAfter.push(s.events.filter((e) => e.kind === 'combo').length);
    }
    expect(combosAfter).toEqual([0, 0, 1, 0, 0, 1]);
    expect(s.combos).toBe(2);
    // A miss resets the run: two more pairs give no combo, the third does.
    const next = pairsOf(s);
    s = run(s, [flip(next[0][0]), flip(next[1][0]), { type: 'hide' }]);
    for (const [a, b] of next.slice(0, 2)) s = run(s, [flip(a), flip(b)]);
    expect(s.combos).toBe(2);
    s = run(s, [flip(next[2][0]), flip(next[2][1])]);
    expect(s.combos).toBe(3);
  });

  it('AC-64: « Coup d\'œil » sets the peek duration (1 / 2 / 3 s); inputs are ignored until endPeek', () => {
    expect(createSocks(1).peeking).toBe(false);
    expect([1, 2, 3].map((level) => createSocks(1, { peek: level }).peekMs)).toEqual([1, 2, 3].map((l) => l * PEEK_MS_PER_LEVEL));
    let s = createSocks(1, { peek: 2 });
    expect(s.peeking).toBe(true);
    expect(reduceSocks(s, flip(0)).events).toEqual([]);
    expect(reduceSocks(s, flip(0)).cards[0].state).toBe('down');
    s = reduceSocks(s, { type: 'endPeek' });
    expect(s.peeking).toBe(false);
    expect(kinds(reduceSocks(s, flip(0)))).toEqual(['flip']);
    // Each new board starts with its peek again.
    s = clearBoard(s);
    expect(s.board).toBe(2);
    expect(s.peeking).toBe(true);
  });
});

describe('Chaussettes Perdues sprites', () => {
  const luminance = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  };

  it('12 valid sock sprites, the card back and the icon are 12×12', () => {
    expect(SOCKS).toHaveLength(SOCK_KINDS);
    for (const sprite of [...SOCKS, CARD_BACK, ICON]) {
      expect(validateSprite(sprite)).toEqual([]);
      expect(sprite.rows).toHaveLength(12);
      expect(sprite.rows[0]).toHaveLength(12);
    }
  });

  it('the 12 socks differ without colour (light / dark pattern of each pixel)', () => {
    const shapes = SOCKS.map((sprite) =>
      sprite.rows.map((row) => [...row].map((ch) => (ch === '.' ? '.' : luminance(PALETTE[sprite.legend[ch]]) >= 0.5 ? '1' : '0')).join('')).join('/'),
    );
    expect(new Set(shapes).size).toBe(SOCK_KINDS);
  });
});
