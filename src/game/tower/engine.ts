// « Tour Bancale » (docs/PRD.md "Tour Bancale"): a block slides left-right above the stack; a tap drops it and only
// the overlap with the top floor stays. Pure reducer; time comes in through `tick` (elapsed ms). No randomness.
import type { BaseEvent, RoundState, UpgradeLevels } from '../contract';

export const TOWER_FIELD = 10;
export const BASE_WIDTH = 4;
export const WIDE_PER_LEVEL = 0.5;
export const BASE_SPEED = 4; // units/s
export const SPEED_PER_FLOOR = 0.25;
export const MAX_SPEED = 12;
export const PERFECT_TOLERANCE = 0.15;
export const FLOOR_POINTS = 10;
export const STREAK_POINTS = 5;
/** Float slack so that 0.15 exactly (after a few additions) still counts as perfect, and a 0 overlap as none. */
const EPS = 1e-9;

export type Floor = { x: number; width: number };
export type Block = { x: number; width: number; dir: 1 | -1 };

export type TowerEvent =
  | BaseEvent
  /** A floor was placed; `cut` is the overhang that fell away (null on a perfect drop). */
  | { kind: 'place'; floor: number; perfect: boolean; points: number; cut: Floor | null }
  /** The block missed the stack: the round is over. */
  | { kind: 'miss'; block: Floor };

export type TowerState = RoundState<TowerEvent> & {
  /** floors[0] is the base; the last one is the top floor. */
  floors: readonly Floor[];
  block: Block;
  /** Consecutive perfect drops (0 after an imperfect drop). */
  streak: number;
};

export type TowerAction = { type: 'drop' } | { type: 'tick'; dt: number };

/** Floors placed on the base so far. */
export function floorsPlaced(state: TowerState): number {
  return state.floors.length - 1;
}

/** Slide speed in units/s: 4 + 0.25 per floor placed, capped at 12. */
export function blockSpeed(placed: number): number {
  return Math.min(MAX_SPEED, BASE_SPEED + SPEED_PER_FLOOR * placed);
}

export function baseWidth(wideLevel: number): number {
  return BASE_WIDTH + WIDE_PER_LEVEL * wideLevel;
}

function newBlock(width: number): Block {
  return { x: 0, width, dir: 1 };
}

export function createTower(_seed: number, upgrades: UpgradeLevels = {}): TowerState {
  const width = baseWidth(upgrades.wide ?? 0);
  const base: Floor = { x: (TOWER_FIELD - width) / 2, width };
  return { score: 0, combos: 0, status: 'playing', events: [], floors: [base], block: newBlock(width), streak: 0 };
}

/** Moves the block by `distance` units, bouncing on 0 and on 10 − width. */
export function slide(block: Block, distance: number): Block {
  const max = TOWER_FIELD - block.width;
  if (max <= 0) return { ...block, x: 0 };
  let x = block.x + block.dir * distance;
  let dir = block.dir;
  // A long tick may bounce several times.
  while (x < 0 || x > max) {
    if (x > max) {
      x = 2 * max - x;
      dir = -1;
    } else {
      x = -x;
      dir = 1;
    }
  }
  return { x, width: block.width, dir };
}

function drop(state: TowerState): TowerState {
  const top = state.floors[state.floors.length - 1];
  const { block } = state;
  const left = Math.max(block.x, top.x);
  const right = Math.min(block.x + block.width, top.x + top.width);
  const overlap = right - left;
  if (overlap <= EPS) {
    return { ...state, status: 'over', events: [{ kind: 'miss', block: { x: block.x, width: block.width } }, { kind: 'over', score: state.score }] };
  }
  const perfect = Math.abs(block.x - top.x) <= PERFECT_TOLERANCE + EPS;
  const streak = perfect ? state.streak + 1 : 0;
  const floor: Floor = perfect ? { x: top.x, width: top.width } : { x: left, width: overlap };
  const cut: Floor | null = perfect ? null : block.x < top.x ? { x: block.x, width: top.x - block.x } : { x: right, width: block.x + block.width - right };
  const points = FLOOR_POINTS + (perfect ? STREAK_POINTS * streak : 0);
  const floors = [...state.floors, floor];
  const events: TowerEvent[] = [{ kind: 'place', floor: floors.length - 1, perfect, points, cut }, { kind: 'score', points }];
  if (perfect) events.push({ kind: 'combo' });
  return {
    ...state,
    floors,
    block: newBlock(floor.width),
    streak,
    score: state.score + points,
    combos: state.combos + (perfect ? 1 : 0),
    events,
  };
}

export function reduceTower(state: TowerState, action: TowerAction): TowerState {
  if (state.status !== 'playing') return state;
  switch (action.type) {
    case 'tick': {
      if (action.dt <= 0) return state.events.length === 0 ? state : { ...state, events: [] };
      const block = slide(state.block, (blockSpeed(floorsPlaced(state)) * action.dt) / 1000);
      return { ...state, block, events: [] };
    }
    case 'drop':
      return drop(state);
  }
}
