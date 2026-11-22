// Casual bot of « Mini Défense » (docs/PRD.md AC-108). Before each wave it shops while it can afford something: it
// builds on the empty slot that covers the most path cells (ties: the first one), else upgrades the first turret it
// can afford. Half of its purchases are poor choices instead (seeded): any affordable slot at random. After its
// first purchase of a planning phase it may also lose patience (seeded, 4 times in 10 before each further purchase)
// and launch the wave with its gold unspent. It plays the real reducer with ticks of 50 ms.
import type { UpgradeLevels } from '../contract';
import { createRng } from '../rng';
import { coveredCells, createDefense, DefenseState, nextCost, reduceDefense, SIM_STEP_MS, SLOT_COUNT } from './engine';

export const BOT_POOR_CHANCE = 0.5;
export const BOT_IMPATIENT_CHANCE = 0.4;

const COVERAGE: readonly number[] = Array.from({ length: SLOT_COUNT }, (_, slot) => coveredCells(slot).length);

/** Slots whose next action (build or upgrade) the gold can pay. */
export function affordableSlots(state: DefenseState): number[] {
  return state.turrets.flatMap((level, slot) => {
    const cost = nextCost(level);
    return cost !== null && state.gold >= cost ? [slot] : [];
  });
}

/** The sensible purchase: the empty slot covering the most cells, else the first turret to upgrade; null: nothing. */
export function botSlot(state: DefenseState): number | null {
  const affordable = affordableSlots(state);
  if (affordable.length === 0) return null;
  const empty = affordable.filter((slot) => state.turrets[slot] === 0);
  if (empty.length === 0) return affordable[0];
  return empty.reduce((best, slot) => (COVERAGE[slot] > COVERAGE[best] ? slot : best));
}

/** Plays a whole round; returns the final state. */
export function playDefenseBot(seed: number, upgrades: UpgradeLevels = {}): DefenseState {
  const rng = createRng((seed ^ 0x5bd1e995) >>> 0);
  let state = createDefense(seed, upgrades);
  for (let wave = 0; state.status === 'playing' && wave < 100; wave++) {
    for (let bought = 0; bought < 100; bought++) {
      const affordable = affordableSlots(state);
      const sensible = botSlot(state);
      if (sensible === null) break;
      if (bought > 0 && rng.next() < BOT_IMPATIENT_CHANCE) break;
      const slot = rng.next() < BOT_POOR_CHANCE ? rng.pick(affordable) : sensible;
      state = reduceDefense(state, { type: 'tapSlot', slot });
    }
    state = reduceDefense(state, { type: 'startWave' });
    for (let guard = 0; state.status === 'playing' && state.phase === 'wave' && guard < 100000; guard++) {
      state = reduceDefense(state, { type: 'tick', dt: SIM_STEP_MS });
    }
  }
  return state;
}
