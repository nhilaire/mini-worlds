import { CARD_BACK, FIGURE_SPRITES, SUIT_SPRITES } from '../art/games/twentyone';
import { ICON } from '../art/icons/twentyone';
import { validateSprite } from '../art/sprites';
import {
  BASE_HANDS,
  cardValue,
  createTwentyOne,
  dealerPlay,
  dealHand,
  freshDeck,
  handTotal,
  isBlackjack,
  reduceTwentyOne,
  type PlayingCard,
  type Suit,
  type TwentyOneAction,
  type TwentyOneState,
} from '../game/twentyone/engine';

// Cards written as rank numbers (1 = ace, 11-13 = figures); the suit does not matter for the rules.
const c = (rank: number, suit: Suit = 'spades'): PlayingCard => ({ rank, suit });
const cards = (...ranks: number[]) => ranks.map((r) => c(r));
/** Deck order: player, dealer up, player, dealer hole, then hits and dealer draws. */
const stacked = (player: [number, number], dealer: [number, number], ...rest: number[]) => cards(player[0], dealer[0], player[1], dealer[1], ...rest);
const HIT: TwentyOneAction = { type: 'hit' };
const STAND: TwentyOneAction = { type: 'stand' };
const NEXT: TwentyOneAction = { type: 'next' };
/** A round state with nothing scored yet (the seeded first hand is replaced by the stacked deck). */
const base = (upgrades = {}): TwentyOneState => ({ ...createTwentyOne(1, upgrades), score: 0, combos: 0, winStreak: 0, events: [] });
const deal = (deck: PlayingCard[], state: TwentyOneState = base(), hand = 1) => dealHand(state, hand, deck);
const settled = (s: TwentyOneState) => s.events.find((e) => e.kind === 'settle');

describe('Vingt-et-Un engine (AC-65)', () => {
  it('AC-65: 2-10 count their value, figures 10, the ace 1 or 11 (best total without going over)', () => {
    expect([1, 2, 9, 10, 11, 12, 13].map((r) => cardValue(c(r)))).toEqual([1, 2, 9, 10, 10, 10, 10]);
    expect(handTotal(cards(1, 6))).toBe(17);
    expect(handTotal(cards(1, 6, 10))).toBe(17);
    expect(handTotal(cards(1, 1))).toBe(12);
    expect(handTotal(cards(1, 1, 9))).toBe(21);
    expect(handTotal(cards(13, 12, 2))).toBe(22);
    expect(isBlackjack(cards(1, 13))).toBe(true);
    expect(isBlackjack(cards(7, 7, 7))).toBe(false);
  });

  it('AC-65: a 52-card deck, shuffled for each hand with the seed', () => {
    const deck = freshDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((k) => `${k.rank}${k.suit}`)).size).toBe(52);
    const a = createTwentyOne(5);
    expect(createTwentyOne(5)).toEqual(a);
    expect(a.player.length + a.dealer.length + a.deck.length).toBe(52);
    // Hands of a round differ (fresh shuffle each time), and are the same for the same seed.
    const play = (seed: number) => [STAND, NEXT, STAND, NEXT].reduce(reduceTwentyOne, createTwentyOne(seed));
    expect(play(5).player).toEqual(play(5).player);
    expect(play(5).deck).not.toEqual(createTwentyOne(5).deck);
  });

  it('AC-65: the dealer shows one card and hides the other until « Rester »', () => {
    const s = deal(stacked([10, 5], [9, 7]));
    expect(s.player).toEqual(cards(10, 5));
    expect(s.dealer).toEqual(cards(9, 7));
    expect(s.holeHidden).toBe(true);
    expect(s.outcome).toBeNull();
    const after = reduceTwentyOne(s, STAND);
    expect(after.holeHidden).toBe(false);
  });

  it('AC-65: « Tirer » adds a card; over 21 the hand is lost at once (0 points, the dealer does not play)', () => {
    let s = deal(stacked([10, 5], [9, 7], 4, 8, 3));
    s = reduceTwentyOne(s, HIT);
    expect(s.player).toEqual(cards(10, 5, 4));
    expect(s.outcome).toBeNull();
    s = reduceTwentyOne(s, HIT);
    expect(s.outcome).toBe('bust');
    expect(s.score).toBe(0);
    expect(s.dealer).toHaveLength(2);
    expect(settled(s)).toEqual({ kind: 'settle', outcome: 'bust', points: 0 });
    // A finished hand ignores more hits and stands.
    expect(reduceTwentyOne(s, HIT).events).toEqual([]);
    expect(reduceTwentyOne(s, STAND).events).toEqual([]);
  });

  it('AC-65: on « Rester » the dealer draws until 17 or more and stands on a soft 17', () => {
    expect(dealerPlay(cards(10, 6), cards(2, 5, 9)).dealer).toEqual(cards(10, 6, 2));
    expect(dealerPlay(cards(1, 6), cards(5)).dealer).toEqual(cards(1, 6)); // soft 17: stands
    expect(dealerPlay(cards(2, 3), cards(1, 1, 10)).dealer).toEqual(cards(2, 3, 1, 1)); // soft 16 draws, soft 17 stands
    const s = reduceTwentyOne(deal(stacked([10, 8], [1, 6], 5)), STAND);
    expect(s.dealer).toEqual(cards(1, 6));
    expect(s.outcome).toBe('win'); // 18 > 17
  });

  it('AC-65: a dealer over 21 is a won hand (100)', () => {
    const s = reduceTwentyOne(deal(stacked([10, 2], [10, 6], 9)), STAND);
    expect(handTotal(s.dealer)).toBe(25);
    expect(s.outcome).toBe('win');
    expect(s.score).toBe(100);
  });

  it('AC-65: otherwise the higher total wins (100 / 0) and equal totals tie (25)', () => {
    expect(reduceTwentyOne(deal(stacked([10, 9], [10, 8])), STAND)).toMatchObject({ outcome: 'win', score: 100 });
    expect(reduceTwentyOne(deal(stacked([10, 7], [10, 8])), STAND)).toMatchObject({ outcome: 'lose', score: 0 });
    expect(reduceTwentyOne(deal(stacked([10, 8], [10, 8])), STAND)).toMatchObject({ outcome: 'push', score: 25 });
  });

  it('AC-65: 21 with the first two cards scores 150 at once, 25 when the dealer also has it', () => {
    const bj = deal(stacked([1, 13], [10, 9]));
    expect(bj.outcome).toBe('blackjack');
    expect(bj.score).toBe(150);
    expect(bj.holeHidden).toBe(false);
    const both = deal(stacked([1, 12], [1, 11]));
    expect(both.outcome).toBe('blackjack_push');
    expect(both.score).toBe(25);
  });

  it('AC-65: a dealer 21 with its first two cards is only checked on « Rester »', () => {
    let s = deal(stacked([10, 2], [1, 13], 5, 4));
    expect(s.outcome).toBeNull();
    s = reduceTwentyOne(s, HIT);
    expect(s.outcome).toBeNull();
    s = reduceTwentyOne(s, STAND);
    expect(s.outcome).toBe('lose'); // 17 against 21
    // A player 21 made of three cards ties with it (equal totals).
    expect([HIT, STAND].reduce(reduceTwentyOne, deal(stacked([10, 2], [1, 13], 9)))).toMatchObject({ outcome: 'push', score: 25 });
  });

  it('AC-65: the round has 10 hands, +1 per « Main en plus » level, and ends after the last one', () => {
    expect(base().hands).toBe(BASE_HANDS);
    expect([1, 2, 3].map((level) => base({ extra_hand: level }).hands)).toEqual([11, 12, 13]);
    for (const extra of [0, 3]) {
      let s = createTwentyOne(17, { extra_hand: extra });
      let played = 1;
      while (s.status === 'playing') {
        if (s.outcome === null) s = reduceTwentyOne(s, STAND);
        else {
          expect(reduceTwentyOne(s, HIT).events).toEqual([]); // a settled hand only accepts « Main suivante »
          s = reduceTwentyOne(s, NEXT);
          played += 1;
          expect(s.hand).toBe(played);
          expect(s.player).toHaveLength(2);
        }
      }
      expect(played).toBe(BASE_HANDS + extra);
      expect(s.hand).toBe(BASE_HANDS + extra);
      expect(s.events).toContainEqual({ kind: 'over', score: s.score });
      expect(reduceTwentyOne(s, NEXT).hand).toBe(s.hand);
    }
  });

  it('AC-65: « Main suivante » is refused while the hand is being played', () => {
    const s = deal(stacked([10, 5], [9, 7]));
    const after = reduceTwentyOne(s, NEXT);
    expect(after.events).toEqual([]);
    expect(after).toEqual({ ...s, events: [] });
  });

  it('AC-65: a combo is emitted on every 3rd hand won in a row, exactly; a tie or a loss breaks the run', () => {
    const win = stacked([10, 9], [10, 8]);
    const lose = stacked([10, 7], [10, 8]);
    const push = stacked([10, 8], [10, 8]);
    const play = (decks: PlayingCard[][]) => {
      let s = base({ extra_hand: 3 });
      const combos: number[] = [];
      decks.forEach((deck, i) => {
        s = dealHand(s, i + 1, deck);
        if (s.outcome === null) s = reduceTwentyOne(s, STAND);
        combos.push(s.events.filter((e) => e.kind === 'combo').length);
      });
      return { combos, total: s.combos };
    };
    expect(play([win, win, win, win, win, win])).toEqual({ combos: [0, 0, 1, 0, 0, 1], total: 2 });
    expect(play([win, win, lose, win, win, push, win, win, win])).toEqual({ combos: [0, 0, 0, 0, 0, 0, 0, 0, 1], total: 1 });
    // A blackjack is a won hand.
    expect(play([win, stacked([1, 13], [10, 9]), win])).toEqual({ combos: [0, 0, 1], total: 1 });
  });
});

describe('Vingt-et-Un sprites', () => {
  it('suits, figures, card back and icon are valid sprites of the expected size', () => {
    for (const sprite of [...Object.values(SUIT_SPRITES), ...Object.values(FIGURE_SPRITES), CARD_BACK]) {
      expect(validateSprite(sprite)).toEqual([]);
      expect(sprite.rows).toHaveLength(7);
    }
    expect(validateSprite(ICON)).toEqual([]);
    expect(ICON.rows).toHaveLength(12);
    expect(ICON.rows[0]).toHaveLength(12);
  });

  it('the four suits have four different shapes', () => {
    const shapes = Object.values(SUIT_SPRITES).map((s) => s.rows.map((r) => r.replace(/[^.]/g, '#')).join('/'));
    expect(new Set(shapes).size).toBe(4);
  });
});
