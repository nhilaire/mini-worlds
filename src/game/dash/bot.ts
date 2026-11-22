// Casual bot of « Couleur Éclair » (docs/PRD.md AC-108): at every gate it looks at the doors for a reaction time,
// then steers to the door of its colour - or, with a seeded error chance that grows as the gates come faster (5 % at
// 2 200 ms up to 30 % at 900 ms), to one of the two other lanes - and waits for the gate (no lookahead).
import type { UpgradeLevels } from '../contract';
import { createRng } from '../rng';
import { APPROACH_FIRST_MS, APPROACH_MIN_MS, approachTime, colourLane, createDash, DashState, Lane, LANES, reduceDash } from './engine';

export const BOT_REACTION_MS = 500;
/** Error chance at the slowest approach (gate 1) and at the fastest one (gate 45 on); linear in between. */
export const BOT_ERROR_SLOW = 0.05;
export const BOT_ERROR_FAST = 0.3;

export function botErrorChance(gate: number): number {
  const speed = (APPROACH_FIRST_MS - approachTime(gate)) / (APPROACH_FIRST_MS - APPROACH_MIN_MS);
  return BOT_ERROR_SLOW + (BOT_ERROR_FAST - BOT_ERROR_SLOW) * speed;
}

/** The lane the bot takes: its colour when `roll` is above the error chance, else a wrong lane chosen by `pick`. */
export function botLane(state: DashState, roll: number, pick: number): Lane {
  const right = colourLane(state);
  if (roll >= botErrorChance(state.passed + 1)) return right;
  const wrong = LANES.filter((lane) => lane !== right);
  return wrong[Math.min(wrong.length - 1, Math.floor(pick * wrong.length))];
}

/** Plays a whole round; returns the final state. */
export function playDashBot(seed: number, upgrades: UpgradeLevels = {}): DashState {
  const rng = createRng((seed ^ 0x5bd1e995) >>> 0);
  let state = createDash(seed, upgrades);
  for (let guard = 0; state.status === 'playing' && guard < 1000; guard++) {
    state = reduceDash(state, { type: 'tick', dt: BOT_REACTION_MS });
    state = reduceDash(state, { type: 'steer', lane: botLane(state, rng.next(), rng.next()) });
    state = reduceDash(state, { type: 'tick', dt: state.approachMs });
  }
  return state;
}
