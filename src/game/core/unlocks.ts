// World unlocks (docs/PRD.md "Worlds and unlocks"): checked after every round and collection, permanent.
import { GameId, UnlockCondition, World, WorldId, WORLDS } from './content';
import { Save, starsInWorld, totalStars } from './save';

export type ConditionProgress = { condition: UnlockCondition; current: number; met: boolean };

export function conditionProgress(save: Save, condition: UnlockCondition): ConditionProgress {
  let current: number;
  switch (condition.kind) {
    case 'starsIn':
      current = starsInWorld(save, WORLDS.find((w) => w.id === condition.world)?.games ?? []);
      break;
    case 'starsTotal':
      current = totalStars(save);
      break;
    case 'level':
      current = save.profile.level;
      break;
  }
  return { condition, current, met: current >= condition.n };
}

export function isWorldUnlocked(save: Save, world: WorldId): boolean {
  return save.unlockedWorlds.includes(world);
}

/** All conditions met (AND). Coming-soon worlds never qualify in this version. */
export function qualifies(save: Save, world: World): boolean {
  if (world.comingSoon) return false;
  return world.conditions.every((c) => conditionProgress(save, c).met);
}

/** Unlocks every world whose conditions are now met; returns the newly unlocked ids in display order. */
export function checkUnlocks(save: Save): { save: Save; unlocked: WorldId[] } {
  const unlocked: WorldId[] = [];
  for (const world of WORLDS) {
    if (!save.unlockedWorlds.includes(world.id) && qualifies(save, world)) unlocked.push(world.id);
  }
  if (unlocked.length === 0) return { save, unlocked };
  return { save: { ...save, unlockedWorlds: [...save.unlockedWorlds, ...unlocked] }, unlocked };
}

/** The first locked, not coming-soon world in display order (the "next unlock" card on Home), or null. */
export function nextUnlock(save: Save): World | null {
  return WORLDS.find((w) => !w.comingSoon && !save.unlockedWorlds.includes(w.id)) ?? null;
}

// Games inside a world (v0.2.0): the first game of a world is playable with the world, the k-th (k ≥ 2) needs
// 2 × (k − 1) stars earned in that world. Derived from the stars, never saved. The /unlocked test link sets the
// in-memory flag `sessionAllGames` (the session never writes the save).

/** Stars needed in its world for a game to be playable (0 for the first game of a world). */
export function gameUnlockStars(game: GameId): number {
  const world = WORLDS.find((w) => w.games.includes(game));
  return world ? 2 * world.games.indexOf(game) : 0;
}

export function isGameUnlocked(save: Save, game: GameId): boolean {
  const world = WORLDS.find((w) => w.games.includes(game));
  if (!world || !save.unlockedWorlds.includes(world.id)) return false;
  if (save.sessionAllGames === true) return true;
  return starsInWorld(save, world.games) >= gameUnlockStars(game);
}

/** Games the player can play now (world and game unlocked), in display order. */
export function playableGames(save: Save): GameId[] {
  return WORLDS.flatMap((w) => w.games).filter((game) => isGameUnlocked(save, game));
}

/** Games that became playable between two saves inside a world that was already open (announced on Result). */
export function newlyUnlockedGames(before: Save, after: Save): GameId[] {
  return playableGames(after).filter((game) => {
    const world = WORLDS.find((w) => w.games.includes(game));
    return !!world && before.unlockedWorlds.includes(world.id) && !isGameUnlocked(before, game);
  });
}
