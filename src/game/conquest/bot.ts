// Casual bot of Bataille de Nombres (docs/PRD.md, AC-108): each turn it plays the attack that takes a territory with
// the most units left (ties: the lowest indices), but never one that leaves a territory of its own within reach of
// the enemy (an enemy territory whose marching units would outnumber a joined player territory after the move); when
// no such attack exists it passes and lets its units grow. One turn in BOT_ERROR_RATE (seeded) it plays any legal
// move at random instead. No lookahead beyond the move itself: the position after it is only looked at, never played
// on. It plays the real reducer (taps, « Passer », then 50 ms ticks through the guard, the enemy's answer and the
// finished-battle pause).
import { createRng } from '../rng';
import { acceptsInput, ConquestState, createConquest, legalMoves, mapOf, march, Move, neighboursOf, reduceConquest, unitsLeftAfterTaking } from './engine';

const FRAME_MS = 50;
/** Share of the turns played at random. */
export const BOT_ERROR_RATE = 0.2;

type Position = Pick<ConquestState, 'battle' | 'territories'>;

/** True when, after the move, an enemy territory could take a joined player territory. */
export function exposedAfter(state: Position, move: Move): boolean {
  const map = mapOf(state.battle);
  const after = march(state.territories, move.from, move.to).territories;
  return after.some((t, i) => t.owner === 'enemy' && neighboursOf(map, i).some((n) => after[n].owner === 'player' && t.units - 1 > after[n].units));
}

/** The casual move: the safe attack that takes a territory with the most units left, null (pass) without one. */
export function casualConquestMove(state: Position): Move | null {
  let best: Move | null = null;
  let most = 0;
  for (const move of legalMoves(mapOf(state.battle), state.territories, 'player')) {
    const left = unitsLeftAfterTaking(state.territories, move);
    if (left === null || left <= most || exposedAfter(state, move)) continue;
    most = left;
    best = move;
  }
  return best;
}

/** Plays a whole round with the casual policy; returns the final state. */
export function playConquestBot(seed: number, botSeed = seed ^ 0x5bd1e995, upgrades: Readonly<Record<string, number>> = {}): ConquestState {
  const rng = createRng(botSeed);
  let state = createConquest(seed, upgrades);
  for (let step = 0; step < 10_000 && state.status === 'playing'; step++) {
    if (!acceptsInput(state)) {
      state = reduceConquest(state, { type: 'tick', dt: FRAME_MS });
      continue;
    }
    let move = casualConquestMove(state);
    if (rng.next() < BOT_ERROR_RATE) {
      const moves = legalMoves(mapOf(state.battle), state.territories, 'player');
      move = moves.length > 0 ? rng.pick(moves) : null;
    }
    if (move === null) state = reduceConquest(state, { type: 'pass' });
    else {
      state = reduceConquest(state, { type: 'tap', territory: move.from });
      state = reduceConquest(state, { type: 'tap', territory: move.to });
    }
  }
  return state;
}
