// World unlocks (docs/PRD.md "Worlds and unlocks"): checked after every round and collection, permanent.
import { UnlockCondition, World, WorldId, WORLDS } from './content';
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
