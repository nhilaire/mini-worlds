// « Perroquet Copieur » (docs/PRD.md "Perroquet Copieur"): a Simon-like memory game, pure reducer. The parrot shows
// a sequence of pads (phase `show`), then the player repeats it (phase `input`). The show timing is a pure function
// of the state (`showSchedule`): the screen plays it with the injectable clock, then dispatches `shown`.
import type { BaseEvent, RoundState } from '../contract';
import { createRng } from '../rng';

/** Pads: 0 red circle, 1 blue square, 2 yellow triangle, 3 green diamond. */
export type Pad = 0 | 1 | 2 | 3;
export const PADS: readonly Pad[] = [0, 1, 2, 3];

export const LEAD_MS = 600;
export const GAP_MS = 150;
export const BASE_LIT_MS = 500;
export const LIT_STEP_MS = 20;
export const MIN_LIT_MS = 250;
export const POINTS_PER_PAD = 10;
export const COMBO_EVERY = 5;

export type ParrotEvent =
  | BaseEvent
  | { kind: 'pad'; pad: Pad; index: number }
  | { kind: 'wrong'; pad: Pad; expected: Pad; chancesLeft: number }
  | { kind: 'repeated'; length: number; points: number }
  | { kind: 'ignored' };

export type ParrotState = RoundState<ParrotEvent> & {
  sequence: readonly Pad[];
  phase: 'show' | 'input';
  /** Pads of the sequence already repeated in this attempt. */
  inputIndex: number;
  /** « Seconde chance » left this round. */
  chances: number;
  /** Increases every time a show starts (new sequence or second chance): the screen restarts its timer on it. */
  showId: number;
  rngState: number;
};

export type ParrotAction = { type: 'shown' } | { type: 'tap'; pad: Pad };

/** Time each pad stays lit for a sequence of `length`: 500 − 20 × (length − 1) ms, at least 250 ms. */
export function litMs(length: number): number {
  return Math.max(MIN_LIT_MS, BASE_LIT_MS - LIT_STEP_MS * (length - 1));
}

export type Light = { pad: Pad; startMs: number; endMs: number };
export type ShowSchedule = { lights: readonly Light[]; totalMs: number };

/** The show of the current sequence: 600 ms dark, then each pad lit for `litMs`, 150 ms dark between two pads. */
export function showSchedule(sequence: readonly Pad[]): ShowSchedule {
  const lit = litMs(sequence.length);
  const lights = sequence.map((pad, i) => {
    const startMs = LEAD_MS + i * (lit + GAP_MS);
    return { pad, startMs, endMs: startMs + lit };
  });
  return { lights, totalMs: lights.length > 0 ? lights[lights.length - 1].endMs : LEAD_MS };
}

/** Which light is on `elapsedMs` after the show started (null when dark); `index` is its position in the sequence. */
export function lightAt(schedule: ShowSchedule, elapsedMs: number): { pad: Pad; index: number } | null {
  const index = schedule.lights.findIndex((l) => elapsedMs >= l.startMs && elapsedMs < l.endMs);
  return index < 0 ? null : { pad: schedule.lights[index].pad, index };
}

function drawPad(rngState: number): { pad: Pad; rngState: number } {
  const rng = createRng(rngState);
  const pad = rng.int(PADS.length) as Pad;
  return { pad, rngState: rng.state() };
}

export function createParrot(seed: number, upgrades: { second_chance?: number } = {}): ParrotState {
  const first = drawPad(seed >>> 0);
  return {
    score: 0,
    combos: 0,
    status: 'playing',
    events: [],
    sequence: [first.pad],
    phase: 'show',
    inputIndex: 0,
    chances: upgrades.second_chance ?? 0,
    showId: 1,
    rngState: first.rngState,
  };
}

export function reduceParrot(state: ParrotState, action: ParrotAction): ParrotState {
  if (state.status !== 'playing') return { ...state, events: [] };
  switch (action.type) {
    case 'shown':
      if (state.phase !== 'show') return { ...state, events: [] };
      return { ...state, phase: 'input', inputIndex: 0, events: [] };
    case 'tap': {
      // Inputs are ignored while the sequence is shown.
      if (state.phase !== 'input') return { ...state, events: [{ kind: 'ignored' }] };
      const expected = state.sequence[state.inputIndex];
      if (action.pad !== expected) {
        if (state.chances > 0) {
          const chances = state.chances - 1;
          // Second chance: the same sequence is shown again from the start.
          return { ...state, chances, phase: 'show', inputIndex: 0, showId: state.showId + 1, events: [{ kind: 'wrong', pad: action.pad, expected, chancesLeft: chances }] };
        }
        return { ...state, status: 'over', events: [{ kind: 'wrong', pad: action.pad, expected, chancesLeft: 0 }, { kind: 'over', score: state.score }] };
      }
      const events: ParrotEvent[] = [{ kind: 'pad', pad: action.pad, index: state.inputIndex }];
      const inputIndex = state.inputIndex + 1;
      if (inputIndex < state.sequence.length) return { ...state, inputIndex, events };

      // The whole sequence repeated: 10 × length points, then the next sequence (one seeded pad more).
      const length = state.sequence.length;
      const points = POINTS_PER_PAD * length;
      let combos = state.combos;
      events.push({ kind: 'repeated', length, points }, { kind: 'score', points });
      if (length % COMBO_EVERY === 0) {
        combos += 1;
        events.push({ kind: 'combo' });
      }
      const next = drawPad(state.rngState);
      return {
        ...state,
        score: state.score + points,
        combos,
        sequence: [...state.sequence, next.pad],
        rngState: next.rngState,
        phase: 'show',
        inputIndex: 0,
        showId: state.showId + 1,
        events,
      };
    }
  }
}
