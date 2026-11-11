// Common mini-game contract (docs/PRD.md "Common mini-game contract"). Every engine is a pure reducer on an
// immutable state: `create(seed, upgrades) -> State`, `reduce(state, action) -> State`. The state always carries
// the fields below; `events` describes what happened in the last transition (sounds, animations, challenge combos)
// and is replaced on every reduce. Time is an action input (`tick` with elapsed ms), never read inside an engine.
// The core engine (src/game/core) converts the final score into stars, coins and XP; engines never do.

export type GameStatus = 'playing' | 'over';

export type BaseEvent =
  | { kind: 'combo' } // counts for the daily challenge « Faire 5 combos »
  | { kind: 'score'; points: number }
  | { kind: 'over'; score: number };

export type RoundState<E extends { kind: string } = BaseEvent> = {
  score: number;
  /** Number of combos so far (game-specific definition, see the PRD). */
  combos: number;
  status: GameStatus;
  events: readonly (E | BaseEvent)[];
};

/** Upgrade levels the engine was created with (0 when not bought). */
export type UpgradeLevels = Readonly<Record<string, number>>;
