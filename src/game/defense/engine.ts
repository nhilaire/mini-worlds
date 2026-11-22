// « Mini Défense » (docs/PRD.md "Mini Défense", AC-99): a fixed winding path of 20 cells and 6 turret slots beside
// it. Between waves the player builds turrets (50 gold) or upgrades them (40 then 80 gold); « Lancer la vague » sends
// wave w: 4 + 2w enemies of 2 + w health, one every 700 ms, walking one cell every max(250, 500 − 40 × (w − 1)) ms.
// A turret shoots every 600 ms the enemy furthest along the path within 2 cells (Chebyshev). Pure reducer: time only
// comes from `tick`, accumulated and played in fixed steps of 50 ms, so the same total time gives the same state
// whatever the tick grouping. Nothing is random: the seed is kept in the state for the contract only.
import type { BaseEvent, RoundState, UpgradeLevels } from '../contract';

export const START_LIVES = 5;
export const START_GOLD = 120;
export const ARSENAL_GOLD_PER_LEVEL = 20;
export const WAVES = 6;
export const BUILD_COST = 50;
/** Cost of the next action on a slot, by its turret level: build, level 2, level 3. */
export const LEVEL_COSTS = [BUILD_COST, 40, 80] as const;
export const MAX_LEVEL = LEVEL_COSTS.length;
/** Damage per shot of a turret of level 1 / 2 / 3. */
export const LEVEL_DAMAGE = [1, 2, 3] as const;
export const SHOT_INTERVAL_MS = 600;
export const TURRET_RANGE = 2; // Chebyshev distance from the slot to a path cell
export const SPAWN_INTERVAL_MS = 700;
export const STEP_FIRST_MS = 500; // time to walk one cell at wave 1
export const STEP_FASTER_MS = 40; // less per wave
export const STEP_MIN_MS = 250;
export const KILL_POINTS = 10;
export const KILL_GOLD = 8;
export const CLEAN_WAVE_POINTS = 100;
export const LIFE_POINTS = 30;
/** Fixed step of the simulation (ms). */
export const SIM_STEP_MS = 50;

export type Cell = readonly [col: number, row: number];

export const GRID_COLS = 6;
export const GRID_ROWS = 9;

/**
 * The path, from the entrance (top left) to the exit (bottom): an S of 20 cells.
 *
 *   col 0 1 2 3 4 5
 * row 0 > > > > v A      slots: A (5,0)  B (0,2)  C (5,3)  D (0,5)  E (5,8)  F (0,8)
 * row 1 . . . . v .
 * row 2 B . . . v .
 * row 3 . v < < < C
 * row 4 . v . . . .
 * row 5 D v . . . .
 * row 6 . > > > v .
 * row 7 . . . . v .
 * row 8 F . . < < E
 */
export const PATH: readonly Cell[] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
  [4, 0],
  [4, 1],
  [4, 2],
  [4, 3],
  [3, 3],
  [2, 3],
  [1, 3],
  [1, 4],
  [1, 5],
  [1, 6],
  [2, 6],
  [3, 6],
  [4, 6],
  [4, 7],
  [4, 8],
  [3, 8],
];
export const PATH_LENGTH = PATH.length;

/**
 * The 6 turret slots, all on the edges (a slot in the middle would see half of the path). They cover 4, 6, 4, 6, 5
 * and 2 path cells: B and D see two stretches of the path, F hardly anything.
 */
export const SLOTS: readonly Cell[] = [
  [5, 0],
  [0, 2],
  [5, 3],
  [0, 5],
  [5, 8],
  [0, 8],
];
export const SLOT_COUNT = SLOTS.length;

export function inRange(slot: number, cell: number): boolean {
  const [sc, sr] = SLOTS[slot];
  const [pc, pr] = PATH[cell];
  return Math.max(Math.abs(sc - pc), Math.abs(sr - pr)) <= TURRET_RANGE;
}

/** Indexes of the path cells a turret on `slot` can hit. */
export function coveredCells(slot: number): number[] {
  return PATH.map((_, cell) => cell).filter((cell) => inRange(slot, cell));
}

/** SLOT_COVERS[slot][cell]: computed once, read on every shot. */
const SLOT_COVERS: readonly (readonly boolean[])[] = SLOTS.map((_, slot) => PATH.map((__, cell) => inRange(slot, cell)));

/** Wave w (1 to 6): 4 + 2w enemies of 2 + w health, one cell every max(250, 500 − 40 × (w − 1)) ms. */
export function waveEnemies(wave: number): number {
  return 4 + 2 * wave;
}
export function waveHealth(wave: number): number {
  return 2 + wave;
}
export function stepTime(wave: number): number {
  return Math.max(STEP_MIN_MS, STEP_FIRST_MS - STEP_FASTER_MS * (wave - 1));
}

/** Most enemies of a wave (the screen sizes its pools with it). */
export const MAX_WAVE_ENEMIES = waveEnemies(WAVES);
/** Every enemy killed, every wave clean, every life kept: 66 × 10 + 6 × 100 + 5 × 30 = 1 410. */
export const MAX_SCORE = Array.from({ length: WAVES }, (_, i) => waveEnemies(i + 1) * KILL_POINTS + CLEAN_WAVE_POINTS).reduce((a, b) => a + b, 0) + START_LIVES * LIFE_POINTS;

/** Cost of the next action on a slot of this level (0: build), null at the last level. */
export function nextCost(level: number): number | null {
  return LEVEL_COSTS[level] ?? null;
}

export type Enemy = {
  /** Rank in its wave, from 0: unique within the wave. */
  id: number;
  /** Index of its path cell. */
  cell: number;
  /** Time already walked towards the next cell (ms, below the step time of the wave). */
  moveMs: number;
  hp: number;
};

export type DefenseEvent =
  | BaseEvent
  /** A turret was built on `slot` (level 1) or upgraded to `level`. */
  | { kind: 'build'; slot: number; level: number; cost: number }
  /** A tap that did nothing for lack of gold. */
  | { kind: 'refused'; slot: number }
  | { kind: 'wave'; wave: number }
  | { kind: 'spawn'; id: number }
  /** The turret of `slot` hit enemy `id` standing on `cell`. */
  | { kind: 'shot'; slot: number; id: number; cell: number; damage: number }
  | { kind: 'kill'; id: number; cell: number }
  | { kind: 'leak'; id: number }
  /** The wave is over: `clean` when nothing leaked (+100). */
  | { kind: 'cleared'; wave: number; clean: boolean };

export type DefensePhase = 'plan' | 'wave';

export type DefenseState = RoundState<DefenseEvent> & {
  seed: number;
  /** Current wave, 1 to 6: the one being planned or fought. */
  wave: number;
  phase: DefensePhase;
  lives: number;
  gold: number;
  /** Turret level of each slot: 0 (empty) to 3. */
  turrets: readonly number[];
  /** Time before each turret may shoot again (ms); 0: ready. */
  cooldowns: readonly number[];
  /** Enemies on the path, oldest first (so the furthest along first). */
  enemies: readonly Enemy[];
  /** Enemies of the wave already sent. */
  spawned: number;
  /** Time before the next enemy enters (ms). */
  spawnMs: number;
  /** Enemies of this wave that left the path. */
  leaked: number;
  /** Time received from `tick` and not yet played (ms, below 50). */
  carryMs: number;
};

export type DefenseAction = { type: 'tapSlot'; slot: number } | { type: 'startWave' } | { type: 'tick'; dt: number };

export function createDefense(seed: number, upgrades: UpgradeLevels = {}): DefenseState {
  return {
    score: 0,
    combos: 0,
    status: 'playing',
    events: [],
    seed: seed >>> 0,
    wave: 1,
    phase: 'plan',
    lives: START_LIVES,
    gold: START_GOLD + ARSENAL_GOLD_PER_LEVEL * (upgrades.arsenal ?? 0),
    turrets: SLOTS.map(() => 0),
    cooldowns: SLOTS.map(() => 0),
    enemies: [],
    spawned: 0,
    spawnMs: 0,
    leaked: 0,
    carryMs: 0,
  };
}

const quiet = (state: DefenseState): DefenseState => (state.events.length === 0 ? state : { ...state, events: [] });

/** Builds on an empty slot or upgrades its turret; ignored during a wave, at level 3 or when gold is short. */
function tapSlot(state: DefenseState, slot: number): DefenseState {
  if (state.phase !== 'plan' || !Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT) return quiet(state);
  const cost = nextCost(state.turrets[slot]);
  if (cost === null) return quiet(state);
  if (state.gold < cost) return { ...state, events: [{ kind: 'refused', slot }] };
  const level = state.turrets[slot] + 1;
  return { ...state, gold: state.gold - cost, turrets: state.turrets.map((l, i) => (i === slot ? level : l)), events: [{ kind: 'build', slot, level, cost }] };
}

function startWave(state: DefenseState): DefenseState {
  if (state.phase !== 'plan') return quiet(state);
  // Every turret is ready and the first enemy enters with the first step.
  return { ...state, phase: 'wave', enemies: [], spawned: 0, spawnMs: 0, leaked: 0, carryMs: 0, cooldowns: SLOTS.map(() => 0), events: [{ kind: 'wave', wave: state.wave }] };
}

/** Working copy of the fields a wave changes, private to one `tick`. */
type Work = { score: number; combos: number; status: DefenseState['status']; wave: number; phase: DefensePhase; lives: number; gold: number; cooldowns: number[]; enemies: Enemy[]; spawned: number; spawnMs: number; leaked: number; events: DefenseEvent[] };

/**
 * One step of 50 ms of a wave, in this order: the enemies walk (a step past the last cell is a leak), the next enemy
 * enters, then the turrets shoot in slot order (a turret that is ready waits for a target without losing its shot).
 * Mutates its working copy `w`; returns false when the wave or the round ended.
 */
function step(w: Work, turrets: readonly number[]): boolean {
  const stepMs = stepTime(w.wave);
  // 1. Walk.
  const walking: Enemy[] = [];
  for (const enemy of w.enemies) {
    let { cell, moveMs } = enemy;
    moveMs += SIM_STEP_MS;
    if (moveMs >= stepMs) {
      moveMs -= stepMs;
      cell += 1;
    }
    if (cell >= PATH_LENGTH) {
      w.lives -= 1;
      w.leaked += 1;
      w.events.push({ kind: 'leak', id: enemy.id });
    } else walking.push({ ...enemy, cell, moveMs });
  }
  w.enemies = walking;
  if (w.lives <= 0) {
    w.lives = 0;
    w.status = 'over';
    w.events.push({ kind: 'over', score: w.score });
    return false;
  }
  // 2. Spawn.
  if (w.spawned < waveEnemies(w.wave)) {
    if (w.spawnMs <= 0) {
      w.enemies.push({ id: w.spawned, cell: 0, moveMs: 0, hp: waveHealth(w.wave) });
      w.events.push({ kind: 'spawn', id: w.spawned });
      w.spawned += 1;
      w.spawnMs = SPAWN_INTERVAL_MS;
    }
    w.spawnMs -= SIM_STEP_MS;
  }
  // 3. Shoot: the enemy furthest along the path within range (enemies are kept oldest first, all at the same speed).
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const level = turrets[slot];
    if (level === 0) continue;
    w.cooldowns[slot] = Math.max(0, w.cooldowns[slot] - SIM_STEP_MS);
    if (w.cooldowns[slot] > 0) continue;
    const index = w.enemies.findIndex((e) => SLOT_COVERS[slot][e.cell]);
    if (index < 0) continue;
    const target = w.enemies[index];
    const damage = LEVEL_DAMAGE[level - 1];
    w.cooldowns[slot] = SHOT_INTERVAL_MS;
    w.events.push({ kind: 'shot', slot, id: target.id, cell: target.cell, damage });
    if (target.hp > damage) w.enemies[index] = { ...target, hp: target.hp - damage };
    else {
      w.enemies.splice(index, 1);
      w.score += KILL_POINTS;
      w.gold += KILL_GOLD;
      w.events.push({ kind: 'kill', id: target.id, cell: target.cell }, { kind: 'score', points: KILL_POINTS });
    }
  }
  // 4. End of the wave: every enemy sent and none left on the path.
  if (w.spawned < waveEnemies(w.wave) || w.enemies.length > 0) return true;
  const clean = w.leaked === 0;
  w.events.push({ kind: 'cleared', wave: w.wave, clean });
  if (clean) {
    w.score += CLEAN_WAVE_POINTS;
    w.combos += 1;
    w.events.push({ kind: 'score', points: CLEAN_WAVE_POINTS }, { kind: 'combo' });
  }
  w.phase = 'plan';
  if (w.wave >= WAVES) {
    const bonus = LIFE_POINTS * w.lives;
    w.score += bonus;
    w.status = 'over';
    w.events.push({ kind: 'score', points: bonus }, { kind: 'over', score: w.score });
  } else w.wave += 1;
  return false;
}

/** Plays the whole steps held by the carried time plus `dt`; the time left when the wave ends is dropped. */
function tick(state: DefenseState, dt: number): DefenseState {
  if (state.phase !== 'wave' || !(dt > 0)) return quiet(state);
  let carryMs = state.carryMs + dt;
  if (carryMs < SIM_STEP_MS) return { ...state, carryMs, events: [] };
  const w: Work = {
    score: state.score,
    combos: state.combos,
    status: state.status,
    wave: state.wave,
    phase: state.phase,
    lives: state.lives,
    gold: state.gold,
    cooldowns: state.cooldowns.slice(),
    enemies: state.enemies.slice(),
    spawned: state.spawned,
    spawnMs: state.spawnMs,
    leaked: state.leaked,
    events: [],
  };
  let running = true;
  while (running && carryMs >= SIM_STEP_MS) {
    carryMs -= SIM_STEP_MS;
    running = step(w, state.turrets);
  }
  return { ...state, ...w, carryMs: running ? carryMs : 0 };
}

export function reduceDefense(state: DefenseState, action: DefenseAction): DefenseState {
  if (state.status !== 'playing') return state;
  switch (action.type) {
    case 'tick':
      return tick(state, action.dt);
    case 'tapSlot':
      return tapSlot(state, action.slot);
    case 'startWave':
      return startWave(state);
  }
}
