// Per-game upgrades (docs/PRD.md "Upgrades"): three per game, three levels, costs 100 / 250 / 500.
import { gameById, GameId, UPGRADE_COSTS, UpgradeId } from './content';
import { spendCoins } from './progression';
import { gameSave, Save, upgradeLevel } from './save';

/** Cost of the next level, or null when maxed or unknown for this game. */
export function nextUpgradeCost(save: Save, game: GameId, upgrade: UpgradeId): number | null {
  const def = gameById(game).upgrades.find((u) => u.id === upgrade);
  if (!def) return null;
  const level = upgradeLevel(save, game, upgrade);
  if (level >= def.maxLevel) return null;
  return UPGRADE_COSTS[level];
}

export function canBuyUpgrade(save: Save, game: GameId, upgrade: UpgradeId): boolean {
  const cost = nextUpgradeCost(save, game, upgrade);
  return cost !== null && cost <= save.profile.coins;
}

export type BuyResult = { save: Save; level: number; cost: number } | { save: Save; refused: 'maxed' | 'unaffordable' | 'unknown' };

/** Buys the next level; immediate, refused when unaffordable or maxed. */
export function buyUpgrade(save: Save, game: GameId, upgrade: UpgradeId): BuyResult {
  const def = gameById(game).upgrades.find((u) => u.id === upgrade);
  if (!def) return { save, refused: 'unknown' };
  const cost = nextUpgradeCost(save, game, upgrade);
  if (cost === null) return { save, refused: 'maxed' };
  const profile = spendCoins(save.profile, cost);
  if (!profile) return { save, refused: 'unaffordable' };
  const current = gameSave(save, game);
  const level = (current.upgrades[upgrade] ?? 0) + 1;
  return {
    save: {
      ...save,
      profile: { ...profile, upgradesBought: profile.upgradesBought + 1 },
      games: { ...save.games, [game]: { ...current, upgrades: { ...current.upgrades, [upgrade]: level } } },
    },
    level,
    cost,
  };
}

/** Number of upgrades of a game whose next level is affordable now (badge on the game sheet). */
export function affordableUpgrades(save: Save, game: GameId): number {
  return gameById(game).upgrades.filter((u) => canBuyUpgrade(save, game, u.id)).length;
}

/** Levels of every upgrade of a game, 0 when not bought (what the engines read at init). */
export function upgradeLevels(save: Save, game: GameId): Record<UpgradeId, number> {
  const levels = {} as Record<UpgradeId, number>;
  for (const u of gameById(game).upgrades) levels[u.id] = upgradeLevel(save, game, u.id);
  return levels;
}
