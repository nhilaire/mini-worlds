import { playQuickSumBot } from '../game/quicksum/bot';
import {
  createQuickSum,
  generateQuestion,
  pointsFor,
  QUESTION_GUARD_MS,
  QuickSumState,
  reduceQuickSum,
  rightIndex,
  roundMs,
  secondsLeft,
  WRONG_PENALTY_MS,
} from '../game/quicksum/engine';

const tick = (s: QuickSumState, dt: number) => reduceQuickSum(s, { type: 'tick', dt });
const answer = (s: QuickSumState, index: number) => reduceQuickSum(s, { type: 'answer', index });
const wrongIndex = (s: QuickSumState) => (rightIndex(s) + 1) % 4;
/** A right answer with the guard elapsed. */
const right = (s: QuickSumState) => answer(tick(s, QUESTION_GUARD_MS), rightIndex(s));

describe('Calcul Éclair engine (AC-80)', () => {
  it('AC-80: questions follow the operand ranges of each level, with exactly one right answer among 4 distinct answers ≥ 0', () => {
    const seen = { 0: new Set<string>(), 10: new Set<string>(), 20: new Set<string>() };
    for (let i = 0; i < 500; i++) {
      for (const rights of [0, 5, 10, 15, 20, 40] as const) {
        const { question: q } = generateQuestion(rights, i * 2654435761 + rights);
        const level = rights < 10 ? 0 : rights < 20 ? 10 : 20;
        seen[level].add(q.op);
        if (q.op === '+') {
          expect(q.a).toBeGreaterThanOrEqual(1);
          expect(q.b).toBeGreaterThanOrEqual(1);
          expect(q.a + q.b).toBeLessThanOrEqual(level === 0 ? 20 : 50);
          expect(q.answer).toBe(q.a + q.b);
        } else if (q.op === '-') {
          expect(level).toBeGreaterThanOrEqual(10);
          expect(q.b).toBeGreaterThanOrEqual(0);
          expect(q.b).toBeLessThanOrEqual(q.a);
          expect(q.a).toBeLessThanOrEqual(50);
          expect(q.answer).toBe(q.a - q.b);
        } else {
          expect(level).toBe(20);
          for (const n of [q.a, q.b]) expect(n >= 2 && n <= 10).toBe(true);
          expect(q.answer).toBe(q.a * q.b);
        }
        expect(q.choices).toHaveLength(4);
        expect(new Set(q.choices).size).toBe(4);
        expect(q.choices.filter((c) => c === q.answer)).toHaveLength(1);
        for (const c of q.choices) {
          expect(c).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(c)).toBe(true);
          expect(Math.abs(c - q.answer)).toBeLessThanOrEqual(10);
        }
      }
    }
    expect([...seen[0]]).toEqual(['+']);
    expect([...seen[10]].sort()).toEqual(['+', '-']);
    expect([...seen[20]].sort()).toEqual(['+', '-', '×']);
  });

  it('AC-80: a right answer scores 10 + 5 × min(streak before, 8); a new question follows', () => {
    expect([0, 1, 2, 7, 8, 9, 20].map(pointsFor)).toEqual([10, 15, 20, 45, 50, 50, 50]);
    let s = createQuickSum(3);
    const first = s.question;
    s = answer(s, rightIndex(s)); // the first question has no guard
    expect(s.score).toBe(10);
    expect(s.streak).toBe(1);
    expect(s.questionId).toBe(2);
    expect(s.question).not.toBe(first);
    let expected = 10;
    for (let k = 1; k < 12; k++) {
      s = right(s);
      expected += 10 + 5 * Math.min(k, 8);
      expect(s.score).toBe(expected);
    }
  });

  it('AC-80: a wrong answer costs 5 s and the streak and keeps the question', () => {
    let s = right(right(createQuickSum(8)));
    expect(s.streak).toBe(2);
    s = tick(s, QUESTION_GUARD_MS);
    const q = s.question;
    const time = s.timeLeftMs;
    s = answer(s, wrongIndex(s));
    expect(s.timeLeftMs).toBe(time - WRONG_PENALTY_MS);
    expect(s.streak).toBe(0);
    expect(s.question).toBe(q);
    expect(s.events).toEqual([{ kind: 'wrong', index: wrongIndex(s) }]);
    s = answer(s, rightIndex(s));
    expect(s.events[0]).toEqual({ kind: 'right', index: expect.any(Number), points: 10 });
  });

  it('AC-80 / AC-86: taps in the first 250 ms of a new question are ignored (a double tap changes nothing)', () => {
    let s = answer(createQuickSum(11), rightIndex(createQuickSum(11)));
    const after = s;
    // Double tap: the same button again, any button, right or wrong.
    for (let i = 0; i < 4; i++) {
      const doubled = answer(s, i);
      expect(doubled.score).toBe(after.score);
      expect(doubled.timeLeftMs).toBe(after.timeLeftMs);
      expect(doubled.question).toBe(after.question);
      expect(doubled.events).toEqual([{ kind: 'ignored' }]);
    }
    s = tick(s, QUESTION_GUARD_MS - 50);
    expect(answer(s, rightIndex(s)).score).toBe(after.score);
    s = tick(s, 50);
    expect(answer(s, rightIndex(s)).score).toBe(after.score + 15);
  });

  it('AC-80: the timer is 60 s + 5 s per « Sablier » level; a wrong answer at 5 s or less ends the round', () => {
    expect([0, 1, 2, 3].map((l) => roundMs({ extra_time: l }))).toEqual([60_000, 65_000, 70_000, 75_000]);
    expect(createQuickSum(1, { extra_time: 3 }).timeLeftMs).toBe(75_000);
    let s = createQuickSum(1);
    expect(secondsLeft(s)).toBe(60);
    for (let t = 0; t < 60_000 - 50; t += 50) s = tick(s, 50);
    expect(s.status).toBe('playing');
    expect(secondsLeft(s)).toBe(1);
    s = tick(s, 50);
    expect(s.status).toBe('over');
    expect(s.events).toEqual([{ kind: 'over', score: 0 }]);
    expect(answer(s, 0)).toBe(s);

    let w = tick(createQuickSum(2), 56_000);
    w = answer(w, wrongIndex(w));
    expect(w.status).toBe('over');
    expect(w.timeLeftMs).toBe(0);
  });

  it('AC-80: every 5th right answer in a row is a combo', () => {
    let s = createQuickSum(4);
    const combos: number[] = [];
    for (let k = 1; k <= 12; k++) {
      s = right(s);
      if (s.events.some((e) => e.kind === 'combo')) combos.push(k);
    }
    expect(combos).toEqual([5, 10]);
    expect(s.combos).toBe(2);
    s = tick(s, QUESTION_GUARD_MS);
    s = answer(s, wrongIndex(s)); // streak back to 0: the next combo needs 5 more
    for (let k = 1; k <= 4; k++) s = right(s);
    expect(s.combos).toBe(2);
    s = right(s);
    expect(s.combos).toBe(3);
  });

  it('AC-86: every seed tried starts a round (200 seeds)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = createQuickSum(seed * 104729);
      expect(s.status).toBe('playing');
      expect(s.question.op).toBe('+');
      expect(rightIndex(s)).toBeGreaterThanOrEqual(0);
    }
  });

  it('AC-86: the casual bot reaches a median ≥ 1 star (300) and < 3 stars (1 200) over 50 seeds', () => {
    const scores = Array.from({ length: 50 }, (_, i) => playQuickSumBot(i + 1).score).sort((a, b) => a - b);
    const median = (scores[24] + scores[25]) / 2;
    // Measured: median 385, p10 235, p90 595.
    expect(median).toBeGreaterThanOrEqual(300);
    expect(median).toBeLessThan(1200);
  });
});
