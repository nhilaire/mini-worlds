// Content catalogue of v0.4.0 (docs/PRD.md "Rules and scoring"): worlds, games, stars, upgrades, challenges,
// achievements, daily rewards. Pure data and tiny pure helpers; no React, no storage.

export type GameId =
  | 'blocks'
  | 'garden'
  | 'bubbles'
  | 'tower'
  | 'hop'
  | 'lights'
  | 'pipes'
  | 'flood'
  | 'socks'
  | 'twentyone'
  | 'candles'
  | 'parrot'
  | 'moles'
  | 'fruit'
  | 'slide'
  | 'cardline'
  | 'marbles'
  | 'quicksum'
  | 'army'
  | 'merge'
  | 'maze'
  | 'trail'
  | 'treasure'
  | 'dash'
  | 'tiles'
  | 'conquest'
  | 'defense'
  | 'hands'
  | 'patience'
  | 'darts'
  | 'shot'
  | 'pattern'
  | 'chain'
  | 'laser'
  | 'twins';
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
  games: readonly GameId[]; // games present in this version, in unlock order (the k-th needs 2 × (k − 1) stars in the world)
  conditions: readonly UnlockCondition[]; // all must hold (AND); empty = open from the start
  comingSoon: boolean; // never unlocks in this version, conditions are indicative
};

export const WORLDS: readonly World[] = [
  { id: 'arcade', index: 1, games: ['blocks', 'tower', 'hop', 'fruit', 'dash'], conditions: [], comingSoon: false },
  { id: 'puzzle', index: 2, games: ['garden', 'lights', 'pipes', 'slide', 'tiles'], conditions: [{ kind: 'starsIn', world: 'arcade', n: 2 }], comingSoon: false },
  {
    id: 'strategy',
    index: 3,
    games: ['army', 'merge', 'conquest', 'defense'],
    conditions: [
      { kind: 'starsTotal', n: 15 },
      { kind: 'level', n: 7 },
    ],
    comingSoon: false,
  },
  {
    id: 'cards',
    index: 4,
    games: ['socks', 'twentyone', 'cardline', 'hands', 'patience'],
    conditions: [
      { kind: 'starsTotal', n: 6 },
      { kind: 'level', n: 4 },
    ],
    comingSoon: false,
  },
  {
    id: 'bubbles',
    index: 5,
    games: ['bubbles', 'flood', 'marbles'],
    conditions: [
      { kind: 'starsTotal', n: 4 },
      { kind: 'level', n: 3 },
    ],
    comingSoon: false,
  },
  {
    id: 'skill',
    index: 6,
    games: ['candles', 'darts', 'shot'],
    conditions: [
      { kind: 'starsTotal', n: 9 },
      { kind: 'level', n: 5 },
    ],
    comingSoon: false,
  },
  { id: 'building', index: 7, games: [], conditions: [{ kind: 'level', n: 12 }], comingSoon: true },
  {
    id: 'exploration',
    index: 8,
    games: ['maze', 'trail', 'treasure'],
    conditions: [
      { kind: 'starsTotal', n: 18 },
      { kind: 'level', n: 8 },
    ],
    comingSoon: false,
  },
  {
    id: 'memory',
    index: 9,
    games: ['parrot', 'moles', 'quicksum', 'pattern', 'chain'],
    conditions: [
      { kind: 'starsTotal', n: 12 },
      { kind: 'level', n: 6 },
    ],
    comingSoon: false,
  },
  {
    id: 'challenges',
    index: 10,
    games: ['laser', 'twins'],
    conditions: [
      { kind: 'starsTotal', n: 30 },
      { kind: 'level', n: 10 },
    ],
    comingSoon: false,
  },
];

export const SLOTS_PER_WORLD = 5;
export const STARS_PER_GAME = 3;

export type UpgradeId =
  | 'preview'
  | 'slow_start'
  | 'extra_move'
  | 'cascade'
  | 'aim'
  | 'next'
  | 'coins'
  | 'wide'
  | 'shield'
  | 'hint'
  | 'more_moves'
  | 'peek'
  | 'extra_hand'
  | 'slow_spin'
  | 'second_chance'
  | 'radar'
  | 'sweep'
  | 'extra_time'
  | 'recruits'
  | 'veteran'
  | 'detector'
  | 'guard'
  | 'undo'
  | 'reinforce'
  | 'arsenal'
  | 'redraw'
  | 'wild'
  | 'steady'
  | 'sight'
  | 'shuffle';

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
  {
    id: 'tower',
    world: 'arcade',
    stars: [150, 300, 500],
    upgrades: [{ id: 'wide', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: true,
  },
  {
    id: 'hop',
    world: 'arcade',
    stars: [150, 350, 600],
    upgrades: [{ id: 'shield', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: true,
  },
  {
    id: 'lights',
    world: 'puzzle',
    stars: [500, 750, 950],
    upgrades: [{ id: 'hint', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'pipes',
    world: 'puzzle',
    stars: [2350, 3550, 5750], // v0.4.0 phone test: endless growing grids with a clock, from the casual bot (p25 2 325, p90 3 570, median 2 872)
    upgrades: [{ id: 'hint', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'flood',
    world: 'bubbles',
    stars: [800, 2000, 3500],
    upgrades: [{ id: 'more_moves', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'socks',
    world: 'cards',
    stars: [800, 1600, 2800],
    upgrades: [{ id: 'peek', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'twentyone',
    world: 'cards',
    stars: [400, 600, 750],
    upgrades: [{ id: 'extra_hand', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'candles',
    world: 'skill',
    stars: [200, 450, 800],
    upgrades: [{ id: 'slow_spin', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: true,
  },
  {
    id: 'parrot',
    world: 'memory',
    stars: [150, 400, 800],
    upgrades: [{ id: 'second_chance', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'moles',
    world: 'memory',
    stars: [400, 900, 1500],
    upgrades: [{ id: 'radar', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'fruit',
    world: 'arcade',
    stars: [3550, 4400, 7850],
    upgrades: [{ id: 'sweep', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'slide',
    world: 'puzzle',
    stars: [500, 900, 1300],
    upgrades: [{ id: 'hint', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'cardline',
    world: 'cards',
    stars: [500, 750, 950],
    upgrades: [{ id: 'hint', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'marbles',
    world: 'bubbles',
    stars: [300, 700, 1000],
    upgrades: [{ id: 'extra_time', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: true,
  },
  {
    id: 'quicksum',
    world: 'memory',
    stars: [300, 700, 1200],
    upgrades: [{ id: 'extra_time', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: true,
  },
  {
    id: 'army',
    world: 'strategy',
    stars: [300, 800, 1500],
    upgrades: [{ id: 'recruits', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'merge',
    world: 'strategy',
    stars: [200, 500, 1000],
    upgrades: [{ id: 'veteran', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'maze',
    world: 'exploration',
    stars: [300, 700, 1200],
    upgrades: [{ id: 'extra_time', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: true,
  },
  {
    id: 'trail',
    world: 'exploration',
    stars: [600, 1000, 1400],
    upgrades: [{ id: 'hint', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'treasure',
    world: 'exploration',
    stars: [400, 700, 1000],
    upgrades: [{ id: 'detector', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'dash',
    world: 'arcade',
    stars: [450, 550, 950], // v0.4.0 phone test: endless run, from the reaction bot (p25 430, p90 550, median 470)
    upgrades: [{ id: 'guard', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: true,
  },
  {
    id: 'tiles',
    world: 'puzzle',
    stars: [3700, 4650, 8400],
    upgrades: [{ id: 'undo', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'conquest',
    world: 'strategy',
    stars: [550, 1400, 1700], // v0.4.0 phone test: training map + no own moves, from the casual bot (p25 540, p90 1 390, median 860)
    upgrades: [{ id: 'reinforce', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'defense',
    world: 'strategy',
    stars: [950, 1250, 1400],
    upgrades: [{ id: 'arsenal', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: true,
  },
  {
    id: 'hands',
    world: 'cards',
    stars: [150, 250, 350],
    upgrades: [{ id: 'redraw', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'patience',
    world: 'cards',
    stars: [250, 450, 650],
    upgrades: [{ id: 'wild', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'darts',
    world: 'skill',
    stars: [350, 550, 800],
    upgrades: [{ id: 'steady', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: true,
  },
  {
    id: 'shot',
    world: 'skill',
    stars: [500, 650, 800],
    upgrades: [{ id: 'sight', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'pattern',
    world: 'memory',
    stars: [450, 600, 1050],
    upgrades: [{ id: 'extra_time', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: true,
  },
  {
    id: 'chain',
    world: 'memory',
    stars: [1350, 1600, 2500],
    upgrades: [{ id: 'shuffle', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'laser',
    world: 'challenges',
    stars: [1000, 1350, 1450],
    upgrades: [{ id: 'hint', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
  },
  {
    id: 'twins',
    world: 'challenges',
    stars: [700, 1150, 1400],
    upgrades: [{ id: 'hint', maxLevel: UPGRADE_MAX_LEVEL }, coinsUpgrade],
    realTime: false,
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

export type ChallengeId = 'rounds3' | 'games2' | 'star1' | 'combos5' | 'coins200' | `score_${GameId}`;

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
  { id: 'score_tower', kind: 'score', target: 150, game: 'tower', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_hop', kind: 'score', target: 150, game: 'hop', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_lights', kind: 'score', target: 500, game: 'lights', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_pipes', kind: 'score', target: 2350, game: 'pipes', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_flood', kind: 'score', target: 800, game: 'flood', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_socks', kind: 'score', target: 800, game: 'socks', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_twentyone', kind: 'score', target: 400, game: 'twentyone', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_candles', kind: 'score', target: 200, game: 'candles', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_parrot', kind: 'score', target: 150, game: 'parrot', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_moles', kind: 'score', target: 400, game: 'moles', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_fruit', kind: 'score', target: 3550, game: 'fruit', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_slide', kind: 'score', target: 500, game: 'slide', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_cardline', kind: 'score', target: 500, game: 'cardline', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_marbles', kind: 'score', target: 300, game: 'marbles', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_quicksum', kind: 'score', target: 300, game: 'quicksum', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_army', kind: 'score', target: 300, game: 'army', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_merge', kind: 'score', target: 200, game: 'merge', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_maze', kind: 'score', target: 300, game: 'maze', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_trail', kind: 'score', target: 600, game: 'trail', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_treasure', kind: 'score', target: 400, game: 'treasure', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_dash', kind: 'score', target: 450, game: 'dash', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_tiles', kind: 'score', target: 3700, game: 'tiles', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_conquest', kind: 'score', target: 550, game: 'conquest', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_defense', kind: 'score', target: 950, game: 'defense', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_hands', kind: 'score', target: 150, game: 'hands', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_patience', kind: 'score', target: 250, game: 'patience', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_darts', kind: 'score', target: 350, game: 'darts', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_shot', kind: 'score', target: 500, game: 'shot', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_pattern', kind: 'score', target: 450, game: 'pattern', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_chain', kind: 'score', target: 1350, game: 'chain', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_laser', kind: 'score', target: 1000, game: 'laser', reward: { coins: 50 }, minGames: 1 },
  { id: 'score_twins', kind: 'score', target: 700, game: 'twins', reward: { coins: 50 }, minGames: 1 },
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
  | 'globetrotter'
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
  { id: 'explorer', kind: 'gamesPlayed', target: 3, coins: 100 },
  { id: 'globetrotter', kind: 'gamesPlayed', target: 10, coins: 200 },
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
