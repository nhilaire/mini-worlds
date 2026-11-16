// Replay plan of a Fruits en Fusion drop or sweep (AC-91, v0.3.0 phone test: merges were not seen): the pure list
// of phases the screen animates after the engine has settled the move. Built from the grid before the move and the
// events of the move only (each merge or vanish event carries the grid just before its step), so Jest proves it.
// Its total duration equals the engine's input guard (`guardFor`), so taps stay ignored until the replay ends.
import { Cell, cellOf, FRUIT_GUARD_MS, FruitEvent, FruitState } from './engine';

type Step = Extract<FruitEvent, { kind: 'merge' | 'vanish' }>;
const isStep = (e: FruitEvent): e is Step => e.kind === 'merge' || e.kind === 'vanish';

export const DROP_MS = FRUIT_GUARD_MS;
export const FLASH_MS = 280;
export const SHRINK_MS = 220;
export const FALL_MS = 180;

export type FruitPhase =
  /** The dropped fruit lands in `cell` (zoom in); for a sweep, the board after the bottom row fell (cell -1). */
  | { kind: 'drop'; board: readonly Cell[]; cell: number; ms: number }
  /** The fruits of `cells` are framed and flash; `points` pop above `at` (the new fruit's cell, null for a vanish). */
  | { kind: 'flash'; board: readonly Cell[]; cells: readonly number[]; at: number | null; points: number; ms: number }
  /** The merged fruits shrink away while the new `fruit` grows in `at` (nothing grows for a vanish). */
  | { kind: 'shrink'; board: readonly Cell[]; cells: readonly number[]; at: number | null; fruit: number | null; ms: number }
  /** The fruits above fall: `board` is the grid after gravity. */
  | { kind: 'fall'; board: readonly Cell[]; ms: number };

/** The phases to animate between the grid before the move and the settled `next` state. */
export function buildFruitReplay(before: readonly Cell[], next: FruitState): FruitPhase[] {
  const steps = next.events.filter(isStep);
  const drop = next.events.find((e) => e.kind === 'drop');
  const phases: FruitPhase[] = [];
  if (drop && drop.kind === 'drop') {
    const cell = cellOf(drop.col, drop.row);
    const landed = before.slice();
    landed[cell] = drop.fruit;
    phases.push({ kind: 'drop', board: steps.length > 0 ? landed : next.cells, cell, ms: DROP_MS });
  } else {
    // A sweep: the bottom row is gone and the fruits above have fallen when the first step starts.
    phases.push({ kind: 'drop', board: steps[0]?.board ?? next.cells, cell: -1, ms: DROP_MS });
  }
  steps.forEach((step, i) => {
    const at = step.kind === 'merge' ? step.at : null;
    const fruit = step.kind === 'merge' ? step.fruit : null;
    phases.push({ kind: 'flash', board: step.board, cells: step.cells, at, points: step.points, ms: FLASH_MS });
    const shrunk = step.board.slice();
    for (const c of step.cells) shrunk[c] = null;
    if (at !== null) shrunk[at] = fruit;
    phases.push({ kind: 'shrink', board: shrunk, cells: step.cells, at, fruit, ms: SHRINK_MS });
    phases.push({ kind: 'fall', board: steps[i + 1]?.board ?? next.cells, ms: FALL_MS });
  });
  return phases;
}

export function fruitReplayDuration(phases: readonly FruitPhase[]): number {
  return phases.reduce((sum, p) => sum + p.ms, 0);
}
