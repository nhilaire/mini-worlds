// « Calcul Éclair » (docs/PRD.md "Calcul Éclair"): a sum (later a difference or a product) with 4 answer buttons, as
// many right answers as possible before the round timer runs out. Pure reducer; time comes in through `tick`
// (elapsed ms), randomness (questions and wrong answers) through the seeded generator kept in the state.
import type { BaseEvent, RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';

export const ROUND_MS = 60_000;
export const EXTRA_TIME_MS = 5_000; // per « Sablier » level
export const WRONG_PENALTY_MS = 5_000;
/** A new question ignores taps this long (input guard against a double tap on the previous answer). */
export const QUESTION_GUARD_MS = 250;
export const BASE_POINTS = 10;
export const STREAK_POINTS = 5;
export const STREAK_CAP = 8;
/** Every 5th right answer in a row is a combo. */
export const COMBO_EVERY = 5;
export const ANSWERS = 4;
export const MAX_OFFSET = 10;

export type Op = '+' | '-' | '×';
export type Question = { a: number; b: number; op: Op; answer: number; choices: readonly number[] };

export type QuickSumEvent =
  | BaseEvent
  /** Right answer at button `index`. */
  | { kind: 'right'; index: number; points: number }
  /** Wrong answer at button `index`: −5 s, the streak returns to 0, the question stays. */
  | { kind: 'wrong'; index: number }
  /** A tap during the guard of a new question: ignored. */
  | { kind: 'ignored' };

export type QuickSumState = RoundState<QuickSumEvent> & {
  question: Question;
  /** Question number, from 1 (redraw key). */
  questionId: number;
  /** Right answers so far (sets the level). */
  rights: number;
  /** Right answers in a row. */
  streak: number;
  timeLeftMs: number;
  /** Input guard left (ms) of the current question. */
  guardMs: number;
  rngState: number;
};

export type QuickSumAction = { type: 'tick'; dt: number } | { type: 'answer'; index: number };

export function roundMs(upgrades: UpgradeLevels): number {
  return ROUND_MS + EXTRA_TIME_MS * (upgrades.extra_time ?? 0);
}

/** Operations of the level reached after `rights` right answers. */
export function opsOf(rights: number): Op[] {
  if (rights < 10) return ['+'];
  if (rights < 20) return ['+', '-'];
  return ['+', '-', '×'];
}

/** Points of a right answer given the streak before it: 10 + 5 × min(streak, 8). */
export function pointsFor(streak: number): number {
  return BASE_POINTS + STREAK_POINTS * Math.min(streak, STREAK_CAP);
}

export function generateQuestion(rights: number, rngState: number): { question: Question; rngState: number } {
  const rng = createRng(rngState);
  const op = rng.pick(opsOf(rights));
  let a: number;
  let b: number;
  let answer: number;
  if (op === '+') {
    // Level 1: a, b ≥ 1 and a + b ≤ 20; level 2+: a, b ≥ 1 and a + b ≤ 50.
    const max = rights < 10 ? 20 : 50;
    a = 1 + rng.int(max - 1); // 1..max-1
    b = 1 + rng.int(max - a); // 1..max-a
    answer = a + b;
  } else if (op === '-') {
    a = rng.int(51); // 0..50
    b = rng.int(a + 1); // 0..a
    answer = a - b;
  } else {
    a = 2 + rng.int(9); // 2..10
    b = 2 + rng.int(9);
    answer = a * b;
  }
  // Three distinct wrong answers ≥ 0 within ±1..±10 of the right one (at least 10 candidates always exist).
  const candidates: number[] = [];
  for (let d = -MAX_OFFSET; d <= MAX_OFFSET; d++) if (d !== 0 && answer + d >= 0) candidates.push(answer + d);
  const wrong = rng.shuffle(candidates).slice(0, ANSWERS - 1);
  const choices = rng.shuffle([answer, ...wrong]);
  return { question: { a, b, op, answer, choices }, rngState: rng.state() };
}

export function createQuickSum(seed: number, upgrades: UpgradeLevels = {}): QuickSumState {
  const first = generateQuestion(0, seed >>> 0);
  // The first question has no guard: there is no previous answer to double-tap, and the round timer (and so the
  // guard) does not run while the tutorial bubble asks for the first answer.
  return { score: 0, combos: 0, status: 'playing', events: [], question: first.question, questionId: 1, rights: 0, streak: 0, timeLeftMs: roundMs(upgrades), guardMs: 0, rngState: first.rngState };
}

/** Whole seconds left, as the HUD shows them (rounded up: 0 only when the round is over). */
export function secondsLeft(state: QuickSumState): number {
  return Math.ceil(state.timeLeftMs / 1000);
}

/** Index of the right answer among the buttons. */
export function rightIndex(state: QuickSumState): number {
  return state.question.choices.indexOf(state.question.answer);
}

function answer(state: QuickSumState, index: number): QuickSumState {
  if (state.guardMs > 0) return { ...state, events: [{ kind: 'ignored' }] };
  if (index < 0 || index >= state.question.choices.length) return state.events.length === 0 ? state : { ...state, events: [] };
  if (state.question.choices[index] !== state.question.answer) {
    const timeLeftMs = Math.max(0, state.timeLeftMs - WRONG_PENALTY_MS);
    const events: QuickSumEvent[] = [{ kind: 'wrong', index }];
    if (timeLeftMs <= 0) return { ...state, timeLeftMs, streak: 0, status: 'over', events: [...events, { kind: 'over', score: state.score }] };
    return { ...state, timeLeftMs, streak: 0, events };
  }
  const points = pointsFor(state.streak);
  const streak = state.streak + 1;
  const rights = state.rights + 1;
  const next = generateQuestion(rights, state.rngState);
  const combo = streak % COMBO_EVERY === 0;
  const events: QuickSumEvent[] = [{ kind: 'right', index, points }, { kind: 'score', points }];
  if (combo) events.push({ kind: 'combo' });
  return {
    ...state,
    score: state.score + points,
    combos: state.combos + (combo ? 1 : 0),
    streak,
    rights,
    question: next.question,
    questionId: state.questionId + 1,
    guardMs: QUESTION_GUARD_MS,
    rngState: next.rngState,
    events,
  };
}

export function reduceQuickSum(state: QuickSumState, action: QuickSumAction): QuickSumState {
  if (state.status !== 'playing') return state;
  switch (action.type) {
    case 'tick': {
      if (action.dt <= 0) return state.events.length === 0 ? state : { ...state, events: [] };
      const timeLeftMs = Math.max(0, state.timeLeftMs - action.dt);
      const guardMs = Math.max(0, state.guardMs - action.dt);
      if (timeLeftMs <= 0) return { ...state, timeLeftMs, guardMs, status: 'over', events: [{ kind: 'over', score: state.score }] };
      return { ...state, timeLeftMs, guardMs, events: [] };
    }
    case 'answer':
      return answer(state, action.index);
  }
}
