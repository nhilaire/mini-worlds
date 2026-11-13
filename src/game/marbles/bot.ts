// Casual bot of « Tri de Billes » (docs/PRD.md, AC-86): a simple policy without lookahead, used by the balance test.
// Every 1.5 s of the round timer it plays one move: a move that completes or extends a same-colour run (onto the same
// colour, and the run on the target tube ends longer than the run taken from the source: pouring part of a run back
// and forth is not « extending »), else a seeded legal move. Pointless moves (a one-colour tube poured
// into an empty tube) are skipped; with no other move left (dead end) it presses « Recommencer ».
import type { UpgradeLevels } from '../contract';
import { createRng } from '../rng';
import { createMarbles, isPointless, legalMoves, MarblesState, Move, moveCount, reduceMarbles, topRun } from './engine';

export const BOT_MOVE_MS = 1500;
const TICK_MS = 50;

export function botMove(state: MarblesState, pick: (moves: Move[]) => Move): Move | null {
  const moves = legalMoves(state.tubes).filter((m) => !isPointless(state.tubes, m.from, m.to));
  if (moves.length === 0) return null;
  const extending = moves.filter((m) => {
    const target = state.tubes[m.to];
    return target.length > 0 && topRun(target) + moveCount(state.tubes, m.from, m.to) > topRun(state.tubes[m.from]);
  });
  return pick(extending.length > 0 ? extending : moves);
}

/** Plays a whole round with the casual policy; returns the final state. */
export function playMarblesBot(seed: number, upgrades: UpgradeLevels = {}): MarblesState {
  const rng = createRng((seed ^ 0x9e3779b9) >>> 0);
  let state = createMarbles(seed, upgrades);
  let untilMove = BOT_MOVE_MS;
  while (state.status === 'playing') {
    state = reduceMarbles(state, { type: 'tick', dt: TICK_MS });
    untilMove -= TICK_MS;
    if (state.status !== 'playing' || untilMove > 0) continue;
    untilMove += BOT_MOVE_MS;
    const move = botMove(state, (moves) => rng.pick(moves));
    if (!move) {
      state = reduceMarbles(state, { type: 'restart' });
      continue;
    }
    state = reduceMarbles(state, { type: 'tap', tube: move.from });
    state = reduceMarbles(state, { type: 'tap', tube: move.to });
  }
  return state;
}
