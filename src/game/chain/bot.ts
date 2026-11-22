// Casual bot of Chaîne de Nombres (docs/PRD.md, AC-108): it starts from the first cell of the board (row by row from
// the top left) that has a neighbour of the same value, extends to the first unused neighbour of the same value
// (neighbours row by row) until none is left or a seeded length limit of 2 to 4 cells is reached, then taps the last
// cell again. It never looks for the longest chain or the biggest number, and never shuffles.
import { CHAIN_CELLS, CHAIN_GUARD_MS, createChain, neighbours, reduceChain } from './engine';
import type { ChainState } from './engine';
import { createRng } from '../rng';

export const BOT_MIN_LENGTH = 2;
export const BOT_MAX_LENGTH = 4;
/** The bot's own generator (length limits) is seeded apart from the board's. */
const BOT_SALT = 0x51ed270b;

/** The cells the bot links on this board, in order, at most `limit` (empty when the board has no pair). */
export function botChain(cells: readonly number[], limit: number): number[] {
  for (let first = 0; first < CHAIN_CELLS; first++) {
    if (!neighbours(first).some((n) => cells[n] === cells[first])) continue;
    const chain = [first];
    while (chain.length < limit) {
      const next = neighbours(chain[chain.length - 1]).find((n) => cells[n] === cells[first] && !chain.includes(n));
      if (next === undefined) break;
      chain.push(next);
    }
    return chain;
  }
  return [];
}

/** Plays a whole round; returns the final state. */
export function playChainBot(seed: number): ChainState {
  const rng = createRng((seed ^ BOT_SALT) >>> 0);
  let state = createChain(seed);
  while (state.status === 'playing') {
    const left = state.chainsLeft;
    const chain = botChain(state.cells, BOT_MIN_LENGTH + rng.int(BOT_MAX_LENGTH - BOT_MIN_LENGTH + 1));
    if (chain.length < BOT_MIN_LENGTH) throw new Error('the board has no pair');
    for (const cell of [...chain, chain[chain.length - 1]]) state = reduceChain(state, { type: 'tap', cell });
    if (state.chainsLeft !== left - 1) throw new Error(`the bot chain was not validated (${left} chains left)`);
    state = reduceChain(state, { type: 'tick', dt: CHAIN_GUARD_MS });
  }
  return state;
}
