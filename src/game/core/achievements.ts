// Achievements (docs/PRD.md "Achievements"): checked after every round, purchase and collection; each unlocks once.
import { AchievementDef, AchievementId, ACHIEVEMENTS, GAME_IDS, UPGRADE_MAX_LEVEL } from './content';
import { addCoins } from './progression';
import { gameSave, Save, totalStars } from './save';

export function achievementById(id: AchievementId): AchievementDef {
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) throw new Error(`unknown achievement ${id}`);
  return def;
}

/** Current value of the quantity an achievement measures. */
export function achievementValue(save: Save, def: AchievementDef): number {
  switch (def.kind) {
    case 'rounds':
      return save.profile.roundsPlayed;
    case 'stars':
      return totalStars(save);
    case 'gamesPlayed':
      return GAME_IDS.filter((id) => gameSave(save, id).rounds > 0).length;
    case 'upgradesBought':
      return save.profile.upgradesBought;
    case 'maxedUpgrades':
      return GAME_IDS.reduce((n, id) => n + Object.values(gameSave(save, id).upgrades).filter((l) => (l ?? 0) >= UPGRADE_MAX_LEVEL).length, 0);
    case 'level':
      return save.profile.level;
    case 'week':
      return save.dailyReward.calendarDay === 7 && save.dailyReward.lastCollectedDate !== null ? 1 : 0;
    case 'lifetimeCoins':
      return save.profile.lifetimeCoins;
  }
}

/** Unlocks every achievement whose condition holds, grants its coins (which may unlock « Trésor » in turn). */
export function checkAchievements(save: Save): { save: Save; unlocked: AchievementId[] } {
  const unlocked: AchievementId[] = [];
  let current = save;
  let changed = true;
  while (changed) {
    changed = false;
    for (const def of ACHIEVEMENTS) {
      if (current.achievements.includes(def.id)) continue;
      if (achievementValue(current, def) >= def.target) {
        current = { ...current, achievements: [...current.achievements, def.id], profile: addCoins(current.profile, def.coins) };
        unlocked.push(def.id);
        changed = true;
      }
    }
  }
  return { save: current, unlocked };
}
