import { CHECK_MARK, CROSS_MARK, SYMBOL_SPRITES } from '../art/games/pattern';
import { ICON } from '../art/icons/pattern';
import { spriteSize, validateSprite } from '../art/sprites';
import { gameById } from '../game/core/content';
import { BOT_RIGHT_RATE, BOT_THINK_MS, playPatternBot } from '../game/pattern/bot';
import {
  ANSWER_GUARD_MS,
  continuations,
  createPattern,
  fallbackQuestion,
  familiesOf,
  Family,
  generateQuestion,
  levelNow,
  levelOf,
  PatternState,
  pointsFor,
  Question,
  reducePattern,
  rightIndex,
  roundMs,
  secondsLeft,
  SYMBOLS,
  WRONG_PENALTY_MS,
} from '../game/pattern/engine';

const tick = (s: PatternState, dt: number) => reducePattern(s, { type: 'tick', dt });
const answer = (s: PatternState, index: number) => reducePattern(s, { type: 'answer', index });
const wrongIndex = (s: PatternState) => (rightIndex(s) + 1) % 4;
/** A right answer with the guard elapsed. */
const right = (s: PatternState) => answer(tick(s, ANSWER_GUARD_MS), rightIndex(s));
/** A wrong answer with the guard elapsed. */
const wrong = (s: PatternState) => answer(tick(s, ANSWER_GUARD_MS), wrongIndex(s));

const numbers = (q: Question) => q.terms.map(Number);
const steps = (q: Question) => numbers(q).slice(1).map((n, i) => n - numbers(q)[i]);
/** 500 questions of a level, each from its own seed. */
const questions = (level: number) => Array.from({ length: 500 }, (_, i) => generateQuestion(level, i * 2654435761 + level).question);

/** The 5th term by the rule of the family, or null when the 4 terms do not follow it. */
function ruleAnswer(q: Question): number | string | null {
  const t = numbers(q);
  const d = steps(q);
  switch (q.family) {
    case 'symbols': {
      const s = q.terms;
      if (s[0] === s[2] && s[1] === s[3] && s[0] !== s[1]) return s[0]; // period 2
      if (s[0] === s[3] && new Set(s.slice(0, 3)).size === 3) return s[1]; // period 3
      return null;
    }
    case 'step':
      return d.every((x) => x === d[0]) && d[0] >= 2 && d[0] <= 9 ? t[3] + d[0] : null;
    case 'down':
      return d.every((x) => x === d[0]) && d[0] <= -2 && d[0] >= -9 ? t[3] + d[0] : null;
    case 'double':
      return t[1] === 2 * t[0] && t[2] === 2 * t[1] && t[3] === 2 * t[2] ? 2 * t[3] : null;
    case 'alternate':
      return d[0] === d[2] && d[0] !== d[1] && d[0] >= 1 && d[1] >= 1 ? t[3] + d[1] : null;
    case 'growing':
      return d[0] >= 1 && d[1] === d[0] + 1 && d[2] === d[0] + 2 ? t[3] + d[0] + 3 : null;
    case 'sum':
      return t[2] === t[0] + t[1] && t[3] === t[1] + t[2] ? t[2] + t[3] : null;
  }
}

describe('Suite Logique engine (AC-104)', () => {
  it('AC-104: the level is 1 + right answers ÷ 4, capped at 5, and sets the families', () => {
    expect([0, 3, 4, 7, 8, 11, 12, 15, 16, 19, 20, 99].map(levelOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5]);
    expect([1, 2, 3, 4, 5].map(familiesOf)).toEqual([['symbols'], ['step'], ['down', 'double'], ['alternate'], ['growing', 'sum']]);
  });

  it.each([1, 2, 3, 4, 5])('AC-104: level %i questions follow the rule of their family, with exactly one right answer among 4 different ones', (level) => {
    const seen = new Set<Family>();
    for (const q of questions(level)) {
      seen.add(q.family);
      expect(familiesOf(level)).toContain(q.family);
      expect(q.terms).toHaveLength(4);
      expect(q.answers).toHaveLength(4);
      expect(new Set(q.answers).size).toBe(4);
      const expected = ruleAnswer(q);
      expect(expected).not.toBeNull();
      expect(q.answers[q.right]).toBe(expected);
      expect(q.answers.filter((a) => a === expected)).toHaveLength(1);
      if (q.family === 'symbols') {
        for (const item of [...q.terms, ...q.answers]) expect(SYMBOLS).toContain(item);
      } else {
        for (const item of [...q.terms, ...q.answers]) {
          expect(Number.isInteger(item)).toBe(true);
          expect(item).toBeGreaterThanOrEqual(0);
        }
        // Wrong answers: within ±10 of the right one, or the trap (the last step repeated).
        const t = numbers(q);
        for (const a of q.answers) expect(Math.abs(Number(a) - Number(expected)) <= 10 || a === 2 * t[3] - t[2]).toBe(true);
        // No other simple rule continues the 4 terms differently: no wrong answer is defensible.
        expect(continuations(numbers(q))).toEqual([expected]);
      }
    }
    expect([...seen].sort()).toEqual([...familiesOf(level)].sort());
  });

  it('AC-104: level 1 draws both periods (2 and 3) and every symbol', () => {
    const periods = new Set<number>();
    const symbols = new Set<unknown>();
    for (const q of questions(1)) {
      periods.add(q.terms[0] === q.terms[2] ? 2 : 3);
      q.terms.forEach((s) => symbols.add(s));
    }
    expect([...periods].sort()).toEqual([2, 3]);
    expect(symbols.size).toBe(SYMBOLS.length);
  });

  it('AC-104: a sequence that two simple rules continue differently is known as ambiguous; the fallbacks are not', () => {
    expect(continuations([2, 3, 5, 8]).sort((a, b) => a - b)).toEqual([12, 13]); // growing steps or sum
    expect(continuations([4, 6, 10, 16]).sort((a, b) => a - b)).toEqual([24, 26]);
    expect(continuations([3, 5, 7, 9])).toEqual([11]);
    expect(continuations([1, 2, 4, 8])).toEqual([16]);
    expect(continuations([1, 4, 2, 9])).toEqual([]);
    for (const family of ['step', 'down', 'double', 'alternate', 'growing', 'sum'] as const) {
      const q = fallbackQuestion(family);
      expect(q.family).toBe(family);
      expect(ruleAnswer(q)).toBe(q.answers[q.right]);
      expect(continuations(numbers(q))).toEqual([q.answers[q.right]]);
      expect(new Set(q.answers).size).toBe(4);
    }
  });

  it('AC-104: a right answer scores 20 + 5 × level; the next question comes at once', () => {
    expect([1, 2, 3, 4, 5].map(pointsFor)).toEqual([25, 30, 35, 40, 45]);
    let s = createPattern(3);
    const first = s.question;
    s = answer(s, rightIndex(s)); // the first question has no guard
    expect(s.score).toBe(25);
    expect(s.streak).toBe(1);
    expect(s.questionId).toBe(2);
    expect(s.question).not.toBe(first);
    expect(s.flash).toEqual({ question: first, index: first.right, correct: true });
    expect(s.events).toEqual([{ kind: 'right', index: first.right, points: 25 }, { kind: 'score', points: 25 }]);
    let expected = 25;
    for (let k = 1; k < 24; k++) {
      expect(levelNow(s)).toBe(Math.min(5, 1 + Math.floor(k / 4)));
      expect(familiesOf(levelNow(s))).toContain(s.question.family);
      expected += 20 + 5 * levelNow(s);
      s = right(s);
      expect(s.score).toBe(expected);
    }
    expect(levelNow(s)).toBe(5);
  });

  it('AC-104: a wrong answer costs 3 s and the streak, scores nothing, and the next question comes at once', () => {
    let s = right(right(createPattern(8)));
    expect(s.streak).toBe(2);
    s = tick(s, ANSWER_GUARD_MS);
    const q = s.question;
    const time = s.timeLeftMs;
    const index = wrongIndex(s);
    s = answer(s, index);
    expect(s.timeLeftMs).toBe(time - WRONG_PENALTY_MS);
    expect(s.streak).toBe(0);
    expect(s.score).toBe(50);
    expect(s.rights).toBe(2);
    expect(s.question).not.toBe(q);
    expect(s.questionId).toBe(4);
    expect(s.flash).toEqual({ question: q, index, correct: false });
    expect(s.events).toEqual([{ kind: 'wrong', index }]);
    s = right(s);
    expect(s.events[0]).toEqual({ kind: 'right', index: expect.any(Number), points: 25 });
  });

  it('AC-104 / AC-108: an answer is shown 250 ms; taps are ignored meanwhile (right or wrong, after a right or a wrong answer)', () => {
    for (const first of [rightIndex, wrongIndex]) {
      let s = createPattern(11);
      s = answer(s, first(s));
      const after = s;
      for (let i = 0; i < 4; i++) {
        const doubled = answer(s, i);
        expect(doubled).toEqual({ ...after, events: [{ kind: 'ignored' }] });
      }
      s = tick(s, ANSWER_GUARD_MS - 50);
      expect(s.flash).toBe(after.flash);
      expect(answer(s, rightIndex(s)).score).toBe(after.score);
      s = tick(s, 50);
      expect(s.flash).toBeNull();
      expect(answer(s, rightIndex(s)).score).toBe(after.score + 25);
    }
  });

  it('AC-104: the timer is 60 s + 5 s per « Sablier » level; a wrong answer at 3 s or less ends the round', () => {
    expect([0, 1, 2, 3].map((l) => roundMs({ extra_time: l }))).toEqual([60_000, 65_000, 70_000, 75_000]);
    expect(createPattern(1, { extra_time: 3 }).timeLeftMs).toBe(75_000);
    let s = createPattern(1);
    expect(secondsLeft(s)).toBe(60);
    for (let t = 0; t < 60_000 - 50; t += 50) s = tick(s, 50);
    expect(s.status).toBe('playing');
    expect(secondsLeft(s)).toBe(1);
    s = tick(s, 50);
    expect(s.status).toBe('over');
    expect(s.events).toEqual([{ kind: 'over', score: 0 }]);
    expect(answer(s, 0)).toBe(s);
    expect(tick(s, 50)).toBe(s);

    let w = tick(createPattern(2), 57_000);
    w = answer(w, wrongIndex(w));
    expect(w.status).toBe('over');
    expect(w.timeLeftMs).toBe(0);
    expect(w.events).toEqual([{ kind: 'wrong', index: expect.any(Number) }, { kind: 'over', score: 0 }]);
  });

  it('AC-104: every 5th right answer in a row is a combo', () => {
    let s = createPattern(4);
    const combos: number[] = [];
    for (let k = 1; k <= 12; k++) {
      s = right(s);
      if (s.events.some((e) => e.kind === 'combo')) combos.push(k);
    }
    expect(combos).toEqual([5, 10]);
    expect(s.combos).toBe(2);
    s = wrong(s); // streak back to 0: the next combo needs 5 more
    for (let k = 1; k <= 4; k++) s = right(s);
    expect(s.combos).toBe(2);
    s = right(s);
    expect(s.combos).toBe(3);
  });

  it('AC-104: a tap outside the 4 buttons changes nothing; the same seed gives the same round', () => {
    const s = createPattern(5);
    expect(answer(s, 4)).toBe(s);
    expect(answer(s, -1)).toBe(s);
    expect(right(right(createPattern(42)))).toEqual(right(right(createPattern(42))));
    expect(createPattern(42).question).not.toEqual(createPattern(43).question);
  });

  it('the symbol sprites, the marks and the icon are well formed', () => {
    for (const id of SYMBOLS) {
      expect(validateSprite(SYMBOL_SPRITES[id])).toEqual([]);
      expect(spriteSize(SYMBOL_SPRITES[id])).toEqual({ width: 12, height: 12 });
    }
    // Shapes differ without colour: no two symbols fill the same pixels.
    const masks = SYMBOLS.map((id) => SYMBOL_SPRITES[id].rows.map((row) => row.replace(/[^.]/g, '#')).join('\n'));
    expect(new Set(masks).size).toBe(SYMBOLS.length);
    for (const sprite of [CHECK_MARK, CROSS_MARK]) expect(validateSprite(sprite)).toEqual([]);
    expect(validateSprite(ICON)).toEqual([]);
    expect(spriteSize(ICON)).toEqual({ width: 12, height: 12 });
  });
});

describe('Suite Logique balance (AC-108)', () => {
  it('AC-108: every seed tried starts a round on a level-1 question (200 seeds)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = createPattern(seed * 104729);
      expect(s.status).toBe('playing');
      expect(s.question.family).toBe('symbols');
      expect(s.question.right).toBeGreaterThanOrEqual(0);
      expect(s.question.right).toBeLessThan(4);
    }
  });

  it('AC-108: the bot constants are one per level, slower and less sure as the level grows', () => {
    expect(BOT_THINK_MS).toHaveLength(5);
    expect(BOT_RIGHT_RATE).toHaveLength(5);
    for (let i = 1; i < 5; i++) {
      expect(BOT_THINK_MS[i]).toBeGreaterThan(BOT_THINK_MS[i - 1]);
      expect(BOT_RIGHT_RATE[i]).toBeLessThan(BOT_RIGHT_RATE[i - 1]);
    }
  });

  it('AC-108: the casual bot finishes every seed and its median is ≥ 1 star and < 3 stars over 50 seeds', () => {
    const finals = Array.from({ length: 50 }, (_, i) => playPatternBot(i + 1));
    for (const s of finals) {
      expect(s.status).toBe('over');
      expect(s.timeLeftMs).toBe(0);
      expect(s.rights).toBeGreaterThan(0);
    }
    expect(playPatternBot(7)).toEqual(playPatternBot(7));
    const scores = finals.map((s) => s.score).sort((a, b) => a - b);
    const median = (scores[24] + scores[25]) / 2;
    const { stars } = gameById('pattern');
    expect(median).toBeGreaterThanOrEqual(stars[0]);
    expect(median).toBeLessThan(stars[2]);
  });

  it('AC-108 (measured, reported): bot min / p25 / median / p90 / max over seeds 1-50, and the maximum score', () => {
    const scores = Array.from({ length: 50 }, (_, i) => playPatternBot(i + 1).score).sort((a, b) => a - b);
    const median = (scores[24] + scores[25]) / 2;
    expect({ min: scores[0], p25: scores[12], median, p90: scores[44], max: scores[49] }).toEqual({ min: 360, p25: 480, median: 520, p90: 610, max: 700 });
    // The most a round can give: a right answer as soon as the previous one stops being shown (every 250 ms).
    let s = createPattern(1);
    s = answer(s, rightIndex(s));
    while (s.status === 'playing') {
      s = tick(s, ANSWER_GUARD_MS);
      s = answer(s, rightIndex(s));
    }
    expect(s.rights).toBe(240);
    expect(s.score).toBe(10_600);
  });

  it('AC-108: an answer during the 250 ms guard changes nothing', () => {
    let s = createPattern(21);
    s = answer(s, rightIndex(s));
    const guarded = tick(s, 100);
    for (let i = 0; i < 4; i++) expect(answer(guarded, i)).toEqual({ ...guarded, events: [{ kind: 'ignored' }] });
  });
});
