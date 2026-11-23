// Casual bot of « Mini Défense » (docs/PRD.md "Mini Défense", AC-115). Before each wave it shops while it can afford
// something: it builds, in the free slot that covers the most path cells (ties: the first one), the next turret of the
// rotation Rapide, Canon, Givre when the gold pays it; else it upgrades the turret covering the most cells that the
// gold can upgrade; else it launches the wave. It plays the real reducer with ticks of 50 ms, up to BOT_WAVE_CAP waves.
import type { UpgradeLevels } from '../contract';
import { coveredCells, createDefense, DefenseState, reduceDefense, SIM_STEP_MS, SLOT_COUNT, TURRETS, TurretKind, upgradeCost } from './engine';

export const BOT_ROTATION: readonly TurretKind[] = ['rapid', 'cannon', 'frost'];
export const BOT_WAVE_CAP = 60;

const COVERAGE: readonly number[] = Array.from({ length: SLOT_COUNT }, (_, slot) => coveredCells(slot).length);
const BY_COVERAGE: readonly number[] = Array.from({ length: SLOT_COUNT }, (_, slot) => slot).sort((a, b) => COVERAGE[b] - COVERAGE[a] || a - b);

export type BotPurchase = { type: 'build'; slot: number; turret: TurretKind } | { type: 'tapSlot'; slot: number };

/** The bot's next purchase, null when it launches the wave. */
export function botPurchase(state: DefenseState): BotPurchase | null {
  const built = state.turrets.filter((t) => t !== null).length;
  const kind = BOT_ROTATION[built % BOT_ROTATION.length];
  const free = BY_COVERAGE.find((slot) => state.turrets[slot] === null);
  if (free !== undefined && state.gold >= TURRETS[kind].cost) return { type: 'build', slot: free, turret: kind };
  const upgradable = BY_COVERAGE.find((slot) => {
    const turret = state.turrets[slot];
    const cost = turret ? upgradeCost(turret.level) : null;
    return cost !== null && state.gold >= cost;
  });
  return upgradable === undefined ? null : { type: 'tapSlot', slot: upgradable };
}

/** Plays a whole round; returns the final state. */
export function playDefenseBot(seed: number, upgrades: UpgradeLevels = {}): DefenseState {
  let state = createDefense(seed, upgrades);
  while (state.status === 'playing' && state.wave <= BOT_WAVE_CAP) {
    for (let bought = 0; bought < 50; bought++) {
      const purchase = botPurchase(state);
      if (purchase === null) break;
      state = reduceDefense(state, purchase);
    }
    state = reduceDefense(state, { type: 'startWave' });
    for (let guard = 0; state.status === 'playing' && state.phase === 'wave' && guard < 100000; guard++) {
      state = reduceDefense(state, { type: 'tick', dt: SIM_STEP_MS });
    }
  }
  return state;
}
