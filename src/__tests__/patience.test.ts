import { gameById } from '../game/core/content';
import { BOT_DRAW_CHANCE, playPatienceBot } from '../game/patience/bot';
import {
  acceptsInput,
  bottomCard,
  CARD_POINTS,
  cardPoints,
  CLEAR_BONUS,
  clearBonus,
  COLUMN_CARDS,
  COMBO_STREAK,
  createPatience,
  DEAL_SHOW_MS,
  isCleared,
  isNeighbour,
  isStuck,
  layDeal,
  MOVE_MS,
  PATIENCE_COLUMNS,
  PATIENCE_DEALS,
  PATIENCE_MAX_DEAL_SCORE,
  PATIENCE_MAX_SCORE,
  PatienceState,
  playableColumns,
  reducePatience,
  STOCK_CARD_BONUS,
  STOCK_CARDS,
  STREAK_STEP_POINTS,
} from '../game/patience/engine';
import { freshDeck, PlayingCard, SUITS } from '../game/twentyone/engine';

const tapColumn = (state: PatienceState, column: number) => reducePatience(state, { type: 'tapColumn', column });
const draw = (state: PatienceState) => reducePatience(state, { type: 'draw' });
const wild = (state: PatienceState) => reducePatience(state, { type: 'wild' });
const tick = (state: PatienceState, dt = 50) => reducePatience(state, { type: 'tick', dt });

/** Ticks frame by frame (50 ms) until inputs are taken again (or the round is over). */
function settle(state: PatienceState): PatienceState {
  let s = state;
  for (let i = 0; i < 100 && s.status === 'playing' && !acceptsInput(s); i++) s = tick(s);
  return s;
}

const card = (rank: number, i = 0): PlayingCard => ({ rank, suit: SUITS[i % 4] });
const cards = (ranks: readonly number[]) => ranks.map((rank) => card(rank));

/** A table set by hand: columns as ranks from top to bottom (the last one is the bottom card), pile and stock ranks. */
function table(columns: readonly (readonly number[])[], pile: number, stock: readonly number[] = [], upgrades: Record<string, number> = {}): PatienceState {
  const all = Array.from({ length: PATIENCE_COLUMNS }, (_, c) => cards(columns[c] ?? []));
  return { ...createPatience(1, upgrades), columns: all, pile: card(pile), stock: cards(stock) };
}

/** A deal that is cleared in one streak of 20 cards by tapping column 0 four times, then column 1...: 1 500 points. */
function perfectDeal(): PatienceState {
  // Pile: an ace; cards to play in order: 2..13, then 1..8.
  const order = Array.from({ length: PATIENCE_COLUMNS * COLUMN_CARDS }, (_, i) => ((i + 1) % 13) + 1);
  const columns = Array.from({ length: PATIENCE_COLUMNS }, (_, c) => order.slice(c * COLUMN_CARDS, (c + 1) * COLUMN_CARDS).reverse());
  return table(columns, 1, Array.from({ length: STOCK_CARDS }, () => 5));
}

/** Plays the perfect deal to its end (the last move is not settled). */
function clearPerfect(state: PatienceState): PatienceState {
  let s = state;
  for (let c = 0; c < PATIENCE_COLUMNS; c++) for (let i = 0; i < COLUMN_CARDS; i++) s = tapColumn(settle(s), c);
  return s;
}

/** Ends the current deal without scoring: empties the stock on a table that has no neighbour. */
function stuckDeal(state: PatienceState): PatienceState {
  const blocked: PatienceState = { ...state, columns: [cards([9]), [], [], [], []], pile: card(2), stock: cards([4]) };
  return draw(blocked);
}

describe('Réussite Express engine (AC-101)', () => {
  it('AC-101: a deal has 5 columns of 4 cards, a pile card and 15 stock cards, all different, from a seeded shuffle', () => {
    expect([PATIENCE_COLUMNS, COLUMN_CARDS, STOCK_CARDS, PATIENCE_DEALS]).toEqual([5, 4, 15, 2]);
    for (let seed = 1; seed <= 200; seed++) {
      const state = createPatience(seed * 7919);
      expect(state.deal).toBe(1);
      expect(state.columns).toHaveLength(5);
      for (const column of state.columns) expect(column).toHaveLength(4);
      expect(state.stock).toHaveLength(15);
      const dealt = [...state.columns.flat(), state.pile, ...state.stock];
      expect(new Set(dealt.map((c) => `${c.rank}-${c.suit}`)).size).toBe(36);
      for (const c of dealt) expect(c.rank >= 1 && c.rank <= 13 && SUITS.includes(c.suit)).toBe(true);
      expect(state).toMatchObject({ score: 0, combos: 0, streak: 0, status: 'playing', wildsLeft: 0, wildArmed: false, outcome: null });
      expect(acceptsInput(state)).toBe(true);
    }
    expect(createPatience(42)).toEqual(createPatience(42));
    expect(createPatience(42).columns).not.toEqual(createPatience(43).columns);

    // A stacked deck: cards 0-19 fill the columns from left to right, card 20 is the pile, cards 21-35 the stock.
    const deck = freshDeck();
    const laid = layDeal({ score: 0, combos: 0, wildsLeft: 0, rngState: 1 }, 1, deck);
    expect(laid.columns[0]).toEqual(deck.slice(0, 4));
    expect(laid.columns[4]).toEqual(deck.slice(16, 20));
    expect(bottomCard(laid, 0)).toEqual(deck[3]);
    expect(laid.pile).toEqual(deck[20]);
    expect(laid.stock).toEqual(deck.slice(21, 36));
  });

  it('AC-101: only a bottom card one rank above or below the pile is played; ace and king are neighbours; suits do not matter', () => {
    expect(isNeighbour(7, 8)).toBe(true);
    expect(isNeighbour(8, 7)).toBe(true);
    expect(isNeighbour(1, 13)).toBe(true);
    expect(isNeighbour(13, 1)).toBe(true);
    expect(isNeighbour(1, 2)).toBe(true);
    expect(isNeighbour(13, 12)).toBe(true);
    expect(isNeighbour(7, 7)).toBe(false);
    expect(isNeighbour(7, 9)).toBe(false);
    expect(isNeighbour(1, 12)).toBe(false);
    expect(isNeighbour(2, 13)).toBe(false);

    // Pile 7. Bottom cards: 8 (above), 6 (below), 7 (same), 9 (two apart), and a column whose 8 is covered by a 3.
    const start = table([[2, 8], [2, 6], [2, 7], [2, 9], [8, 3]], 7, [11, 11]);
    expect(playableColumns(start)).toEqual([0, 1]);

    const above = tapColumn(start, 0);
    expect(above.pile.rank).toBe(8);
    expect(above.columns[0]).toEqual(cards([2]));
    expect(above.events[0]).toMatchObject({ kind: 'play', column: 0, card: { rank: 8 }, wild: false });
    expect(above.lastMove).toEqual({ from: 'column', column: 0 });
    expect(tapColumn(start, 1).pile.rank).toBe(6);

    for (const column of [2, 3, 4]) {
      const refused = tapColumn(start, column);
      expect(refused.events).toEqual([{ kind: 'refused', column }]);
      expect({ ...refused, events: [] }).toEqual({ ...start, events: [] });
    }
    // The covered 8 of column 4 is not played; an empty column and a column that does not exist change nothing.
    expect(tapColumn(start, 4).columns[4]).toHaveLength(2);
    for (const column of [5, -1, 1.5, Number.NaN]) expect(tapColumn(start, column)).toBe(start);
    const empty = table([[], [6]], 7, [11]);
    expect(tapColumn(empty, 0)).toBe(empty);

    // Ace on king and king on ace; a different suit is still a neighbour.
    expect(tapColumn(table([[5, 1], [9]], 13, [11]), 0).pile.rank).toBe(1);
    expect(tapColumn(table([[5, 13], [9]], 1, [11]), 0).pile.rank).toBe(13);
    const suited: PatienceState = { ...start, columns: [[{ rank: 8, suit: 'spades' }], cards([2])], pile: { rank: 7, suit: 'hearts' } };
    expect(tapColumn(suited, 0).pile).toEqual({ rank: 8, suit: 'spades' });
  });

  it('AC-101: the stock gives its next card to the pile and resets the streak; an empty stock gives nothing', () => {
    let state = table([[2, 9, 8], [3]], 7, [11, 4, 12]);
    state = settle(tapColumn(state, 0));
    state = settle(tapColumn(state, 0));
    expect(state.streak).toBe(2);
    state = draw(state);
    expect(state.pile.rank).toBe(11);
    expect(state.stock).toEqual(cards([4, 12]));
    expect(state.streak).toBe(0);
    expect(state.score).toBe(25);
    expect(state.events).toEqual([{ kind: 'draw', card: card(11) }]);
    expect(state.lastMove).toEqual({ from: 'stock' });
    expect(state.busyMs).toBe(MOVE_MS);
    // The column cards are untouched by a draw.
    expect(state.columns[0]).toEqual(cards([2]));

    const dry = table([[8]], 7, []);
    expect(draw(dry)).toBe(dry);
  });

  it('AC-101: a column card scores 10 + 5 × (streak − 1); a draw starts the streak again; a streak reaching 5 is a combo', () => {
    expect([CARD_POINTS, STREAK_STEP_POINTS, COMBO_STREAK]).toEqual([10, 5, 5]);
    expect([1, 2, 3, 4, 5, 20].map(cardPoints)).toEqual([10, 15, 20, 25, 30, 105]);

    // Pile 1; column 0 holds 2, 3, 4, 5, 6, 7 from bottom to top; column 1 keeps the board uncleared.
    let state = table([[7, 6, 5, 4, 3, 2], [12, 11]], 1, [10, 9]);
    const gained: number[] = [];
    for (let i = 1; i <= 6; i++) {
      const before = state.score;
      state = tapColumn(state, 0);
      gained.push(state.score - before);
      expect(state.streak).toBe(i);
      expect(state.events).toContainEqual({ kind: 'score', points: cardPoints(i) });
      expect(state.events.some((e) => e.kind === 'combo')).toBe(i === 5);
      state = settle(state);
    }
    expect(gained).toEqual([10, 15, 20, 25, 30, 35]);
    expect(state.score).toBe(135);
    expect(state.combos).toBe(1);

    // Draw (10 on the pile), then the jack of column 1: the streak starts again at 10 points.
    state = settle(draw(state));
    expect(state.streak).toBe(0);
    state = tapColumn(state, 1);
    expect(state.streak).toBe(1);
    expect(state.score).toBe(145);
    // A refused tap does not break the streak.
    state = settle(state);
    expect(tapColumn(state, 0).streak).toBe(1);
  });

  it('AC-101: a cleared board gives +200 and +10 per card left in the stock, and ends the deal', () => {
    expect([CLEAR_BONUS, STOCK_CARD_BONUS]).toEqual([200, 10]);
    expect(clearBonus(0)).toBe(200);
    expect(clearBonus(15)).toBe(350);

    let state = table([[9, 8], []], 7, [3, 3, 3]);
    state = settle(tapColumn(state, 0));
    expect(state.outcome).toBeNull();
    state = tapColumn(state, 0);
    expect(isCleared(state)).toBe(true);
    expect(state.outcome).toBe('cleared');
    expect(state.events).toEqual([
      { kind: 'play', column: 0, card: card(9), streak: 2, points: 15, wild: false },
      { kind: 'score', points: 15 },
      { kind: 'cleared', deal: 1, bonus: 230 },
      { kind: 'score', points: 230 },
    ]);
    expect(state.score).toBe(10 + 15 + 230);
    expect(state.doneMs).toBe(DEAL_SHOW_MS);

    // The best deal: 20 cards in one streak, no card drawn: 1 150 + 350; the best round is twice that.
    const perfect = clearPerfect(perfectDeal());
    expect(perfect.outcome).toBe('cleared');
    expect(perfect.streak).toBe(20);
    expect(perfect.score).toBe(1500);
    expect(perfect.combos).toBe(1);
    expect(PATIENCE_MAX_DEAL_SCORE).toBe(1500);
    expect(PATIENCE_MAX_SCORE).toBe(3000);
  });

  it('AC-101: a deal ends when the stock is empty and no column card can be played, not before', () => {
    // Cards left in the stock: never stuck, even without any neighbour.
    const waiting = table([[9], [4]], 7, [2]);
    expect(isStuck(waiting)).toBe(false);
    expect(playableColumns(waiting)).toEqual([]);

    // The last stock card brings no neighbour: stuck at once, no points.
    const stuck = draw(waiting);
    expect(stuck.stock).toHaveLength(0);
    expect(stuck.outcome).toBe('stuck');
    expect(stuck.events).toEqual([{ kind: 'draw', card: card(2) }, { kind: 'stuck', deal: 1 }]);
    expect(stuck.doneMs).toBe(DEAL_SHOW_MS);
    expect(stuck.score).toBe(0);

    // The last stock card brings a neighbour: the deal goes on until that card is played and nothing follows.
    let state = draw(table([[9], [4]], 7, [5]));
    expect(state.outcome).toBeNull();
    expect(isStuck(state)).toBe(false);
    state = settle(state);
    expect(draw(state)).toEqual({ ...state, events: [] });
    state = tapColumn(state, 1);
    expect(state.pile.rank).toBe(4);
    expect(state.outcome).toBe('stuck');
    expect(state.score).toBe(10);
  });

  it('AC-101: a round is 2 deals: the second deal is a fresh shuffle, the round ends after it', () => {
    let state = createPatience(77);
    const first = state.columns;
    state = stuckDeal(state);
    expect(state.outcome).toBe('stuck');
    state = settle(state);
    expect(state.deal).toBe(2);
    expect(state.events).toEqual([{ kind: 'deal', deal: 2 }]);
    expect(state.columns).not.toEqual(first);
    expect(state.columns.every((c) => c.length === 4)).toBe(true);
    expect(state.stock).toHaveLength(15);
    expect(state).toMatchObject({ streak: 0, outcome: null, lastMove: null });

    state = settle(stuckDeal(state));
    expect(state.status).toBe('over');
    expect(state.events).toEqual([{ kind: 'over', score: 0 }]);
    for (const next of [tapColumn(state, 0), draw(state), wild(state), tick(state)]) {
      expect(next.status).toBe('over');
      expect(next.events).toEqual([]);
      expect(next.score).toBe(0);
    }

    // Two perfect deals: the score and the streak of the first deal are kept and reset as they should.
    let full = clearPerfect(perfectDeal());
    full = settle(full);
    expect(full).toMatchObject({ deal: 2, score: 1500, streak: 0 });
    full = settle(clearPerfect({ ...perfectDeal(), deal: 2, score: full.score, combos: full.combos }));
    expect(full.status).toBe('over');
    expect(full.score).toBe(PATIENCE_MAX_SCORE);
    expect(full.combos).toBe(2);
  });

  it('AC-101: « Joker » gives 1 / 2 / 3 free cards per round: armed, the next column tap plays its bottom card whatever its rank', () => {
    expect(createPatience(1).wildsLeft).toBe(0);
    for (const level of [1, 2, 3]) expect(createPatience(1, { wild: level }).wildsLeft).toBe(level);
    // Without a joker the button does nothing.
    const none = table([[9]], 7, [2]);
    expect(wild(none)).toBe(none);
    expect(wild(none).wildArmed).toBe(false);

    // Arm, disarm, arm again: nothing is spent.
    let state = table([[2, 9], [2, 8], [12]], 7, [3], { wild: 2 });
    state = wild(state);
    expect(state.wildArmed).toBe(true);
    expect(state.events).toEqual([{ kind: 'wild', armed: true }]);
    state = wild(state);
    expect(state.wildArmed).toBe(false);
    expect(state.events).toEqual([{ kind: 'wild', armed: false }]);
    expect(state.wildsLeft).toBe(2);
    expect(tapColumn(state, 0).events).toEqual([{ kind: 'refused', column: 0 }]);

    // Armed: the 9 goes onto the 7; one joker is spent, the card counts in the streak and scores.
    state = tapColumn(wild(state), 0);
    expect(state.pile.rank).toBe(9);
    expect(state.events[0]).toMatchObject({ kind: 'play', column: 0, wild: true, points: 10 });
    expect(state).toMatchObject({ wildsLeft: 1, wildArmed: false, streak: 1, score: 10 });
    state = settle(state);
    // Not armed any more: an unplayable card is refused again.
    expect(tapColumn(state, 2).events).toEqual([{ kind: 'refused', column: 2 }]);

    // Armed on a neighbour (the 8 on the 9): played as usual, the joker is kept and disarmed.
    state = tapColumn(wild(state), 1);
    expect(state.events[0]).toMatchObject({ kind: 'play', column: 1, wild: false, points: 15 });
    expect(state).toMatchObject({ wildsLeft: 1, wildArmed: false, streak: 2 });

    // A draw keeps the joker armed.
    state = draw(wild(settle(state)));
    expect(state.wildArmed).toBe(true);
    expect(state.wildsLeft).toBe(1);

    // The stock is empty and nothing follows the 3, but a joker is left: the deal goes on until it is spent.
    expect(state.stock).toHaveLength(0);
    expect(playableColumns(state)).toEqual([0, 1]);
    const blocked: PatienceState = { ...settle(state), columns: [cards([9]), cards([6])], wildArmed: false };
    expect(isStuck(blocked)).toBe(false);
    const spent = tapColumn(wild(blocked), 0);
    expect(spent.wildsLeft).toBe(0);
    expect(spent.outcome).toBe('stuck');
    // The last joker on the last card clears the board.
    const last = tapColumn(wild({ ...blocked, columns: [cards([9])] }), 0);
    expect(last.outcome).toBe('cleared');
    expect(last.events).toContainEqual({ kind: 'cleared', deal: 1, bonus: 200 });
  });
});

describe('Réussite Express guard and casual bot (AC-108)', () => {
  it('AC-108: a card moves in 150 ms: a tap, a draw or the joker inside the guard changes nothing', () => {
    expect(MOVE_MS).toBe(150);
    let state = tapColumn(table([[2, 9, 8], [6]], 7, [3, 3], { wild: 1 }), 0);
    expect(state.busyMs).toBe(MOVE_MS);
    const moved = state;
    for (const input of [() => tapColumn(state, 0), () => tapColumn(state, 1), () => draw(state), () => wild(state)]) {
      const next = input();
      expect(next.events).toEqual([{ kind: 'ignored' }]);
      expect({ ...next, events: moved.events }).toEqual(moved);
      state = next;
    }
    for (let t = 50; t < MOVE_MS; t += 50) {
      state = tick(state);
      expect(tapColumn(state, 0).events).toEqual([{ kind: 'ignored' }]);
      expect(tapColumn(state, 0).pile.rank).toBe(8);
    }
    state = tick(state);
    expect(state.busyMs).toBe(0);
    expect(acceptsInput(state)).toBe(true);
    expect(tapColumn(state, 0).pile.rank).toBe(9);
    // Time does nothing to a table at rest, and a tick without time does nothing at all.
    expect(tick(state)).toBe(state);
    expect(tick(tapColumn(state, 0), 0).busyMs).toBe(MOVE_MS);
  });

  it('AC-108: a finished deal stays shown 900 ms (inputs ignored), then the next deal comes', () => {
    expect(DEAL_SHOW_MS).toBe(900);
    let state = clearPerfect(perfectDeal());
    const score = state.score;
    expect(state.doneMs).toBe(DEAL_SHOW_MS);
    for (let t = 50; t < DEAL_SHOW_MS; t += 50) {
      state = tick(state);
      expect(state.deal).toBe(1);
      expect(isCleared(state)).toBe(true);
      for (const next of [tapColumn(state, 0), draw(state), wild(state)]) {
        expect(next.events).toEqual([{ kind: 'ignored' }]);
        expect(next.stock).toBe(state.stock);
        expect(next.score).toBe(score);
      }
    }
    state = tick(state);
    expect(state.deal).toBe(2);
    expect(state.score).toBe(score);
    expect(acceptsInput(state)).toBe(true);
  });

  it('AC-108: the casual bot (leftmost playable column, else draw, 20 % careless draws) finishes every seed with a median between 1 and 3 stars over 50 seeds', () => {
    expect(BOT_DRAW_CHANCE).toBe(0.2);
    const [one, , three] = gameById('patience').stars;
    let cleared = 0;
    const scores = Array.from({ length: 50 }, (_, i) => {
      const end = playPatienceBot(i + 1, undefined, (step) => {
        if (step.events.some((e) => e.kind === 'cleared')) cleared += 1;
      });
      expect(end.status).toBe('over');
      expect(end.deal).toBe(PATIENCE_DEALS);
      expect(end.score).toBeLessThanOrEqual(PATIENCE_MAX_SCORE);
      // Same seed, same round.
      if (i < 5) expect(playPatienceBot(i + 1).score).toBe(end.score);
      return end.score;
    }).sort((a, b) => a - b);
    const median = (scores[24] + scores[25]) / 2;
    // BOT_STATS=1 prints the measured distribution (for the PRD balance table).
    if (process.env.BOT_STATS) {
      console.log(
        `patience bot: min ${scores[0]}, p25 ${scores[12]}, median ${median}, p90 ${scores[44]}, max ${scores[49]}, boards cleared ${cleared} / 100 (stars ${gameById('patience').stars.join(' / ')})`,
      );
    }
    expect(median).toBeGreaterThanOrEqual(one);
    expect(median).toBeLessThan(three);
  });
});
