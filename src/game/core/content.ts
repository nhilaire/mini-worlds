// Content catalogue of v0.1.0 (docs/PRD.md "Rules and scoring"): worlds, games, stars, upgrades, challenges,
// achievements, daily rewards. Pure data and tiny pure helpers; no React, no storage.

export type GameId = 'blocks' | 'garden' | 'bubbles';
export type WorldId =
  | 'arcade'
  | 'puzzle'
  | 'strategy'
  | 'cards'
  | 'bubbles'
  | 'skill'
  | 'building'
  | 'exploration'
  | 'memory'
  | 'challenges';

export type UnlockCondition = { kind: 'starsIn'; world: WorldId; n: number } | { kind: 'starsTotal'; n: number } | { kind: 'level'; n: number };

export type World = {
  id: WorldId;
  index: number; // 1-10, display order
  games: readonly GameId[]; // games present in this version (0 or 1 in v0.1.0)
  conditions: readonly UnlockCondition[]; // all must hold (AND); empty = open from the start
  comingSoon: boolean; // never unlocks in this version, conditions are indicative
};

export const WORLDS: readonly World[] = [
  { id: 'arcade', index: 1, games: ['blocks'], conditions: [], comingSoon: false },
  { id: 'puzzle', index: 2, games: ['garden'], conditions: [{ kind: 'starsIn', world: 'arcade', n: 2 }], comingSoon: false },
  { id: 'strategy', index: 3, games: [], conditions: [{ kind: 'starsTotal', n: 6 }], comingSoon: true },
  { id: 'cards', index: 4, games: [], conditions: [{ kind: 'level', n: 8 }], comingSoon: true },
  {
    id: 'bubbles',
    index: 5,
    games: ['bubbles'],
    conditions: [
      { kind: 'starsTotal', n: 4 },
      { kind: 'level', n: 3 },
    ],
    comingSoon: false,
  },
  { id: 'skill', index: 6, games: [], conditions: [{ kind: 'starsTotal', n: 9 }], comingSoon: true },
  { id: 'building', index: 7, games: [], conditions: [{ kind: 'level', n: 12 }], comingSoon: true },
  { id: 'exploration', index: 8, games: [], conditions: [{ kind: 'level', n: 15 }], comingSoon: true },
  { id: 'memory', index: 9, games: [], conditions: [{ kind: 'level', n: 18 }], comingSoon: true },
  { id: 'challenges', index: 10, games: [], conditions: [{ kind: 'level', n: 25 }], comingSoon: true },
];

export const SLOTS_PER_WORLD = 5;
export const STARS_PER_GAME = 3;

export type UpgradeId = 'preview' | 'slow_start' | 'extra_move' | 'cascade' | 'aim' | 'next' | 'coins';

export type Upgrade = { id: UpgradeId; maxLevel: number };

export type Game = {
  id: GameId;
  world: WorldId;
  /** Score thresholds for 1, 2 and 3 stars. */
  stars: readonly [number, number, number];
  upgrades: readonly Upgrade[];
  realTime: boolean;
};

export const UPGRADE_COSTS: readonly number[] = [250, 600, 1200]; // cost of level 1, 2, 3 (x2.5 after the first phone test: coins came too fast)
export const UPGRADE_MAX_LEVEL = 3;

const coinsUpgrade: Upgrade = { id: 'coins', maxLevel: UPGRADE_MAX_LEVEL };

export const GAMES: readonly Game[] = [
  {
    id: 'blocks',
    world: 'arcade',
    stars: [1000, 2500, 5000],
    upgrades: [{ id: 'preview', maxLevel: UPGRADE_MAX_LEVEL }, { id: 'slow_start', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: true,
  },
  {
    id: 'garden',
    world: 'puzzle',
    stars: [1500, 3000, 5000],
    upgrades: [{ id: 'extra_move', maxLevel: UPGRADE_MAX_LEVEL }, { id: 'cascade', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'bubbles',
    world: 'bubbles',
    stars: [800, 2000, 4000],
    upgrades: [{ id: 'aim', maxLevel: UPGRADE_MAX_LEVEL }, { id: 'next', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: true,
  },
];

export const GAME_IDS: readonly GameId[] = GAMES.map((g) => g.id);

export function gameById(id: GameId): Game {
  const game = GAMES.find((g) => g.id === id);
  if (!game) throw new Error(`unknown game ${id}`);
  return game;
}

export function worldById(id: WorldId): World {
  const world = WORLDS.find((w) => w.id === id);
  if (!world) throw new Error(`unknown world ${id}`);
  return world;
}

export function worldOfGame(id: GameId): World {
  return worldById(gameById(id).world);
}

/** Stars earned by a score: 0-3 (a score equal to a threshold earns the star). */
export function starsForScore(game: GameId, score: number): number {
  const { stars } = gameById(game);
  let n = 0;
  for (const threshold of stars) if (score >= threshold) n++;
  return n;
}

/** Stars are kept forever: the best of the two. */
export function mergeStars(current: number, earned: number): number {
  return Math.max(current, earned);
}

export type ChallengeId = 'rounds3' | 'games2' | 'star1' | 'combos5' | 'coins200' | 'score_blocks' | 'score_garden' | 'score_bubbles';

export type ChallengeDef = {
  id: ChallengeId;
  kind: 'rounds' | 'distinctGames' | 'newStars' | 'combos' | 'coins' | 'score';
  target: number;
  game?: GameId; // for 'score'
  reward: { coins?: number; xp?: number };
  /** Minimum number of unlocked games for the challenge to be drawable. */
  minGames: number;
  /** Always the first challenge of the day. */
  fixedFirst?: boolean;
};

export const CHALLENGES: readonly ChallengeDef[] = [
  { id: 'rounds3', kind: 'rounds', target: 3, reward: { coins: 25 }, minGames: 1, fixedFirst: true },
  { id: 'games2', kind: 'distinctGames', target: 2, reward: { coins: 25 }, minGames: 2 },
  { id: 'star1', kind: 'newStars', target: 1, reward: { coins: 50 }, minGames: 1 },
  { id: 'combos5', kind: 'combos', target: 5, reward: { coins: 50 }, minGames: 1 },
  { id: 'coins200', kind: 'coins', target: 200, reward: { xp: 50 }, minGames: 1 },
  { id: 'score_blocks', kind: 'score', target: 1000, game: 'blocks', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_garden', kind: 'score', target: 1500, game: 'garden', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_bubbles', kind: 'score', target: 800, game: 'bubbles', reward: { coins: 50 }, minGames: 1 },
];

export const CHALLENGES_PER_DAY = 3;
export const ALL_CHALLENGES_BONUS_COINS = 50;

export type AchievementId =
  | 'first_round'
  | 'rounds10'
  | 'rounds100'
  | 'first_star'
  | 'all_stars'
  | 'explorer'
  | 'first_upgrade'
  | 'maxed_upgrade'
  | 'level5'
  | 'level10'
  | 'week'
  | 'rich';

export type AchievementDef = {
  id: AchievementId;
  kind: 'rounds' | 'stars' | 'gamesPlayed' | 'upgradesBought' | 'maxedUpgrades' | 'level' | 'week' | 'lifetimeCoins';
  target: number;
  coins: number;
};

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first_round', kind: 'rounds', target: 1, coins: 25 },
  { id: 'rounds10', kind: 'rounds', target: 10, coins: 50 },
  { id: 'rounds100', kind: 'rounds', target: 100, coins: 200 },
  { id: 'first_star', kind: 'stars', target: 1, coins: 50 },
  { id: 'all_stars', kind: 'stars', target: GAMES.length * STARS_PER_GAME, coins: 500 },
  { id: 'explorer', kind: 'gamesPlayed', target: GAMES.length, coins: 100 },
  { id: 'first_upgrade', kind: 'upgradesBought', target: 1, coins: 50 },
  { id: 'maxed_upgrade', kind: 'maxedUpgrades', target: 1, coins: 150 },
  { id: 'level5', kind: 'level', target: 5, coins: 100 },
  { id: 'level10', kind: 'level', target: 10, coins: 250 },
  { id: 'week', kind: 'week', target: 1, coins: 200 },
  { id: 'rich', kind: 'lifetimeCoins', target: 5000, coins: 150 },
];

/** Day 1-7 of the calendar → coins (and XP on day 7). */
export const DAILY_REWARDS: readonly { coins: number; xp: number }[] = [
  { coins: 100, xp: 0 },
  { coins: 150, xp: 0 },
  { coins: 200, xp: 0 },
  { coins: 250, xp: 0 },
  { coins: 300, xp: 0 },
  { coins: 400, xp: 0 },
  { coins: 600, xp: 100 },
];

export const LEVEL_CAP = 50;
export const XP_PER_ROUND_CAP = 100;
export const XP_PER_NEW_STAR = 25;
export const COINS_PER_NEW_STAR = 50;
export const SHORT_ROUND_SECONDS = 20;

/** XP needed to go from level L to L+1. */
export function xpToNextLevel(level: number): number {
  return 100 * level;
}

/** Coins granted when reaching `newLevel`. */
export function levelUpCoins(newLevel: number): number {
  return 25 * newLevel;
}
