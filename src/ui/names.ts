import { GameId, UpgradeId, WorldId } from '../game/core/content';
import { useI18n } from '../i18n/I18nProvider';

/** Localised names of games, worlds and upgrades, keyed by content id. */
export function useGameNames(): Record<GameId, string> {
  const { t } = useI18n();
  return { blocks: t.game.blocks.name, garden: t.game.garden.name, bubbles: t.game.bubbles.name };
}

export function useWorldName(): (world: WorldId) => string {
  const { t } = useI18n();
  return (world) => t.world[world];
}

export function useUpgradeName(): (upgrade: UpgradeId) => string {
  const { t } = useI18n();
  return (upgrade) => t.upgrade[upgrade].name;
}
