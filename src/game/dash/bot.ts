// Casual bot of « Couleur Éclair » (docs/PRD.md "Couleur Éclair", AC-115): at every gate it needs a seeded reaction
// time (700 to 1 100 ms) to see the doors; when the approach lasts at least that long it steers to the door of its
// colour, else it stays in its lane and waits for the gate (no lookahead). As the gates come faster it loses lives.
import type { UpgradeLevels } from '../contract';
import { createRng } from '../rng';
import { colourLane, createDash, DashState, Lane, reduceDash } from './engine';

export const BOT_REACTION_MIN_MS = 700;
export const BOT_REACTION_MAX_MS = 1100;
/** Safety cap of a bot round (gates); a round always ends long before. */
export const BOT_GATE_CAP = 1000;

/** The lane the bot takes for a reaction time: its colour when the approach leaves time to react, else its own lane. */
export function botLane(state: DashState, reactionMs: number): Lane {
  return state.approachMs >= reactionMs ? colourLane(state) : state.lane;
}

/** Plays a whole round; returns the final state. */
export function playDashBot(seed: number, upgrades: UpgradeLevels = {}): DashState {
  const rng = createRng((seed ^ 0x5bd1e995) >>> 0);
  let state = createDash(seed, upgrades);
  for (let guard = 0; state.status === 'playing' && guard < BOT_GATE_CAP; guard++) {
    const reaction = BOT_REACTION_MIN_MS + Math.floor(rng.next() * (BOT_REACTION_MAX_MS - BOT_REACTION_MIN_MS + 1));
    const lane = botLane(state, reaction);
    if (lane !== state.lane) {
      state = reduceDash(state, { type: 'tick', dt: reaction });
      state = reduceDash(state, { type: 'steer', lane });
    }
    state = reduceDash(state, { type: 'tick', dt: state.approachMs });
  }
  return state;
}
