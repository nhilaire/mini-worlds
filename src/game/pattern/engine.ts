// « Suite Logique » (docs/PRD.md "Suite Logique"): a sequence of 4 terms and « ? » with 4 answer buttons, as many
// right answers as possible before the round timer runs out. The family of the sequence follows the level. Pure
// reducer; time comes in through `tick` (elapsed ms), randomness (terms and wrong answers) through the seeded
// generator kept in the state.
import type { BaseEvent, RoundState, UpgradeLevels } from '../contract';
import { createRng, Rng } from '../rng';

export const ROUND_MS = 60_000;
export const EXTRA_TIME_MS = 5_000; // per « Sablier » level
export const WRONG_PENALTY_MS = 3_000;
/** An answer is shown this long (green or red); taps are ignored meanwhile. */
export const ANSWER_GUARD_MS = 250;
export const BASE_POINTS = 20;
export const LEVEL_POINTS = 5;
/** Level = 1 + right answers ÷ 4, capped at 5. */
export const RIGHTS_PER_LEVEL = 4;
export const MAX_LEVEL = 5;
/** Every 5th right answer in a row is a combo. */
export const COMBO_EVERY = 5;
export const TERMS = 4;
export const ANSWERS = 4;
/** Wrong numbers stay within ±1..±10 of the right one (and ≥ 0). */
export const MAX_OFFSET = 10;
/** Constant steps: +2 to +9 (level 2), −2 to −9 (level 3). */
export const MIN_STEP = 2;
export const MAX_STEP = 9;
/** First term of the rising families: 1 to 20. */
export const MAX_START = 20;
/** First term of a ×2 sequence: 1 to 6 (the answer is at most 96). */
export const MAX_DOUBLE_START = 6;
/** Two alternating steps (+a, +b): a and b from 1 to 9, different. */
export const MAX_ALTERNATE_STEP = 9;
/** Growing steps (+k, +k+1, +k+2...): the first step k is 1 to 5. */
export const MAX_FIRST_STEP = 5;
/** Sum of the two previous terms: the first two terms are 1 to 9. */
export const MAX_SUM_START = 9;
/** A sequence that another simple rule continues differently is drawn again, at most this many times. */
export const GENERATION_TRIES = 20;
/** Chance that the trap (the last step repeated) is one of the wrong answers, when it exists. */
export const TRAP_RATE = 0.5;

/** Symbols of the level-1 family: told by their shape (each also has its own colour). */
export const SYMBOLS = ['circle', 'square', 'triangle', 'star', 'diamond'] as const;
export type SymbolId = (typeof SYMBOLS)[number];
export type Item = number | SymbolId;

export type Family =
  /** Symbols repeating with period 2 or 3. */
  | 'symbols'
  /** Constant step +2..+9. */
  | 'step'
  /** Constant negative step −2..−9. */
  | 'down'
  /** ×2. */
  | 'double'
  /** Two alternating steps (+a, +b). */
  | 'alternate'
  /** Growing steps (+k, +k+1, +k+2...). */
  | 'growing'
  /** Sum of the two previous terms. */
  | 'sum';

export type Question = { terms: readonly Item[]; answers: readonly Item[]; /** Index of the right answer. */ right: number; family: Family };

export type PatternEvent =
  | BaseEvent
  /** Right answer at button `index`. */
  | { kind: 'right'; index: number; points: number }
  /** Wrong answer at button `index`: −3 s, the streak returns to 0; the next question comes at once. */
  | { kind: 'wrong'; index: number }
  /** A tap while the previous answer is shown: ignored. */
  | { kind: 'ignored' };

/** The answer being shown (green or red) during the guard: the question it was given to and the button tapped. */
export type Flash = { question: Question; index: number; correct: boolean };

export type PatternState = RoundState<PatternEvent> & {
  question: Question;
  /** Question number, from 1 (redraw key). */
  questionId: number;
  /** Right answers so far (sets the level). */
  rights: number;
  /** Right answers in a row. */
  streak: number;
  timeLeftMs: number;
  /** Input guard left (ms): the previous answer is still shown. */
  guardMs: number;
  /** The previous answer while the guard runs, else null. */
  flash: Flash | null;
  rngState: number;
};

export type PatternAction = { type: 'tick'; dt: number } | { type: 'answer'; index: number };

export function roundMs(upgrades: UpgradeLevels): number {
  return ROUND_MS + EXTRA_TIME_MS * (upgrades.extra_time ?? 0);
}

/** Level reached after `rights` right answers: 1 + rights ÷ 4, capped at 5. */
export function levelOf(rights: number): number {
  return Math.min(MAX_LEVEL, 1 + Math.floor(rights / RIGHTS_PER_LEVEL));
}

/** Families a question of this level is drawn from. */
export function familiesOf(level: number): Family[] {
  if (level <= 1) return ['symbols'];
  if (level === 2) return ['step'];
  if (level === 3) return ['down', 'double'];
  if (level === 4) return ['alternate'];
  return ['growing', 'sum'];
}

/** Points of a right answer at this level: 20 + 5 × level. */
export function pointsFor(level: number): number {
  return BASE_POINTS + LEVEL_POINTS * level;
}

/**
 * Every value a simple rule gives after these 4 numbers (no duplicates): constant step, constant whole ratio, two
 * alternating steps, steps growing by a constant amount, sum of the two previous terms. A generated question has
 * exactly one such value, its right answer: no wrong answer can be defended by another rule.
 */
export function continuations(terms: readonly number[]): number[] {
  const [t0, t1, t2, t3] = terms;
  const d1 = t1 - t0;
  const d2 = t2 - t1;
  const d3 = t3 - t2;
  const out: number[] = [];
  if (d1 === d2 && d2 === d3) out.push(t3 + d1);
  if (t0 > 0 && t1 % t0 === 0 && t1 >= 2 * t0 && t2 * t0 === t1 * t1 && t3 * t1 === t2 * t2) out.push((t3 * t1) / t0);
  if (d1 === d3) out.push(t3 + d2);
  if (d2 - d1 === d3 - d2) out.push(t3 + d3 + (d3 - d2));
  if (t2 === t0 + t1 && t3 === t1 + t2) out.push(t2 + t3);
  return [...new Set(out)];
}

/** Draws the 4 terms and the right answer (5 numbers) of a number family. */
function drawNumbers(family: Exclude<Family, 'symbols'>, rng: Rng): number[] {
  const steps = MAX_STEP - MIN_STEP + 1;
  switch (family) {
    case 'step': {
      const start = 1 + rng.int(MAX_START);
      const step = MIN_STEP + rng.int(steps);
      return [0, 1, 2, 3, 4].map((i) => start + i * step);
    }
    case 'down': {
      const step = MIN_STEP + rng.int(steps);
      // The answer (the 5th number) stays ≥ 0.
      const start = TERMS * step + rng.int(MAX_START + 1);
      return [0, 1, 2, 3, 4].map((i) => start - i * step);
    }
    case 'double': {
      const start = 1 + rng.int(MAX_DOUBLE_START);
      return [0, 1, 2, 3, 4].map((i) => start * 2 ** i);
    }
    case 'alternate': {
      const start = 1 + rng.int(MAX_START);
      const a = 1 + rng.int(MAX_ALTERNATE_STEP);
      const b = 1 + ((a + rng.int(MAX_ALTERNATE_STEP - 1)) % MAX_ALTERNATE_STEP); // 1..9, never a
      return [start, start + a, start + a + b, start + 2 * a + b, start + 2 * a + 2 * b];
    }
    case 'growing': {
      const start = 1 + rng.int(MAX_START);
      const first = 1 + rng.int(MAX_FIRST_STEP);
      const out = [start];
      for (let i = 0; i < TERMS; i++) out.push(out[i] + first + i);
      return out;
    }
    case 'sum': {
      const out = [1 + rng.int(MAX_SUM_START), 1 + rng.int(MAX_SUM_START)];
      for (let i = 2; i <= TERMS; i++) out.push(out[i - 1] + out[i - 2]);
      return out;
    }
  }
}

/** One question per number family, used when every draw was ambiguous (each has a single continuation). */
const FALLBACKS: Record<Exclude<Family, 'symbols'>, Question> = {
  step: { terms: [3, 7, 11, 15], answers: [18, 19, 20, 21], right: 1, family: 'step' },
  down: { terms: [30, 25, 20, 15], answers: [9, 10, 11, 12], right: 1, family: 'down' },
  double: { terms: [3, 6, 12, 24], answers: [36, 42, 46, 48], right: 3, family: 'double' },
  alternate: { terms: [2, 3, 6, 7], answers: [8, 9, 10, 11], right: 2, family: 'alternate' },
  growing: { terms: [5, 6, 8, 11], answers: [13, 14, 15, 16], right: 2, family: 'growing' },
  sum: { terms: [1, 3, 4, 7], answers: [9, 10, 11, 12], right: 2, family: 'sum' },
};

export function fallbackQuestion(family: Exclude<Family, 'symbols'>): Question {
  return FALLBACKS[family];
}

function symbolQuestion(rng: Rng): Question {
  const period = 2 + rng.int(2); // 2 or 3
  const cycle = rng.shuffle(SYMBOLS).slice(0, period);
  const terms = [0, 1, 2, 3].map((i) => cycle[i % period]);
  const answer = cycle[TERMS % period];
  const wrong = rng.shuffle(SYMBOLS.filter((s) => s !== answer)).slice(0, ANSWERS - 1);
  const answers = rng.shuffle([answer, ...wrong]);
  return { terms, answers, right: answers.indexOf(answer), family: 'symbols' };
}

function numberQuestion(family: Exclude<Family, 'symbols'>, numbers: readonly number[], rng: Rng): Question {
  const terms = numbers.slice(0, TERMS);
  const answer = numbers[TERMS];
  // Three distinct wrong answers ≥ 0 within ±1..±10 of the right one (at least 10 candidates always exist). The trap
  // repeats the last step (wrong in every family where the step changes); it is one of them half of the time.
  const trap = terms[3] + (terms[3] - terms[2]);
  const candidates: number[] = [];
  for (let d = -MAX_OFFSET; d <= MAX_OFFSET; d++) if (d !== 0 && answer + d >= 0 && answer + d !== trap) candidates.push(answer + d);
  const useTrap = trap !== answer && trap >= 0 && rng.next() < TRAP_RATE;
  const wrong = [...(useTrap ? [trap] : []), ...rng.shuffle(candidates)].slice(0, ANSWERS - 1);
  const answers = rng.shuffle([answer, ...wrong]);
  return { terms, answers, right: answers.indexOf(answer), family };
}

export function generateQuestion(level: number, rngState: number): { question: Question; rngState: number } {
  const rng = createRng(rngState);
  const family = rng.pick(familiesOf(level));
  if (family === 'symbols') return { question: symbolQuestion(rng), rngState: rng.state() };
  for (let attempt = 0; attempt < GENERATION_TRIES; attempt++) {
    const numbers = drawNumbers(family, rng);
    const next = continuations(numbers.slice(0, TERMS));
    // Kept only when its own rule is the single simple rule that continues it (2, 3, 5, 8 is drawn again: 12 or 13).
    if (next.length === 1 && next[0] === numbers[TERMS]) return { question: numberQuestion(family, numbers, rng), rngState: rng.state() };
  }
  return { question: fallbackQuestion(family), rngState: rng.state() };
}

export function createPattern(seed: number, upgrades: UpgradeLevels = {}): PatternState {
  const first = generateQuestion(levelOf(0), seed >>> 0);
  // The first question has no guard: there is no previous answer to show, and the round timer (and so the guard)
  // does not run while the tutorial bubble asks for the first answer.
  return { score: 0, combos: 0, status: 'playing', events: [], question: first.question, questionId: 1, rights: 0, streak: 0, timeLeftMs: roundMs(upgrades), guardMs: 0, flash: null, rngState: first.rngState };
}

/** Whole seconds left, as the HUD shows them (rounded up: 0 only when the round is over). */
export function secondsLeft(state: PatternState): number {
  return Math.ceil(state.timeLeftMs / 1000);
}

/** Level of the current question. */
export function levelNow(state: PatternState): number {
  return levelOf(state.rights);
}

/** Index of the right answer among the buttons. */
export function rightIndex(state: PatternState): number {
  return state.question.right;
}

function answer(state: PatternState, index: number): PatternState {
  if (state.guardMs > 0) return { ...state, events: [{ kind: 'ignored' }] };
  if (!Number.isInteger(index) || index < 0 || index >= state.question.answers.length) return state.events.length === 0 ? state : { ...state, events: [] };
  const correct = index === state.question.right;
  const flash: Flash = { question: state.question, index, correct };
  if (!correct) {
    const timeLeftMs = Math.max(0, state.timeLeftMs - WRONG_PENALTY_MS);
    const events: PatternEvent[] = [{ kind: 'wrong', index }];
    if (timeLeftMs <= 0) return { ...state, timeLeftMs, streak: 0, status: 'over', events: [...events, { kind: 'over', score: state.score }] };
    const next = generateQuestion(levelOf(state.rights), state.rngState);
    return { ...state, timeLeftMs, streak: 0, question: next.question, questionId: state.questionId + 1, guardMs: ANSWER_GUARD_MS, flash, rngState: next.rngState, events };
  }
  const points = pointsFor(levelOf(state.rights));
  const streak = state.streak + 1;
  const rights = state.rights + 1;
  const next = generateQuestion(levelOf(rights), state.rngState);
  const combo = streak % COMBO_EVERY === 0;
  const events: PatternEvent[] = [{ kind: 'right', index, points }, { kind: 'score', points }];
  if (combo) events.push({ kind: 'combo' });
  return {
    ...state,
    score: state.score + points,
    combos: state.combos + (combo ? 1 : 0),
    streak,
    rights,
    question: next.question,
    questionId: state.questionId + 1,
    guardMs: ANSWER_GUARD_MS,
    flash,
    rngState: next.rngState,
    events,
  };
}

export function reducePattern(state: PatternState, action: PatternAction): PatternState {
  if (state.status !== 'playing') return state;
  switch (action.type) {
    case 'tick': {
      if (action.dt <= 0) return state.events.length === 0 ? state : { ...state, events: [] };
      const timeLeftMs = Math.max(0, state.timeLeftMs - action.dt);
      const guardMs = Math.max(0, state.guardMs - action.dt);
      const flash = guardMs > 0 ? state.flash : null;
      if (timeLeftMs <= 0) return { ...state, timeLeftMs, guardMs, flash, status: 'over', events: [{ kind: 'over', score: state.score }] };
      return { ...state, timeLeftMs, guardMs, flash, events: [] };
    }
    case 'answer':
      return answer(state, action.index);
  }
}
