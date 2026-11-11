// The one local save of the game (docs/PRD.md "Persistence"): schema v1, defaults for missing fields, unknown
// fields and game ids preserved. Pure functions: storage is wired by src/storage/saveStore.ts.
import { AchievementId, ChallengeId, GAME_IDS, GameId, UpgradeId, WorldId } from './content';

export const SCHEMA_VERSION = 1;

export type GameSave = {
  bestScore: number;
  stars: number; // 0-3
  rounds: number;
  upgrades: Partial<Record<UpgradeId, number>>; // level 0-3
  tutorialDone: boolean;
};

export type DailyRewardSave = {
  lastCollectedDate: string | null; // local date YYYY-MM-DD
  calendarDay: number; // 0 at first, then 1-7
};

export type ChallengesSave = {
  date: string | null;
  ids: ChallengeId[];
  progress: Partial<Record<ChallengeId, number>>;
  completed: ChallengeId[];
  allDoneBonus: boolean;
  /** Distinct games played on that date (for games2). */
  gamesPlayed: GameId[];
};

export type ThemeSetting = 'auto' | 'light' | 'dark';

export type SettingsSave = {
  sound: boolean;
  vibrations: boolean;
  theme: ThemeSetting;
};

export type Save = {
  schemaVersion: number;
  profile: {
    xp: number;
    level: number;
    coins: number;
    lifetimeCoins: number;
    roundsPlayed: number;
    daysPlayed: number;
    lastPlayedDate: string | null;
    lastPlayedGame: GameId | null;
    recentGames: GameId[]; // most recent first, up to 3
    upgradesBought: number;
  };
  games: Record<string, GameSave>; // keyed by game id; unknown ids are kept
  unlockedWorlds: WorldId[];
  dailyReward: DailyRewardSave;
  challenges: ChallengesSave;
  achievements: AchievementId[];
  settings: SettingsSave;
  [extra: string]: unknown;
};

export function defaultGameSave(): GameSave {
  return { bestScore: 0, stars: 0, rounds: 0, upgrades: {}, tutorialDone: false };
}

export function defaultSave(): Save {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: {
      xp: 0,
      level: 1,
      coins: 0,
      lifetimeCoins: 0,
      roundsPlayed: 0,
      daysPlayed: 0,
      lastPlayedDate: null,
      lastPlayedGame: null,
      recentGames: [],
      upgradesBought: 0,
    },
    games: Object.fromEntries(GAME_IDS.map((id) => [id, defaultGameSave()])),
    unlockedWorlds: ['arcade'],
    dailyReward: { lastCollectedDate: null, calendarDay: 0 },
    challenges: { date: null, ids: [], progress: {}, completed: [], allDoneBonus: false, gamesPlayed: [] },
    achievements: [],
    settings: { sound: true, vibrations: true, theme: 'auto' },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep merge of defaults with stored data: stored wins, missing fields take defaults, unknown fields are kept. */
function withDefaults<T>(defaults: T, stored: unknown): T {
  if (!isRecord(defaults)) return (stored === undefined ? defaults : stored) as T;
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  if (!isRecord(stored)) return out as T;
  for (const [key, value] of Object.entries(stored)) {
    const base = (defaults as Record<string, unknown>)[key];
    out[key] = isRecord(base) && isRecord(value) ? withDefaults(base, value) : value;
  }
  return out as T;
}

export type LoadResult = { save: Save; readOnly: boolean };

/**
 * Parses a stored JSON string. Missing fields take defaults; unknown fields and game ids are preserved.
 * A save with a higher schemaVersion is not understood: the app starts with defaults and must not write.
 */
export function parseSave(json: string | null | undefined): LoadResult {
  if (!json) return { save: defaultSave(), readOnly: false };
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { save: defaultSave(), readOnly: false };
  }
  if (!isRecord(data)) return { save: defaultSave(), readOnly: false };
  const version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;
  if (version > SCHEMA_VERSION) return { save: defaultSave(), readOnly: true };
  const save = withDefaults(defaultSave(), data);
  // Every known game gets its defaults even if the stored object lacks it; stored unknown ids stay.
  const defaults = defaultSave();
  for (const id of GAME_IDS) save.games[id] = withDefaults(defaults.games[id], save.games[id]);
  save.schemaVersion = SCHEMA_VERSION;
  return { save, readOnly: false };
}

export function serializeSave(save: Save): string {
  return JSON.stringify(save);
}

/** « Réinitialiser la progression »: everything back to defaults except the settings (consent lives elsewhere). */
export function resetProgress(save: Save): Save {
  return { ...defaultSave(), settings: { ...save.settings } };
}

export function gameSave(save: Save, id: GameId): GameSave {
  return save.games[id] ?? defaultGameSave();
}

export function upgradeLevel(save: Save, game: GameId, upgrade: UpgradeId): number {
  return gameSave(save, game).upgrades[upgrade] ?? 0;
}

export function totalStars(save: Save): number {
  return GAME_IDS.reduce((sum, id) => sum + gameSave(save, id).stars, 0);
}

export function starsInWorld(save: Save, worldGames: readonly GameId[]): number {
  return worldGames.reduce((sum, id) => sum + gameSave(save, id).stars, 0);
}
