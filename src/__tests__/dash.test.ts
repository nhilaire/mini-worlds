import { validateSprite } from '../art/sprites';
import { SHAPES } from '../art/games/dash';
import { ICON } from '../art/icons/dash';
import { gameById } from '../game/core/content';
import { BOT_ERROR_FAST, BOT_ERROR_SLOW, botErrorChance, botLane, playDashBot } from '../game/dash/bot';
import {
  approachTime,
  Colour,
  colourLane,
  COLOURS,
  createDash,
  DashState,
  Doors,
  drawColour,
  drawDoors,
  Lane,
  LANES,
  LIVES,
  MAX_GATES,
  MAX_SCORE,
  reduceDash,
} from '../game/dash/engine';

const DOORS: Doors = ['red', 'blue', 'yellow'];

/** The gate on its way holds `doors` and the runner has `colour` (to script a gate exactly). */
function withGate(state: DashState, doors: Doors, colour: Colour): DashState {
  return { ...state, doors, colour };
}

/** Steers to `lane`, then waits until the gate reaches the runner. */
function pass(state: DashState, lane: Lane): DashState {
  return reduceDash(reduceDash(state, { type: 'steer', lane }), { type: 'tick', dt: state.approachMs });
}

const right = (state: DashState): DashState => pass(state, colourLane(state));
const wrong = (state: DashState): DashState => pass(state, LANES.find((lane) => lane !== colourLane(state)) ?? 'left');

/** Goes through `count` right doors in a row. */
function rightDoors(state: DashState, count: number): DashState {
  let s = state;
  for (let i = 0; i < count && s.status === 'playing'; i++) s = right(s);
  return s;
}

describe('Couleur Éclair engine (AC-96)', () => {
  it('AC-96: a gate holds the 3 colours once each, in a seeded order (the 6 orders come up)', () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      let s = createDash(seed * 7919);
      for (let i = 0; i < 12 && s.status === 'playing'; i++) {
        expect([...s.doors].sort()).toEqual([...COLOURS].sort());
        orders.add(s.doors.join());
        s = right(s);
      }
    }
    expect(orders.size).toBe(6);
    expect(drawDoors(42)).toEqual(drawDoors(42));
    expect(createDash(42)).toEqual(createDash(42));
  });

  it('AC-96: the round starts with 3 lives, on the middle lane, with a seeded colour and gate 1 on its way', () => {
    const s = createDash(9);
    expect(s).toMatchObject({ score: 0, combos: 0, status: 'playing', lives: LIVES, shields: 0, passed: 0, lane: 'middle', streak: 0, approachMs: 2200, last: null });
    expect(COLOURS).toContain(s.colour);
    expect(new Set(Array.from({ length: 60 }, (_, seed) => createDash(seed).colour)).size).toBe(3);
  });

  it('AC-96: the door of the runner lane with its colour scores 10 and the streak grows', () => {
    const start = withGate(createDash(1), DOORS, 'blue');
    const s = pass(start, 'middle');
    expect(s.score).toBe(10);
    expect(s.streak).toBe(1);
    expect(s.lives).toBe(3);
    expect(s.passed).toBe(1);
    expect(s.last).toEqual({ gate: 1, lane: 'middle', door: 'blue', colour: 'blue', ok: true, shielded: false });
    expect(s.events).toEqual([{ kind: 'door', gate: 1, lane: 'middle', door: 'blue', colour: 'blue', ok: true, shielded: false }, { kind: 'score', points: 10 }]);
    expect(right(s).score).toBe(20);
    expect(right(s).streak).toBe(2);
  });

  it('AC-96: a wrong door costs a life and resets the streak, without any point', () => {
    const three = rightDoors(createDash(2), 3);
    expect(three.streak).toBe(3);
    const s = pass(withGate(three, DOORS, 'blue'), 'left');
    expect(s.score).toBe(30);
    expect(s.lives).toBe(2);
    expect(s.streak).toBe(0);
    expect(s.passed).toBe(4);
    expect(s.status).toBe('playing');
    expect(s.last).toMatchObject({ lane: 'left', door: 'red', colour: 'blue', ok: false, shielded: false });
    expect(s.events.some((e) => e.kind === 'score')).toBe(false);
  });

  it('AC-96: every 5th right door in a row is a combo; a wrong door starts the count again', () => {
    let s = rightDoors(createDash(3), 4);
    expect(s.combos).toBe(0);
    s = right(s);
    expect(s.combos).toBe(1);
    expect(s.events).toContainEqual({ kind: 'combo' });
    s = rightDoors(s, 5);
    expect(s.combos).toBe(2);
    s = rightDoors(wrong(rightDoors(s, 4)), 4);
    expect(s.combos).toBe(2);
    expect(right(s).combos).toBe(3);
  });

  it('AC-96: the colour changes after every 4th gate to another colour, shown from the next approach, and only then', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let s = createDash(seed);
      while (s.status === 'playing') {
        const before = s.colour;
        // Right and wrong doors alike: the change follows the gates passed, not the score.
        s = (s.passed + seed) % 9 === 0 && s.lives > 1 ? wrong(s) : right(s);
        if (s.status !== 'playing') break;
        if (s.passed % 4 === 0) {
          expect(s.colour).not.toBe(before);
          expect(s.events).toContainEqual({ kind: 'colour', colour: s.colour });
        } else {
          expect(s.colour).toBe(before);
          expect(s.events.some((e) => e.kind === 'colour')).toBe(false);
        }
      }
      expect(s.passed).toBe(MAX_GATES);
    }
    for (const colour of COLOURS) for (let seed = 0; seed < 50; seed++) expect(drawColour(colour, seed).colour).not.toBe(colour);
    expect(new Set(Array.from({ length: 50 }, (_, seed) => drawColour('red', seed).colour))).toEqual(new Set(['blue', 'yellow']));
  });

  it('AC-96: the approach time of gate n follows max(900, 2 200 − 30 × (n − 1))', () => {
    expect([1, 2, 3, 10, 44, 45, 46, 60].map(approachTime)).toEqual([2200, 2170, 2140, 1930, 910, 900, 900, 900]);
    for (let n = 1; n <= MAX_GATES; n++) expect(approachTime(n)).toBe(Math.max(900, 2200 - 30 * (n - 1)));
    let s = createDash(4);
    while (s.status === 'playing') {
      expect(s.approachMs).toBe(approachTime(s.passed + 1));
      s = right(s);
    }
  });

  it('AC-96: without any tap the gate reaches the runner after the approach time and the door of its lane counts', () => {
    const start = withGate(createDash(5), DOORS, 'blue');
    const almost = reduceDash(start, { type: 'tick', dt: 2199 });
    expect(almost.passed).toBe(0);
    expect(almost.approachMs).toBe(1);
    expect(almost.score).toBe(0);
    const through = reduceDash(almost, { type: 'tick', dt: 1 });
    expect(through.passed).toBe(1);
    expect(through.score).toBe(10);
    // The next approach starts at once, on the same lane.
    expect(through.approachMs).toBe(2170);
    expect(through.lane).toBe('middle');
  });

  it('AC-96: a tap sets the lane, any number of times: the last lane counts and is kept to the next gate', () => {
    const start = withGate(createDash(5), DOORS, 'yellow');
    const left = reduceDash(start, { type: 'steer', lane: 'left' });
    expect(left.lane).toBe('left');
    expect(left.events).toEqual([{ kind: 'lane', lane: 'left' }]);
    const moved = reduceDash(reduceDash(reduceDash(left, { type: 'tick', dt: 500 }), { type: 'steer', lane: 'middle' }), { type: 'steer', lane: 'right' });
    expect(moved.passed).toBe(0);
    expect(moved.approachMs).toBe(1700);
    const first = reduceDash(moved, { type: 'tick', dt: 1700 });
    expect(first.last).toMatchObject({ lane: 'right', door: 'yellow', ok: true });
    const second = reduceDash(first, { type: 'tick', dt: first.approachMs });
    expect(second.last?.lane).toBe('right');
    expect(second.lane).toBe('right');
  });

  it('AC-96: the round ends at the 3rd life lost', () => {
    let s = wrong(wrong(right(createDash(6))));
    expect(s.lives).toBe(1);
    expect(s.status).toBe('playing');
    s = wrong(s);
    expect(s.lives).toBe(0);
    expect(s.status).toBe('over');
    expect(s.passed).toBe(4);
    expect(s.score).toBe(10);
    expect(s.events).toContainEqual({ kind: 'over', score: 10 });
    // Nothing moves after the end.
    expect(reduceDash(s, { type: 'tick', dt: 5000 })).toBe(s);
    expect(reduceDash(s, { type: 'steer', lane: 'left' })).toBe(s);
  });

  it('AC-96: the round ends after gate 60, at most 600 points and 12 combos', () => {
    let s = rightDoors(createDash(7), MAX_GATES - 1);
    expect(s.status).toBe('playing');
    expect(s.passed).toBe(59);
    s = right(s);
    expect(s.status).toBe('over');
    expect(s.passed).toBe(MAX_GATES);
    expect(s.score).toBe(MAX_SCORE);
    expect(MAX_SCORE).toBe(600);
    expect(s.combos).toBe(12);
    expect(s.lives).toBe(3);
    expect(s.events).toContainEqual({ kind: 'over', score: 600 });
    // A wrong last door ends the round too, with lives left.
    const missed = wrong(rightDoors(createDash(7), MAX_GATES - 1));
    expect(missed).toMatchObject({ status: 'over', score: 590, lives: 2 });
  });

  it('AC-96: « Bouclier » pays 1 / 2 / 3 wrong doors per round instead of a life; the streak is still reset', () => {
    expect([0, 1, 2, 3].map((guard) => createDash(8, { guard }).shields)).toEqual([0, 1, 2, 3]);
    for (const guard of [1, 2, 3]) {
      let s = rightDoors(createDash(8, { guard }), 2);
      for (let i = 0; i < guard; i++) {
        s = wrong(right(s));
        expect(s.lives).toBe(3);
        expect(s.shields).toBe(guard - i - 1);
        expect(s.streak).toBe(0);
        expect(s.last).toMatchObject({ ok: false, shielded: true });
      }
      // No shield left: the next wrong door costs a life.
      s = wrong(s);
      expect(s.lives).toBe(2);
      expect(s.last).toMatchObject({ ok: false, shielded: false });
      // 3 lives + the shields: the round ends at wrong door number 3 + guard.
      s = wrong(wrong(s));
      expect(s.status).toBe('over');
    }
  });

  it('the shapes and the icon are valid sprites, one shape per colour', () => {
    for (const colour of COLOURS) expect(validateSprite(SHAPES[colour])).toEqual([]);
    expect(new Set(COLOURS.map((colour) => SHAPES[colour].rows.join())).size).toBe(3);
    expect(validateSprite(ICON)).toEqual([]);
    expect([ICON.rows.length, ICON.rows[0].length]).toEqual([12, 12]);
  });
});

describe('Couleur Éclair balance and guards (AC-108)', () => {
  const [oneStar, , threeStars] = gameById('dash').stars;
  const rounds = Array.from({ length: 50 }, (_, i) => playDashBot(i + 1));
  const scores = rounds.map((s) => s.score).sort((a, b) => a - b);
  const median = (scores[24] + scores[25]) / 2;

  it('AC-108: the generator starts a round for every seed tried', () => {
    for (let seed = 0; seed < 500; seed++) {
      const state = createDash(seed * 2654435761);
      expect(state.status).toBe('playing');
      expect([...state.doors].sort()).toEqual([...COLOURS].sort());
      expect(COLOURS).toContain(state.colour);
    }
  });

  it('AC-108: every seed finishes: 3 lives lost or gate 60, the score within the maximum', () => {
    for (const s of rounds) {
      expect(s.status).toBe('over');
      expect(s.lives === 0 || s.passed === MAX_GATES).toBe(true);
      expect(s.score).toBeLessThanOrEqual(MAX_SCORE);
      expect(s.score % 10).toBe(0);
    }
  });

  it('AC-108: an input during the input guard changes nothing (a second tap on the lane of the runner, a tap after the end)', () => {
    const once = reduceDash(createDash(11), { type: 'steer', lane: 'right' });
    const again = reduceDash(once, { type: 'steer', lane: 'right' });
    expect({ ...again, events: [] }).toEqual({ ...once, events: [] });
    expect(again.events).toEqual([]);
    const later = reduceDash(reduceDash(once, { type: 'tick', dt: 50 }), { type: 'steer', lane: 'right' });
    expect(later).toEqual({ ...once, approachMs: once.approachMs - 50, events: [] });
    // A tick without time changes nothing either.
    expect({ ...reduceDash(once, { type: 'tick', dt: 0 }), events: [] }).toEqual({ ...once, events: [] });
    const over = playDashBot(11);
    for (const lane of LANES) expect(reduceDash(over, { type: 'steer', lane })).toBe(over);
  });

  it('AC-108: the casual bot is deterministic per seed and errs more as the gates come faster', () => {
    expect(playDashBot(7)).toEqual(playDashBot(7));
    expect(botErrorChance(1)).toBe(BOT_ERROR_SLOW);
    expect(botErrorChance(45)).toBe(BOT_ERROR_FAST);
    expect(botErrorChance(60)).toBe(BOT_ERROR_FAST);
    const state = createDash(7);
    expect(botLane(state, 0.99, 0)).toBe(colourLane(state));
    expect(botLane(state, 0, 0)).not.toBe(colourLane(state));
    expect(botLane(state, 0, 0.99)).not.toBe(botLane(state, 0, 0));
  });

  it('AC-108: over 50 seeds the casual bot has a median ≥ the 1-star threshold and < the 3-star one', () => {
    expect(median).toBeGreaterThanOrEqual(oneStar);
    expect(median).toBeLessThan(threeStars);
  });

  it('AC-108 (measured, reported): bot min / p25 / median / p90 / max over seeds 1-50', () => {
    expect({ min: scores[0], p25: scores[12], median, p90: scores[45], max: scores[49] }).toEqual({ min: 70, p25: 160, median: 210, p90: 310, max: 420 });
  });
});
