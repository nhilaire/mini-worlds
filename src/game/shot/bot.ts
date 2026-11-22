// Casual bot of Tir Parfait (docs/PRD.md, AC-108): it never solves the parabola. It keeps one rule of thumb, « my
// current setting lands about there », taken from where its last shot really landed (the default setting is said to
// land about 30 m away), and corrects before each shot: one power step per 15 m of error (short → more, long →
// less); when the error is smaller than half a step, one angle step instead (long → 5° higher, short → 5° lower down
// to 45°), counted as 6 m. A shot stopped by the wall → 5° higher. The wind is ignored: it only shows in where the
// next shot lands. It plays the real reducer (one-step settings, fire, then 50 ms ticks through the flight and the
// finished-target pause).
import { ANGLE_MAX, ANGLE_STEP, acceptsInput, createShot, POWER_MAX, POWER_MIN, reduceShot, SHOT_BANDS, ShotState, START_ANGLE } from './engine';

const FRAME_MS = 50;
/** Rule of thumb: the starting setting (45°, power 5) lands about this far (m). */
export const START_ESTIMATE = 30;
/** Rule of thumb: one power step moves the landing point by about this much (m). */
export const POWER_STEP_M = 15;
/** Rule of thumb: one angle step above 45° moves the landing point by about this much (m). */
export const ANGLE_STEP_M = 6;

export type Aim = { angle: number; power: number; estimate: number };

/** The setting the bot wants for a target `distance` metres away, from its current setting and landing estimate. */
export function correctAim(aim: Aim, distance: number): Aim {
  const error = aim.estimate - distance;
  if (Math.abs(error) <= SHOT_BANDS[0].within) return aim;
  const power = Math.max(POWER_MIN, Math.min(POWER_MAX, aim.power - Math.round(error / POWER_STEP_M)));
  if (power !== aim.power) return { ...aim, power, estimate: aim.estimate + (power - aim.power) * POWER_STEP_M };
  if (error > 0 && aim.angle < ANGLE_MAX) return { ...aim, angle: aim.angle + ANGLE_STEP, estimate: aim.estimate - ANGLE_STEP_M };
  if (error < 0 && aim.angle > START_ANGLE) return { ...aim, angle: aim.angle - ANGLE_STEP, estimate: aim.estimate + ANGLE_STEP_M };
  return aim;
}

/** Plays a whole round with the casual policy; returns the final state. */
export function playShotBot(seed: number, upgrades: Readonly<Record<string, number>> = {}): ShotState {
  let state = createShot(seed, upgrades);
  let aim: Aim = { angle: state.angle, power: state.power, estimate: START_ESTIMATE };
  // One correction per shot: `planned` is true once the setting of the coming shot is decided.
  let planned = false;
  for (let step = 0; step < 10_000 && state.status === 'playing'; step++) {
    if (!acceptsInput(state)) {
      const flying = state.flight;
      const target = state.target;
      state = reduceShot(state, { type: 'tick', dt: FRAME_MS });
      // The shot just landed: the bot learns where its setting lands (or lobs higher after the wall).
      if (flying !== null && state.flight === null) {
        aim = flying.blocked ? { ...aim, angle: Math.min(ANGLE_MAX, aim.angle + ANGLE_STEP) } : { ...aim, estimate: flying.landing };
        planned = flying.blocked;
      }
      if (state.target !== target) planned = false;
      continue;
    }
    if (!planned) {
      aim = correctAim(aim, state.distance);
      planned = true;
    }
    if (state.angle !== aim.angle) state = reduceShot(state, { type: 'angle', step: aim.angle > state.angle ? 1 : -1 });
    else if (state.power !== aim.power) state = reduceShot(state, { type: 'power', step: aim.power > state.power ? 1 : -1 });
    else state = reduceShot(state, { type: 'fire' });
  }
  return state;
}
