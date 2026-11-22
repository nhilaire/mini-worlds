// Casual bot of « Lancer de Cible » (docs/PRD.md AC-108): after each dart it takes a reaction time, then throws at
// the first moment the place where it expects the dart to land is at least the bounce angle plus a safety margin
// away from every dart on the target. It anticipates the 120 ms flight, but with a seeded timing error drawn for
// each dart (it sees the target a little early or late), which costs more degrees as the target turns faster. It
// loses patience: the safety margin shrinks while it waits, and it throws anyway when no place was found for long.
// It plays the real reducer with small ticks.
import type { UpgradeLevels } from '../contract';
import { angularDistance, normalize } from '../candles/engine';
import { createRng } from '../rng';
import { bounceAngle, createDarts, DartsState, FLIGHT_MS, reduceDarts, rotationAt } from './engine';

export const BOT_TICK_MS = 10;
export const BOT_REACTION_MS = 350;
/** The timing error of a throw is uniform in ± this (ms). */
export const BOT_TIMING_ERROR_MS = 110;
/** Safety margin on top of the bounce angle (°), when the bot starts aiming. */
export const BOT_MARGIN = 5;
/** The margin is down to 0 after this long without a throw (ms); after twice this long the bot throws anyway. */
export const BOT_PATIENCE_MS = 4000;

/** Safety margin after `waitedMs` of aiming: from 5° down to 0° at 4 s. */
export function botMargin(waitedMs: number): number {
  return BOT_MARGIN * Math.max(0, 1 - waitedMs / BOT_PATIENCE_MS);
}

/** Target angle where the bot expects a dart thrown now to land, its timing being off by `errorMs`. */
export function botExpectedAngle(state: DartsState, errorMs: number): number {
  return normalize(-rotationAt(state.level, state.levelMs + FLIGHT_MS + errorMs));
}

/** The bot throws now: the expected landing place is clear of every dart by the bounce angle + `margin`. */
export function botThrows(state: DartsState, errorMs: number, margin: number): boolean {
  const angle = botExpectedAngle(state, errorMs);
  const clear = bounceAngle(state.steadyLevel) + margin;
  return state.darts.every((d) => angularDistance(d.angle, angle) >= clear);
}

/** Plays a whole round; returns the final state. */
export function playDartsBot(seed: number, upgrades: UpgradeLevels = {}): DartsState {
  const rng = createRng((seed ^ 0x5bd1e995) >>> 0);
  let state = createDarts(seed, upgrades);
  let waitedMs = -BOT_REACTION_MS;
  let errorMs = (rng.next() * 2 - 1) * BOT_TIMING_ERROR_MS;
  // 68 darts and 2 bounces at most 8.5 s apart, plus the pauses: far below the guard.
  for (let guard = 0; state.status === 'playing' && guard < 200000; guard++) {
    const idle = state.flightMs === 0 && state.pauseMs === 0;
    if (idle && waitedMs >= 0 && (waitedMs >= 2 * BOT_PATIENCE_MS || botThrows(state, errorMs, botMargin(waitedMs)))) {
      state = reduceDarts(state, { type: 'throw' });
      waitedMs = -BOT_REACTION_MS;
      errorMs = (rng.next() * 2 - 1) * BOT_TIMING_ERROR_MS;
    }
    const busy = state.flightMs > 0 || state.pauseMs > 0;
    state = reduceDarts(state, { type: 'tick', dt: BOT_TICK_MS });
    // The reaction time starts when the dart has landed and the target is there.
    if (!busy) waitedMs += BOT_TICK_MS;
  }
  return state;
}
