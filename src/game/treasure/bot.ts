// Casual bot of Chasse au Trésor (docs/PRD.md, AC-86): digs the cell that best matches all clues so far (the undug
// cell that, were the chest there, would give the band seen on the most dug cells), ties broken by a seeded draw.
// No lookahead. It plays the real reducer (digs, then 50 ms ticks through the guard and the finished-map pause).
import { createRng } from '../rng';
import { acceptsInput, bandOf, createTreasure, distance, reduceTreasure, TREASURE_CELLS, TreasureState } from './engine';

const FRAME_MS = 50;

/** Undug cells with the most clues matched, the best first (all ties). */
export function bestCells(state: Pick<TreasureState, 'dug'>): number[] {
  const clues: { cell: number; band: string }[] = [];
  state.dug.forEach((band, cell) => {
    if (band !== null) clues.push({ cell, band });
  });
  let best = -1;
  let cells: number[] = [];
  for (let cell = 0; cell < TREASURE_CELLS; cell++) {
    if (state.dug[cell] !== null) continue;
    const matched = clues.filter((c) => bandOf(distance(cell, c.cell)) === c.band).length;
    if (matched > best) {
      best = matched;
      cells = [cell];
    } else if (matched === best) cells.push(cell);
  }
  return cells;
}

/** Plays a whole round with the casual policy; returns the final state. */
export function playTreasureBot(seed: number, botSeed = seed ^ 0x2c1b3c6d, upgrades: Readonly<Record<string, number>> = {}): TreasureState {
  const rng = createRng(botSeed);
  let state = createTreasure(seed, upgrades);
  for (let step = 0; step < 10_000 && state.status === 'playing'; step++) {
    if (!acceptsInput(state)) {
      state = reduceTreasure(state, { type: 'tick', dt: FRAME_MS });
      continue;
    }
    state = reduceTreasure(state, { type: 'dig', cell: rng.pick(bestCells(state)) });
  }
  return state;
}
