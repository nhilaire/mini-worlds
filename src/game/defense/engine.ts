// « Mini Défense » (docs/PRD.md "Mini Défense", AC-99, v0.4.0 phone test): a fixed winding path of 20 cells and 6
// turret slots beside it. Between waves the player builds one of three turrets on an empty slot (Rapide 40, Canon 70,
// Givre 50 gold) or upgrades a turret (40 then 80 gold; level L multiplies its damage by L); « Lancer la vague » sends
// the next wave. Waves follow one another without end: the round ends when no life is left.
//
// Wave w: min(30, 4 + 2w) enemies, one every 700 ms, drawn (seeded) among normal, rapide and blindé enemies, with
// H(w) = round(3 × 1.25^(w − 1)) health and one cell every S(w) = max(250, 500 − 40 × (w − 1)) ms for a normal one.
// Every turret shoots the enemy furthest along the path within 2 cells (Chebyshev). Pure reducer: time only comes from
// `tick`, accumulated and played in fixed steps of 50 ms, so the same total time gives the same state whatever the
// tick grouping; the enemy draw uses the seeded generator kept in the state.
//
// Rule readings (noted here): « furthest along » = the highest path cell, then the most of its step walked, then the
// oldest; the Canon also hits every enemy standing on the target's cell and on the path cells just before and after
// it; a slowed enemy walks at half speed (its walked time grows by 25 ms per 50 ms step); a slow hit while already
// slowed restarts the 1 500 ms.
import type { BaseEvent, RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';

export const START_LIVES = 5;
export const START_GOLD = 100;
export const ARSENAL_GOLD_PER_LEVEL = 20;
/** Cost of the upgrade to level 2 and to level 3. */
export const UPGRADE_COSTS = [40, 80] as const;
export const MAX_LEVEL = 3;
export const TURRET_RANGE = 2; // Chebyshev distance from the slot to a path cell
export const SPAWN_INTERVAL_MS = 700;
export const STEP_FIRST_MS = 500; // time for a normal enemy to walk one cell at wave 1
export const STEP_FASTER_MS = 40; // less per wave
export const STEP_MIN_MS = 250;
export const MAX_WAVE_ENEMIES = 30;
export const CLEAN_WAVE_POINTS = 100;
export const CLEAN_WAVE_GOLD = 20;
/** A slowed enemy walks twice slower for this long. */
export const SLOW_MS = 1500;
/** Fixed step of the simulation (ms). */
export const SIM_STEP_MS = 50;

export type TurretKind = 'rapid' | 'cannon' | 'frost';
export const TURRET_KINDS: readonly TurretKind[] = ['rapid', 'cannon', 'frost'];
export type TurretDef = { cost: number; damage: number; intervalMs: number; splash: boolean; slows: boolean };
export const TURRETS: Readonly<Record<TurretKind, TurretDef>> = {
  rapid: { cost: 40, damage: 1, intervalMs: 400, splash: false, slows: false },
  cannon: { cost: 70, damage: 3, intervalMs: 1500, splash: true, slows: false },
  frost: { cost: 50, damage: 1, intervalMs: 1000, splash: false, slows: true },
};

export type EnemyKind = 'normal' | 'fast' | 'armoured';
export type EnemyDef = { points: number; gold: number };
export const ENEMIES: Readonly<Record<EnemyKind, EnemyDef>> = {
  normal: { points: 10, gold: 6 },
  fast: { points: 10, gold: 6 },
  armoured: { points: 20, gold: 12 },
};
/** A blindé's armour removes this much damage from every hit. */
export const ARMOUR = 1;

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

/** Wave w: min(30, 4 + 2w) enemies. */
export function waveEnemies(wave: number): number {
  return Math.min(MAX_WAVE_ENEMIES, 4 + 2 * wave);
}
/** H(w) = round(3 × 1.25^(w − 1)): health of a normal enemy. */
export function waveHealth(wave: number): number {
  return Math.round(3 * 1.25 ** (wave - 1));
}
/** S(w) = max(250, 500 − 40 × (w − 1)): time for a normal enemy to walk one cell. */
export function stepTime(wave: number): number {
  return Math.max(STEP_MIN_MS, STEP_FIRST_MS - STEP_FASTER_MS * (wave - 1));
}
/** Health and step time of an enemy of this kind in wave w. */
export function enemyStats(kind: EnemyKind, wave: number): { hp: number; stepMs: number } {
  const hp = waveHealth(wave);
  const stepMs = stepTime(wave);
  if (kind === 'fast') return { hp: Math.ceil(hp / 2), stepMs: Math.round((0.6 * stepMs) / 10) * 10 };
  if (kind === 'armoured') return { hp: 2 * hp, stepMs: Math.round((1.4 * stepMs) / 10) * 10 };
  return { hp, stepMs };
}
/** Chances of a rapide and of a blindé in wave w: none before waves 3 and 4. */
export function kindChances(wave: number): { fast: number; armoured: number } {
  return { fast: wave >= 3 ? Math.min(0.4, 0.1 * (wave - 2)) : 0, armoured: wave >= 4 ? Math.min(0.3, 0.1 * (wave - 3)) : 0 };
}
/** The kind drawn from u in [0, 1). */
export function kindFor(wave: number, u: number): EnemyKind {
  const { fast, armoured } = kindChances(wave);
  if (u < fast) return 'fast';
  if (u < fast + armoured) return 'armoured';
  return 'normal';
}

/** Damage a hit of `damage` deals to an enemy of this kind (a blindé loses ARMOUR, never below 0). */
export function hitDamage(kind: EnemyKind, damage: number): number {
  return kind === 'armoured' ? Math.max(0, damage - ARMOUR) : damage;
}

/** Cost of the upgrade of a turret of this level, null at the last level. */
export function upgradeCost(level: number): number | null {
  return level >= 1 && level < MAX_LEVEL ? UPGRADE_COSTS[level - 1] : null;
}

export type Turret = { kind: TurretKind; level: number };

export type Enemy = {
  /** Rank in its wave, from 0: unique within the wave. */
  id: number;
  kind: EnemyKind;
  /** Index of its path cell. */
  cell: number;
  /** Time already walked towards the next cell (ms, below its step time). */
  moveMs: number;
  /** Time to walk one cell (ms) at full speed. */
  stepMs: number;
  hp: number;
  maxHp: number;
  /** Time left walking at half speed (ms). */
  slowMs: number;
};

export type DefenseEvent =
  | BaseEvent
  /** A turret of `kind` was built on `slot` (level 1) or upgraded to `level`. */
  | { kind: 'build'; slot: number; turret: TurretKind; level: number; cost: number }
  /** A build or an upgrade refused for lack of gold. */
  | { kind: 'refused'; slot: number }
  | { kind: 'wave'; wave: number }
  | { kind: 'spawn'; id: number; enemy: EnemyKind }
  /** The turret of `slot` hit enemy `id` standing on `cell` (the main target of a Canon shot). */
  | { kind: 'shot'; slot: number; id: number; cell: number; damage: number }
  | { kind: 'kill'; id: number; cell: number }
  | { kind: 'leak'; id: number }
  /** The wave is over: `clean` when nothing leaked (+100 points, +20 gold). */
  | { kind: 'cleared'; wave: number; clean: boolean };

export type DefensePhase = 'plan' | 'wave';

export type DefenseState = RoundState<DefenseEvent> & {
  seed: number;
  /** Current wave, 1, 2, 3...: the one being planned or fought. */
  wave: number;
  phase: DefensePhase;
  lives: number;
  gold: number;
  /** The turret of each slot, null when empty. */
  turrets: readonly (Turret | null)[];
  /** Time before each turret may shoot again (ms); 0: ready. */
  cooldowns: readonly number[];
  /** Enemies on the path, in the order they entered. */
  enemies: readonly Enemy[];
  /** Enemies of the wave already sent. */
  spawned: number;
  /** Time before the next enemy enters (ms). */
  spawnMs: number;
  /** Enemies of this wave that left the path. */
  leaked: number;
  /** Time received from `tick` and not yet played (ms, below 50). */
  carryMs: number;
  rngState: number;
};

export type DefenseAction =
  | { type: 'build'; slot: number; turret: TurretKind }
  /** Upgrades the turret of the slot (an empty slot opens the picker on screen: nothing changes here). */
  | { type: 'tapSlot'; slot: number }
  | { type: 'startWave' }
  | { type: 'tick'; dt: number };

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
    turrets: SLOTS.map(() => null),
    cooldowns: SLOTS.map(() => 0),
    enemies: [],
    spawned: 0,
    spawnMs: 0,
    leaked: 0,
    carryMs: 0,
    rngState: seed >>> 0,
  };
}

const quiet = (state: DefenseState): DefenseState => (state.events.length === 0 ? state : { ...state, events: [] });
const validSlot = (slot: number): boolean => Number.isInteger(slot) && slot >= 0 && slot < SLOT_COUNT;

/** Builds a turret on an empty slot; ignored during a wave or on a taken slot, refused when gold is short. */
function build(state: DefenseState, slot: number, turret: TurretKind): DefenseState {
  if (state.phase !== 'plan' || !validSlot(slot) || state.turrets[slot] !== null || !(turret in TURRETS)) return quiet(state);
  const { cost } = TURRETS[turret];
  if (state.gold < cost) return { ...state, events: [{ kind: 'refused', slot }] };
  return {
    ...state,
    gold: state.gold - cost,
    turrets: state.turrets.map((t, i) => (i === slot ? { kind: turret, level: 1 } : t)),
    events: [{ kind: 'build', slot, turret, level: 1, cost }],
  };
}

/** Upgrades the turret of a slot; ignored during a wave, on an empty slot or at level 3, refused when gold is short. */
function upgrade(state: DefenseState, slot: number): DefenseState {
  if (state.phase !== 'plan' || !validSlot(slot)) return quiet(state);
  const turret = state.turrets[slot];
  const cost = turret ? upgradeCost(turret.level) : null;
  if (!turret || cost === null) return quiet(state);
  if (state.gold < cost) return { ...state, events: [{ kind: 'refused', slot }] };
  const level = turret.level + 1;
  return {
    ...state,
    gold: state.gold - cost,
    turrets: state.turrets.map((t, i) => (i === slot ? { kind: turret.kind, level } : t)),
    events: [{ kind: 'build', slot, turret: turret.kind, level, cost }],
  };
}

function startWave(state: DefenseState): DefenseState {
  if (state.phase !== 'plan') return quiet(state);
  // Every turret is ready and the first enemy enters with the first step.
  return { ...state, phase: 'wave', enemies: [], spawned: 0, spawnMs: 0, leaked: 0, carryMs: 0, cooldowns: SLOTS.map(() => 0), events: [{ kind: 'wave', wave: state.wave }] };
}

/** Progress of an enemy along the path, for « furthest along »: its cell plus the share of its step walked. */
export const progressOf = (e: Pick<Enemy, 'cell' | 'moveMs' | 'stepMs'>): number => e.cell + e.moveMs / e.stepMs;

/** Index of the target of a turret: the enemy in range furthest along the path (ties: the oldest), -1 when none. */
function targetOf(enemies: readonly Enemy[], slot: number): number {
  let best = -1;
  for (let i = 0; i < enemies.length; i++) {
    if (!SLOT_COVERS[slot][enemies[i].cell]) continue;
    if (best < 0 || progressOf(enemies[i]) > progressOf(enemies[best])) best = i;
  }
  return best;
}

/** Working copy of the fields a wave changes, private to one `tick`. */
type Work = {
  score: number;
  combos: number;
  status: DefenseState['status'];
  wave: number;
  phase: DefensePhase;
  lives: number;
  gold: number;
  cooldowns: number[];
  enemies: Enemy[];
  spawned: number;
  spawnMs: number;
  leaked: number;
  rngState: number;
  events: DefenseEvent[];
};

/**
 * One step of 50 ms of a wave, in this order: the enemies walk (a step past the last cell is a leak), the next enemy
 * enters, then the turrets shoot in slot order (a turret that is ready waits for a target without losing its shot).
 * Mutates its working copy `w`; returns false when the wave or the round ended.
 */
function step(w: Work, turrets: readonly (Turret | null)[]): boolean {
  // 1. Walk (half speed while slowed).
  const walking: Enemy[] = [];
  for (const enemy of w.enemies) {
    let { cell, moveMs, slowMs } = enemy;
    moveMs += slowMs > 0 ? SIM_STEP_MS / 2 : SIM_STEP_MS;
    slowMs = Math.max(0, slowMs - SIM_STEP_MS);
    if (moveMs >= enemy.stepMs) {
      moveMs -= enemy.stepMs;
      cell += 1;
    }
    if (cell >= PATH_LENGTH) {
      w.lives -= 1;
      w.leaked += 1;
      w.events.push({ kind: 'leak', id: enemy.id });
    } else walking.push({ ...enemy, cell, moveMs, slowMs });
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
      const rng = createRng(w.rngState);
      const kind = kindFor(w.wave, rng.next());
      w.rngState = rng.state();
      const { hp, stepMs } = enemyStats(kind, w.wave);
      w.enemies.push({ id: w.spawned, kind, cell: 0, moveMs: 0, stepMs, hp, maxHp: hp, slowMs: 0 });
      w.events.push({ kind: 'spawn', id: w.spawned, enemy: kind });
      w.spawned += 1;
      w.spawnMs = SPAWN_INTERVAL_MS;
    }
    w.spawnMs -= SIM_STEP_MS;
  }
  // 3. Shoot.
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const turret = turrets[slot];
    if (!turret) continue;
    w.cooldowns[slot] = Math.max(0, w.cooldowns[slot] - SIM_STEP_MS);
    if (w.cooldowns[slot] > 0) continue;
    const index = targetOf(w.enemies, slot);
    if (index < 0) continue;
    const def = TURRETS[turret.kind];
    const damage = def.damage * turret.level;
    const target = w.enemies[index];
    w.cooldowns[slot] = def.intervalMs;
    w.events.push({ kind: 'shot', slot, id: target.id, cell: target.cell, damage });
    const hit = new Set<number>(def.splash ? w.enemies.flatMap((e, i) => (Math.abs(e.cell - target.cell) <= 1 ? [i] : [])) : [index]);
    const survivors: Enemy[] = [];
    w.enemies.forEach((enemy, i) => {
      if (!hit.has(i)) {
        survivors.push(enemy);
        return;
      }
      const hp = enemy.hp - hitDamage(enemy.kind, damage);
      if (hp > 0) {
        survivors.push({ ...enemy, hp, slowMs: def.slows ? SLOW_MS : enemy.slowMs });
        return;
      }
      const reward = ENEMIES[enemy.kind];
      w.score += reward.points;
      w.gold += reward.gold;
      w.events.push({ kind: 'kill', id: enemy.id, cell: enemy.cell }, { kind: 'score', points: reward.points });
    });
    w.enemies = survivors;
  }
  // 4. End of the wave: every enemy sent and none left on the path; the next wave is planned.
  if (w.spawned < waveEnemies(w.wave) || w.enemies.length > 0) return true;
  const clean = w.leaked === 0;
  w.events.push({ kind: 'cleared', wave: w.wave, clean });
  if (clean) {
    w.score += CLEAN_WAVE_POINTS;
    w.gold += CLEAN_WAVE_GOLD;
    w.combos += 1;
    w.events.push({ kind: 'score', points: CLEAN_WAVE_POINTS }, { kind: 'combo' });
  }
  w.phase = 'plan';
  w.wave += 1;
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
    rngState: state.rngState,
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
    case 'build':
      return build(state, action.slot, action.turret);
    case 'tapSlot':
      return upgrade(state, action.slot);
    case 'startWave':
      return startWave(state);
  }
}
