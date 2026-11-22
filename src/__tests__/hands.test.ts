import { ICON } from '../art/icons/hands';
import { validateSprite } from '../art/sprites';
import { gameById } from '../game/core/content';
import { BOT_POOR_CHANCE, botKeeps, playHandsBot } from '../game/hands/bot';
import {
  acceptsInput,
  canRedraw,
  COMBINATION_POINTS,
  COMBO_MIN_POINTS,
  createHands,
  dealHand,
  evaluateHand,
  EXCHANGE_MS,
  HAND_SIZE,
  HANDS_PER_ROUND,
  MAX_SCORE,
  reduceHands,
  RESULT_MS,
  type Combination,
  type HandsAction,
  type HandsState,
} from '../game/hands/engine';
import { createRng } from '../game/rng';
import type { PlayingCard, Suit } from '../game/twentyone/engine';

// Cards written as rank numbers (1 = ace, 11-13 = figures) and a suit letter: h, d, c, s.
const SUIT_OF: Record<string, Suit> = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' };
const c = (rank: number, suit = 's'): PlayingCard => ({ rank, suit: SUIT_OF[suit] });
/** '10h 11h 12h 13h 1h' → five cards. */
const hand = (text: string) => text.split(' ').map((word) => c(Number(word.slice(0, -1)), word.slice(-1)));
const id = (card: PlayingCard) => `${card.rank}${card.suit}`;

const toggle = (index: number): HandsAction => ({ type: 'toggle', index });
const SWAP: HandsAction = { type: 'swap' };
const KEEP: HandsAction = { type: 'keep' };
const REDRAW: HandsAction = { type: 'redraw' };
const tick = (state: HandsState, dt = 50) => reduceHands(state, { type: 'tick', dt });
/** 50 ms ticks until taps are taken again (or the round is over). */
function settle(state: HandsState): HandsState {
  let s = state;
  for (let i = 0; i < 1000 && s.status === 'playing' && !acceptsInput(s); i++) s = tick(s);
  return s;
}
const play = (state: HandsState, ...actions: HandsAction[]) => actions.reduce(reduceHands, state);
/** A round state with nothing scored yet (the seeded first hand is replaced by the stacked deck). */
const base = (upgrades = {}): HandsState => ({ ...createHands(1, upgrades), events: [] });
/** Deals a stacked deck: its first five cards are the hand, the next ones replace exchanged cards in order. */
const deal = (text: string, state: HandsState = base(), n = 1) => dealHand(state, n, hand(text));
const withoutEvents = (state: HandsState) => ({ ...state, events: [] });

describe('Mains de Cartes engine (AC-100)', () => {
  it('AC-100: each hand deals 5 cards of a fresh 52-card shuffle made with the seed', () => {
    const a = createHands(5);
    expect(createHands(5)).toEqual(a);
    expect(a.cards).toHaveLength(HAND_SIZE);
    expect(a.kept).toEqual([false, false, false, false, false]);
    expect(a.events).toEqual([{ kind: 'deal', hand: 1 }]);
    expect(new Set([...a.cards, ...a.deck].map(id)).size).toBe(52);
    expect(createHands(6).cards).not.toEqual(a.cards);
    // The second hand comes from another full shuffle, the same for the same seed.
    const second = (seed: number) => settle(play(createHands(seed), KEEP));
    const b = second(5);
    expect(b.hand).toBe(2);
    expect(new Set([...b.cards, ...b.deck].map(id)).size).toBe(52);
    expect(b.cards).not.toEqual(a.cards);
    expect(second(5).cards).toEqual(b.cards);
  });

  it('AC-100: a tap keeps a card, a second tap releases it', () => {
    let s = createHands(3);
    s = reduceHands(s, toggle(2));
    expect(s.kept).toEqual([false, false, true, false, false]);
    expect(s.events).toEqual([{ kind: 'toggle', index: 2, kept: true }]);
    s = reduceHands(s, toggle(2));
    expect(s.kept).toEqual([false, false, false, false, false]);
    expect(s.events).toEqual([{ kind: 'toggle', index: 2, kept: false }]);
    for (const index of [-1, 5, 1.5]) expect(reduceHands(s, toggle(index))).toEqual(withoutEvents(s));
  });

  it('AC-100: « Échanger » replaces the cards not kept with the next cards of the deck, then the hand scores', () => {
    // Keeps the pair of 9; the three others become 9, 4, 2: a brelan.
    let s = deal('9h 3c 9s 12d 7c 9d 4h 2s 13h');
    s = play(s, toggle(0), toggle(2), SWAP);
    expect(s.cards).toEqual(hand('9h 9d 9s 4h 2s'));
    expect(s.deck).toEqual(hand('13h'));
    expect(s.events).toEqual([{ kind: 'exchange', replaced: [1, 3, 4], second: false }]);
    expect(s.replaced).toEqual([1, 3, 4]);
    expect(s.phase).toBe('exchange');
    // Scored when the 300 ms animation ends, not before.
    expect(s.score).toBe(0);
    s = tick(s, EXCHANGE_MS - 1);
    expect(s.result).toBeNull();
    s = tick(s, 1);
    expect(s.events).toEqual([{ kind: 'settle', combination: 'three', points: 70 }, { kind: 'score', points: 70 }, { kind: 'combo' }]);
    expect(s).toMatchObject({ phase: 'result', score: 70, combos: 1, result: { combination: 'three', points: 70 }, waitMs: RESULT_MS });
  });

  it('AC-100: with nothing kept the five cards are replaced; with everything kept « Échanger » is refused', () => {
    const s = deal('9h 3c 9s 12d 7c 2h 3h 4h 5h 6h 13s');
    const all = play(s, SWAP);
    expect(all.cards).toEqual(hand('2h 3h 4h 5h 6h'));
    expect(all.replaced).toEqual([0, 1, 2, 3, 4]);
    expect(tick(all, EXCHANGE_MS).score).toBe(500);
    const kept = play(s, toggle(0), toggle(1), toggle(2), toggle(3), toggle(4));
    expect(reduceHands(kept, SWAP)).toEqual(withoutEvents(kept));
  });

  it('AC-100: « Garder » scores the hand as it is, at once', () => {
    const s = play(deal('9h 3c 9s 12d 7c 9d 4h'), KEEP);
    expect(s.cards).toEqual(hand('9h 3c 9s 12d 7c'));
    expect(s.events).toEqual([{ kind: 'settle', combination: 'pair', points: 20 }, { kind: 'score', points: 20 }]);
    expect(s).toMatchObject({ phase: 'result', score: 20, combos: 0, exchanges: 0, waitMs: RESULT_MS });
    // A hand worth nothing scores 0 and emits no score event.
    const none = play(deal('9h 3c 2s 12d 7c'), KEEP);
    expect(none.events).toEqual([{ kind: 'settle', combination: 'nothing', points: 0 }]);
    expect(none.score).toBe(0);
  });

  it('AC-100: only one exchange per hand without « Seconde donne »', () => {
    let s = play(deal('9h 3c 9s 12d 7c 5d 4h 2s 13h 13d 13c'), toggle(0), toggle(2), SWAP);
    expect(s.redrawsLeft).toBe(0);
    // Inside the guard and once scored, nothing more is exchanged.
    for (const action of [SWAP, REDRAW]) expect(reduceHands(s, action).cards).toBe(s.cards);
    s = tick(s, EXCHANGE_MS);
    expect(s.phase).toBe('result');
    expect(s.exchanges).toBe(1);
    expect(canRedraw(s)).toBe(false);
    // « Seconde donne » is also refused before the first exchange, even when one is owned.
    const fresh = deal('9h 3c 9s 12d 7c 5d 4h', base({ redraw: 1 }));
    expect(reduceHands(fresh, REDRAW)).toEqual(withoutEvents(fresh));
  });

  it('AC-100: « Seconde donne » allows a second exchange on a hand, 1 / 2 / 3 times per round', () => {
    expect([0, 1, 2, 3].map((level) => base({ redraw: level }).redrawsLeft)).toEqual([0, 1, 2, 3]);
    let s = play(deal('9h 3c 9s 12d 7c 5d 4h 2s 9c 9d 6s', base({ redraw: 1 })), toggle(0), toggle(2), SWAP);
    s = tick(s, EXCHANGE_MS);
    // Not scored yet: the player decides again, the kept cards stay kept.
    expect(s).toMatchObject({ phase: 'choose', score: 0, result: null, exchanges: 1, redrawsLeft: 1 });
    expect(s.kept).toEqual([true, false, true, false, false]);
    expect(s.events).toEqual([]);
    expect(canRedraw(s)).toBe(true);
    expect(reduceHands(s, SWAP)).toEqual(s); // « Échanger » is used up
    s = reduceHands(s, REDRAW);
    expect(s.events).toEqual([{ kind: 'exchange', replaced: [1, 3, 4], second: true }]);
    expect(s.cards).toEqual(hand('9h 9c 9s 9d 6s'));
    expect(s).toMatchObject({ exchanges: 2, redrawsLeft: 0 });
    s = tick(s, EXCHANGE_MS);
    expect(s).toMatchObject({ phase: 'result', score: 260, result: { combination: 'four', points: 260 } });
    // The next hand has no second exchange left: it scores after its first exchange.
    s = settle(s);
    expect(s.hand).toBe(2);
    s = tick(play(s, SWAP), EXCHANGE_MS);
    expect(s.phase).toBe('result');
    expect(s.redrawsLeft).toBe(0);
  });

  it('AC-100: after the first exchange « Garder » scores the hand and keeps the second exchange for later', () => {
    let s = tick(play(deal('9h 3c 9s 12d 7c 5d 4h 2s', base({ redraw: 2 })), toggle(0), toggle(2), SWAP), EXCHANGE_MS);
    s = reduceHands(s, KEEP);
    expect(s).toMatchObject({ phase: 'result', score: 20, redrawsLeft: 2, exchanges: 1 });
  });

  it('AC-100: every combination is recognised and scored (20, 40, 70, 110, 130, 170, 260, 500, nothing 0)', () => {
    const cases: [string, Combination, number][] = [
      ['2h 9c 5s 12d 7c', 'nothing', 0],
      ['2h 9c 2s 12d 7c', 'pair', 20],
      ['2h 9c 2s 12d 9d', 'twoPairs', 40],
      ['2h 9c 2s 12d 2d', 'three', 70],
      ['6h 4c 5s 8d 7c', 'straight', 110],
      ['2h 9h 5h 12h 7h', 'flush', 130],
      ['2h 9c 2s 9d 2d', 'fullHouse', 170],
      ['2h 9c 2s 2c 2d', 'four', 260],
      ['6c 4c 5c 8c 7c', 'straightFlush', 500],
    ];
    for (const [text, combination, points] of cases) {
      expect(evaluateHand(hand(text))).toEqual({ combination, points });
      expect(COMBINATION_POINTS[combination]).toBe(points);
      // The order of the cards does not matter.
      expect(evaluateHand(hand(text).reverse()).combination).toBe(combination);
    }
    expect(Object.keys(COMBINATION_POINTS)).toHaveLength(9);
  });

  it('AC-100: a straight takes the ace low or high, never in the middle', () => {
    expect(evaluateHand(hand('1h 2c 3s 4d 5c'))).toEqual({ combination: 'straight', points: 110 });
    expect(evaluateHand(hand('10h 11c 12s 13d 1c'))).toEqual({ combination: 'straight', points: 110 });
    expect(evaluateHand(hand('1h 2h 3h 4h 5h')).combination).toBe('straightFlush');
    expect(evaluateHand(hand('10d 11d 12d 13d 1d'))).toEqual({ combination: 'straightFlush', points: 500 });
    expect(evaluateHand(hand('12h 13c 1s 2d 3c')).combination).toBe('nothing');
    expect(evaluateHand(hand('11h 12c 13s 1d 2c')).combination).toBe('nothing');
    // Four in a row or a pair inside the run is not a straight.
    expect(evaluateHand(hand('2h 3c 4s 5d 7c')).combination).toBe('nothing');
    expect(evaluateHand(hand('2h 3c 4s 5d 5c')).combination).toBe('pair');
    expect(evaluateHand(hand('9h 10c 11s 12d 13c')).combination).toBe('straight');
  });

  it('AC-100: the best combination wins (precedence)', () => {
    // A straight flush is neither a flush nor a straight; a full is neither a brelan nor a pair...
    expect(evaluateHand(hand('9s 10s 11s 12s 13s')).combination).toBe('straightFlush');
    expect(evaluateHand(hand('9s 10s 11s 12s 2s')).combination).toBe('flush');
    expect(evaluateHand(hand('7h 7c 7s 7d 2c')).combination).toBe('four');
    expect(evaluateHand(hand('7h 7c 7s 2d 2c')).combination).toBe('fullHouse');
    expect(evaluateHand(hand('7h 7c 7s 3d 2c')).combination).toBe('three');
    expect(evaluateHand(hand('7h 7c 3s 3d 2c')).combination).toBe('twoPairs');
    const order: Combination[] = ['nothing', 'pair', 'twoPairs', 'three', 'straight', 'flush', 'fullHouse', 'four', 'straightFlush'];
    const points = order.map((combination) => COMBINATION_POINTS[combination]);
    expect(points).toEqual([...points].sort((a, b) => a - b));
    expect(new Set(points).size).toBe(9);
  });

  it('AC-100: a combo is a hand worth a brelan or better', () => {
    expect(COMBO_MIN_POINTS).toBe(70);
    const combosOf = (text: string) => play(deal(text), KEEP);
    expect(combosOf('7h 7c 3s 3d 2c')).toMatchObject({ combos: 0 });
    expect(combosOf('7h 7c 3s 3d 2c').events).not.toContainEqual({ kind: 'combo' });
    for (const text of ['7h 7c 7s 3d 2c', '6h 4c 5s 8d 7c', '2h 9h 5h 12h 7h', '7h 7c 7s 2d 2c', '7h 7c 7s 7d 2c', '6c 4c 5c 8c 7c']) {
      expect(combosOf(text).combos).toBe(1);
      expect(combosOf(text).events).toContainEqual({ kind: 'combo' });
    }
  });

  it('AC-100: a round is 8 hands and ends after the result of the last one', () => {
    expect(HANDS_PER_ROUND).toBe(8);
    expect(MAX_SCORE).toBe(4000);
    for (const redraw of [0, 3]) {
      let s = createHands(17, { redraw });
      expect(s.hands).toBe(8);
      let total = 0;
      for (let n = 1; n <= HANDS_PER_ROUND; n++) {
        expect(s.hand).toBe(n);
        expect(s.status).toBe('playing');
        expect(new Set([...s.cards, ...s.deck].map(id)).size).toBe(52);
        s = reduceHands(s, KEEP);
        total += s.result?.points ?? 0;
        // The result stays 900 ms.
        s = tick(s, RESULT_MS - 1);
        expect(s.hand).toBe(n);
        expect(s.status).toBe('playing');
        s = tick(s, 1);
      }
      expect(s.status).toBe('over');
      expect(s.hand).toBe(HANDS_PER_ROUND);
      expect(s.score).toBe(total);
      expect(s.events).toEqual([{ kind: 'over', score: total }]);
      // A finished round takes nothing more.
      for (const action of [KEEP, SWAP, toggle(0), { type: 'tick', dt: 50 } as HandsAction]) expect(reduceHands(s, action)).toEqual(withoutEvents(s));
    }
  });
});

describe('Mains de Cartes guard and casual bot (AC-108)', () => {
  it('AC-108: an input during the 300 ms exchange or the 900 ms result changes nothing', () => {
    expect(EXCHANGE_MS).toBe(300);
    expect(RESULT_MS).toBe(900);
    const inputs = [toggle(0), toggle(3), SWAP, KEEP, REDRAW];
    for (const redraw of [0, 2]) {
      // During the exchange animation.
      let s = tick(play(createHands(8, { redraw }), toggle(1), SWAP), 100);
      expect(s.phase).toBe('exchange');
      expect(acceptsInput(s)).toBe(false);
      for (const input of inputs) {
        const after = reduceHands(s, input);
        expect(after.events).toEqual([{ kind: 'ignored' }]);
        expect(withoutEvents(after)).toEqual(s);
      }
      // During the result on show.
      s = tick(reduceHands(createHands(8, { redraw }), KEEP), 400);
      expect(s.phase).toBe('result');
      for (const input of inputs) {
        const after = reduceHands(s, input);
        expect(after.events).toEqual([{ kind: 'ignored' }]);
        expect(withoutEvents(after)).toEqual(s);
      }
    }
    // Time only passes through a positive tick, and not while the player chooses.
    const waiting = play(createHands(8), SWAP);
    for (const dt of [0, -50, Number.NaN]) expect(tick(waiting, dt).waitMs).toBe(EXCHANGE_MS);
    const choosing = withoutEvents(createHands(8));
    expect(tick(choosing, 5000)).toBe(choosing);
  });

  it('AC-108: the bot policy keeps a made hand, else pairs and brelans, else four cards of a suit, else its highest card', () => {
    expect(botKeeps(hand('6h 4c 5s 8d 7c'))).toEqual([true, true, true, true, true]);
    expect(botKeeps(hand('2h 9c 2s 9d 2d'))).toEqual([true, true, true, true, true]);
    expect(botKeeps(hand('2h 9c 2s 12d 7c'))).toEqual([true, false, true, false, false]);
    expect(botKeeps(hand('2h 9c 2s 12d 9d'))).toEqual([true, true, true, false, true]);
    expect(botKeeps(hand('2h 9c 2s 12d 2d'))).toEqual([true, false, true, false, true]);
    expect(botKeeps(hand('2h 9h 5s 12h 7h'))).toEqual([true, true, false, true, true]);
    expect(botKeeps(hand('2h 9c 5s 12d 7c'))).toEqual([false, false, false, true, false]);
    expect(botKeeps(hand('2h 13c 1s 12d 7c'))).toEqual([false, false, true, false, false]); // the ace is the highest
  });

  it('AC-108: the casual bot (25 % poor choices) finishes every seed and has a median between 1 and 3 stars over 50 seeds', () => {
    expect(BOT_POOR_CHANCE).toBe(0.25);
    const [one, , three] = gameById('hands').stars;
    const scores = Array.from({ length: 50 }, (_, i) => {
      const end = playHandsBot(i + 1);
      expect(end.status).toBe('over');
      expect(end.hand).toBe(HANDS_PER_ROUND);
      expect(end.score).toBeLessThanOrEqual(MAX_SCORE);
      return end.score;
    }).sort((a, b) => a - b);
    expect(playHandsBot(7).score).toBe(playHandsBot(7).score);
    const median = (scores[24] + scores[25]) / 2;
    // BOT_STATS=1 prints the measured distribution (for the PRD balance table) and a random player for comparison
    // (each card kept with one chance in two, then « Échanger », or « Garder » when it kept the five).
    if (process.env.BOT_STATS) {
      const random = Array.from({ length: 50 }, (_, i) => {
        const rng = createRng((i + 1) ^ 0x5bd1e995);
        let s = createHands(i + 1);
        while (s.status === 'playing') {
          if (!acceptsInput(s)) s = tick(s);
          else {
            for (let k = 0; k < HAND_SIZE; k++) if (rng.next() < 0.5) s = reduceHands(s, toggle(k));
            s = reduceHands(s, s.kept.every((k) => k) ? KEEP : SWAP);
          }
        }
        return s.score;
      }).sort((a, b) => a - b);
      const line = (name: string, v: number[]) => `${name}: min ${v[0]}, p25 ${v[12]}, median ${(v[24] + v[25]) / 2}, p90 ${v[44]}, max ${v[49]}`;
      console.log(`${line('hands bot', scores)}\n${line('hands random player', random)}\n(stars ${gameById('hands').stars.join(' / ')})`);
    }
    expect(median).toBeGreaterThanOrEqual(one);
    expect(median).toBeLessThan(three);
  });
});

describe('Mains de Cartes icon', () => {
  it('the icon is a valid 12×12 sprite', () => {
    expect(validateSprite(ICON)).toEqual([]);
    expect(ICON.rows).toHaveLength(12);
    expect(ICON.rows.every((row) => row.length === 12)).toBe(true);
  });
});
