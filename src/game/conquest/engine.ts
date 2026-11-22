// « Bataille de Nombres » (docs/PRD.md "Bataille de Nombres", AC-98): a map of territories joined by roads. The player
// (blue) and the enemy (red) start with one territory of 10 units each, the others are neutral (seeded 2 to 8 units).
// A turn: tap one of your territories with 2 units or more, then a territory joined to it: all its units but one
// march (they add up on an own territory, take a weaker one with the difference, else lower it), or « Passer ». Then
// the enemy plays one move with its rule and every owned territory gains 1 unit. Pure reducer on an immutable state
// (src/game/contract.ts); time comes in through `tick` (elapsed ms), randomness (the neutral units) through the seeded
// generator kept in the state. A round is the 3 fixed maps of 5, 6 and 7 territories.
//
// Input guard: a move and the enemy's answer play in MOVE_GUARD_MS; taps are ignored meanwhile. The player's move is
// applied at once, the enemy answers (and the territories grow) when ANSWER_AT_MS of the guard have run.
// Rule readings (simplest reading where the PRD is silent, noted here):
// - a battle is won when the enemy owns no territory (that is the combo); it can only happen on the player's move,
//   which ends the battle at once (no answer, no growth); that turn counts as played;
// - the enemy's attack « with the most units left » is the one leaving the most units on the taken territory; ties go
//   to the lowest source index, then the lowest target index;
// - without such an attack the enemy moves from its strongest territory among those able to move (2 units or more
//   and a neighbour it owns) onto the weakest of these neighbours; ties go to the lowest index;
// - with a territory selected, a tap on a joined territory always marches (also onto an own one); a tap on another
//   own territory that is not joined selects it instead; any other tap changes nothing;
// - a finished battle stays on screen for BATTLE_SHOW_MS (taps ignored), then the next map comes.
import type { RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';

export const CONQUEST_BATTLES = 3;
export const START_UNITS = 10;
export const NEUTRAL_MIN_UNITS = 2;
export const NEUTRAL_MAX_UNITS = 8;
/** A territory needs this many units to march (one always stays behind). */
export const MIN_MARCH_UNITS = 2;
/** Units gained after each turn by every territory owned by the player or the enemy. */
export const GROWTH = 1;
export const TURNS = 15;
export const TERRITORY_POINTS = 60;
export const WIN_POINTS = 200;
export const TURN_LEFT_POINTS = 10;
/** Extra units of the player's first territory per « Renforts » level. */
export const REINFORCE_UNITS = 2;
/** A move and the enemy's answer play in this time; taps are ignored meanwhile (input guard). */
export const MOVE_GUARD_MS = 600;
/** The enemy answers once this much of the guard has run. */
export const ANSWER_AT_MS = 300;
/** A finished battle stays shown this long (taps ignored) before the next one. */
export const BATTLE_SHOW_MS = 900;

export type Owner = 'player' | 'enemy' | 'neutral';
export type Territory = { owner: Owner; units: number };
export type Move = { from: number; to: number };

export type ConquestMap = {
  /** Centre of each territory on a 0..1 square (x to the right, y down). */
  spots: readonly { x: number; y: number }[];
  /** Roads [a, b] with a < b. */
  roads: readonly (readonly [number, number])[];
  /** Start territory of the player and of the enemy. */
  player: number;
  enemy: number;
};

/** The 3 fixed maps (5, 6 and 7 territories), played in this order. The two camps start at opposite ends. */
export const CONQUEST_MAPS: readonly ConquestMap[] = [
  // A square with a centre: the camps on opposite corners, two roads apart.
  {
    spots: [
      { x: 0.08, y: 0.92 },
      { x: 0.08, y: 0.08 },
      { x: 0.5, y: 0.5 },
      { x: 0.92, y: 0.92 },
      { x: 0.92, y: 0.08 },
    ],
    roads: [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 4],
      [2, 3],
      [2, 4],
      [3, 4],
    ],
    player: 0,
    enemy: 4,
  },
  // A hexagon: the camps on the left and right tips, three roads apart.
  {
    spots: [
      { x: 0.04, y: 0.5 },
      { x: 0.34, y: 0.1 },
      { x: 0.34, y: 0.9 },
      { x: 0.66, y: 0.1 },
      { x: 0.66, y: 0.9 },
      { x: 0.96, y: 0.5 },
    ],
    roads: [
      [0, 1],
      [0, 2],
      [1, 2],
      [1, 3],
      [2, 4],
      [3, 4],
      [3, 5],
      [4, 5],
    ],
    player: 0,
    enemy: 5,
  },
  // Two paths around a crossroads: the camps on opposite corners, three roads apart.
  {
    spots: [
      { x: 0.06, y: 0.94 },
      { x: 0.06, y: 0.42 },
      { x: 0.58, y: 0.94 },
      { x: 0.5, y: 0.5 },
      { x: 0.42, y: 0.06 },
      { x: 0.94, y: 0.58 },
      { x: 0.94, y: 0.06 },
    ],
    roads: [
      [0, 1],
      [0, 2],
      [1, 3],
      [1, 4],
      [2, 3],
      [2, 5],
      [3, 4],
      [3, 5],
      [4, 6],
      [5, 6],
    ],
    player: 0,
    enemy: 6,
  },
];

export type ConquestEvent =
  | { kind: 'select'; territory: number | null }
  /** Units marched: `sent` left `from`; `taken` when the target changed owner. */
  | { kind: 'move'; by: 'player' | 'enemy'; from: number; to: number; sent: number; taken: boolean }
  | { kind: 'pass'; by: 'player' | 'enemy' }
  /** Every owned territory gained GROWTH units; a new turn starts. */
  | { kind: 'grow' }
  /** The battle is over: `won` when the enemy owns nothing, `lost` when the player owns nothing. */
  | { kind: 'battle'; battle: number; won: boolean; lost: boolean; points: number }
  /** The next map is on screen. */
  | { kind: 'map'; battle: number }
  /** An input during the guard or on a finished battle: nothing changes. */
  | { kind: 'ignored' };

export type ConquestState = RoundState<ConquestEvent> & {
  /** Current battle, 1..3 (its map is CONQUEST_MAPS[battle - 1]). */
  battle: number;
  territories: readonly Territory[];
  selected: number | null;
  /** Turns played in this battle. */
  turn: number;
  reinforce: number;
  /** The enemy's last answer in this battle (shown by the screen), null before its first one. */
  answer: Move | 'pass' | null;
  /** Time left of the move and its answer (ms); taps are ignored while > 0. */
  busyMs: number;
  /** The enemy has not answered the player's last move yet. */
  answerDue: boolean;
  /** Time left of the finished battle on screen (ms): taps are ignored, then the next map comes. */
  doneMs: number;
  rngState: number;
};

export type ConquestAction = { type: 'tap'; territory: number } | { type: 'pass' } | { type: 'tick'; dt: number };

export const mapOf = (battle: number): ConquestMap => CONQUEST_MAPS[battle - 1];

/** Territories joined to `territory` by a road, in index order. */
export function neighboursOf(map: ConquestMap, territory: number): number[] {
  const out: number[] = [];
  for (const [a, b] of map.roads) {
    if (a === territory) out.push(b);
    else if (b === territory) out.push(a);
  }
  return out.sort((x, y) => x - y);
}

export const joined = (map: ConquestMap, a: number, b: number): boolean => neighboursOf(map, a).includes(b);

export const ownedBy = (territories: readonly Territory[], owner: Owner): number => territories.filter((t) => t.owner === owner).length;

/** All units of `from` but one march onto `to`: they add up, take a weaker territory with the difference, else lower it. */
export function march(territories: readonly Territory[], from: number, to: number): { territories: Territory[]; sent: number; taken: boolean } {
  const out = territories.slice();
  const { owner } = territories[from];
  const target = territories[to];
  const sent = territories[from].units - 1;
  out[from] = { owner, units: 1 };
  if (target.owner === owner) {
    out[to] = { owner, units: target.units + sent };
    return { territories: out, sent, taken: false };
  }
  if (sent > target.units) {
    out[to] = { owner, units: sent - target.units };
    return { territories: out, sent, taken: true };
  }
  // Not enough: the units there drop by the number sent (0 stays to its owner).
  out[to] = { owner: target.owner, units: target.units - sent };
  return { territories: out, sent, taken: false };
}

/** Every move `owner` may play: from one of its territories with 2 units or more onto a joined territory. */
export function legalMoves(map: ConquestMap, territories: readonly Territory[], owner: Owner): Move[] {
  const out: Move[] = [];
  territories.forEach((t, from) => {
    if (t.owner !== owner || t.units < MIN_MARCH_UNITS) return;
    for (const to of neighboursOf(map, from)) out.push({ from, to });
  });
  return out;
}

/** Units left on `to` when the move takes it, null when it does not take it. */
export function unitsLeftAfterTaking(territories: readonly Territory[], move: Move): number | null {
  const source = territories[move.from];
  const target = territories[move.to];
  const sent = source.units - 1;
  return target.owner !== source.owner && sent > target.units ? sent - target.units : null;
}

/**
 * The enemy's rule: the attack that takes a territory with the most units left; else the move from its strongest
 * territory onto its weakest neighbour it owns; else null (it passes). Deterministic: ties go to the lowest index.
 */
export function enemyMove(map: ConquestMap, territories: readonly Territory[]): Move | null {
  const moves = legalMoves(map, territories, 'enemy');
  let attack: Move | null = null;
  let most = 0;
  for (const move of moves) {
    const left = unitsLeftAfterTaking(territories, move);
    if (left !== null && left > most) {
      most = left;
      attack = move;
    }
  }
  if (attack) return attack;

  let transfer: Move | null = null;
  for (const move of moves) {
    if (territories[move.to].owner !== 'enemy') continue;
    if (transfer === null || territories[move.from].units > territories[transfer.from].units) transfer = move;
    else if (move.from === transfer.from && territories[move.to].units < territories[transfer.to].units) transfer = move;
  }
  return transfer;
}

/** 60 per territory owned, +200 and +10 per turn not played when the enemy owns none; 0 when the player owns none. */
export function battleScore(territories: readonly Territory[], turnsPlayed: number): number {
  const owned = ownedBy(territories, 'player');
  if (owned === 0) return 0;
  const won = ownedBy(territories, 'enemy') === 0;
  return TERRITORY_POINTS * owned + (won ? WIN_POINTS + TURN_LEFT_POINTS * Math.max(0, TURNS - turnsPlayed) : 0);
}

type Carried = Pick<ConquestState, 'score' | 'combos' | 'reinforce' | 'rngState'>;

/** The map of the battle with its seeded neutral units (one bounded draw per neutral: the generator cannot fail). */
function startBattle(state: Carried, battle: number): ConquestState {
  const map = mapOf(battle);
  const rng = createRng(state.rngState);
  const territories = map.spots.map((_, i): Territory => {
    if (i === map.player) return { owner: 'player', units: START_UNITS + REINFORCE_UNITS * state.reinforce };
    if (i === map.enemy) return { owner: 'enemy', units: START_UNITS };
    return { owner: 'neutral', units: NEUTRAL_MIN_UNITS + rng.int(NEUTRAL_MAX_UNITS - NEUTRAL_MIN_UNITS + 1) };
  });
  return {
    score: state.score,
    combos: state.combos,
    status: 'playing',
    events: [],
    battle,
    territories,
    selected: null,
    turn: 0,
    reinforce: state.reinforce,
    answer: null,
    busyMs: 0,
    answerDue: false,
    doneMs: 0,
    rngState: rng.state(),
  };
}

export function createConquest(seed: number, upgrades: UpgradeLevels = {}): ConquestState {
  return startBattle({ score: 0, combos: 0, reinforce: upgrades.reinforce ?? 0, rngState: seed >>> 0 }, 1);
}

/** True when a tap or « Passer » is taken now (no move playing, no finished battle on show). */
export function acceptsInput(state: Pick<ConquestState, 'status' | 'busyMs' | 'doneMs'>): boolean {
  return state.status === 'playing' && state.busyMs <= 0 && state.doneMs <= 0;
}

type Events = ConquestState['events'][number][];

/** Scores the battle and keeps it on show. */
function endBattle(state: ConquestState, events: Events): ConquestState {
  const won = ownedBy(state.territories, 'enemy') === 0;
  const lost = ownedBy(state.territories, 'player') === 0;
  const points = battleScore(state.territories, state.turn);
  events.push({ kind: 'battle', battle: state.battle, won, lost, points });
  if (points > 0) events.push({ kind: 'score', points });
  let combos = state.combos;
  if (won) {
    combos += 1;
    events.push({ kind: 'combo' });
  }
  return { ...state, score: state.score + points, combos, selected: null, busyMs: 0, answerDue: false, doneMs: BATTLE_SHOW_MS, events };
}

function nextBattle(state: ConquestState): ConquestState {
  if (state.battle >= CONQUEST_BATTLES) return { ...state, busyMs: 0, doneMs: 0, status: 'over', events: [{ kind: 'over', score: state.score }] };
  const next = startBattle(state, state.battle + 1);
  return { ...next, events: [{ kind: 'map', battle: next.battle }] };
}

/** The player's turn is taken (a march or a pass): the enemy answers during the guard. */
function playerTurn(state: ConquestState, move: Move | null): ConquestState {
  if (move === null) return { ...state, selected: null, busyMs: MOVE_GUARD_MS, answerDue: true, events: [{ kind: 'pass', by: 'player' }] };
  const result = march(state.territories, move.from, move.to);
  const events: Events = [{ kind: 'move', by: 'player', from: move.from, to: move.to, sent: result.sent, taken: result.taken }];
  const next: ConquestState = { ...state, territories: result.territories, selected: null };
  if (ownedBy(result.territories, 'enemy') === 0) return endBattle({ ...next, turn: state.turn + 1 }, events);
  return { ...next, busyMs: MOVE_GUARD_MS, answerDue: true, events };
}

/** The enemy plays its move, then every owned territory grows and the turn is over. */
function enemyAnswer(state: ConquestState): ConquestState {
  const move = enemyMove(mapOf(state.battle), state.territories);
  const events: Events = [];
  let territories = state.territories;
  if (move) {
    const result = march(territories, move.from, move.to);
    territories = result.territories;
    events.push({ kind: 'move', by: 'enemy', from: move.from, to: move.to, sent: result.sent, taken: result.taken });
  } else events.push({ kind: 'pass', by: 'enemy' });
  territories = territories.map((t) => (t.owner === 'neutral' ? t : { owner: t.owner, units: t.units + GROWTH }));
  events.push({ kind: 'grow' });
  const next: ConquestState = { ...state, territories, turn: state.turn + 1, answer: move ?? 'pass', answerDue: false, events };
  if (ownedBy(territories, 'player') === 0 || next.turn >= TURNS) return endBattle(next, events);
  return next;
}

function tap(state: ConquestState, territory: number): ConquestState {
  const { territories, selected } = state;
  if (!Number.isInteger(territory) || territory < 0 || territory >= territories.length) return { ...state, events: [] };
  if (!acceptsInput(state)) return { ...state, events: [{ kind: 'ignored' }] };
  if (selected === territory) return { ...state, selected: null, events: [{ kind: 'select', territory: null }] };
  if (selected !== null && joined(mapOf(state.battle), selected, territory)) return playerTurn(state, { from: selected, to: territory });
  const target = territories[territory];
  if (target.owner === 'player' && target.units >= MIN_MARCH_UNITS) return { ...state, selected: territory, events: [{ kind: 'select', territory }] };
  return { ...state, events: [] };
}

export function reduceConquest(state: ConquestState, action: ConquestAction): ConquestState {
  if (state.status !== 'playing') return state.events.length === 0 ? state : { ...state, events: [] };

  if (action.type === 'tick') {
    // The same state comes back when nothing runs (no re-render needed).
    if (!(action.dt > 0) || (state.busyMs <= 0 && state.doneMs <= 0)) return state.events.length === 0 ? state : { ...state, events: [] };
    if (state.doneMs > 0) {
      const doneMs = Math.max(0, state.doneMs - action.dt);
      return doneMs > 0 ? { ...state, doneMs, events: [] } : nextBattle(state);
    }
    const busyMs = Math.max(0, state.busyMs - action.dt);
    if (state.answerDue && busyMs <= MOVE_GUARD_MS - ANSWER_AT_MS) return enemyAnswer({ ...state, busyMs });
    return { ...state, busyMs, events: [] };
  }

  if (action.type === 'pass') return acceptsInput(state) ? playerTurn(state, null) : { ...state, events: [{ kind: 'ignored' }] };
  return tap(state, action.territory);
}
