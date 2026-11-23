// Core engine orchestration: a settled round, a daily collection or a purchase updates the save and returns a
// summary for the screens (docs/PRD.md "Common mini-game contract", "Result" screen). Pure: dates come from the caller.
import { AchievementId, ChallengeId, GameId, mergeStars, SHORT_ROUND_SECONDS, starsForScore, UpgradeId, WorldId } from './content';
import { checkAchievements } from './achievements';
import { applyRoundToChallenges, ensureChallenges } from './challenges';
import { collectDaily, DailyCollection } from './daily';
import { DAILY_GAME_COINS_MULTIPLIER, dailyGameFor, ensureDailyGame } from './dailyGame';
import { addCoins, addXp, LevelUp, roundCoins, roundXp } from './progression';
import { defaultGameSave, gameSave, Save, upgradeLevel } from './save';
import { checkUnlocks, newlyUnlockedGames } from './unlocks';
import { buyUpgrade, BuyResult } from './upgrades';

export type RoundOutcome = 'ended' | 'quit';

export type RoundInput = {
  game: GameId;
  score: number;
  /** Active play time in seconds (paused time excluded). */
  durationS: number;
  combos: number;
  outcome: RoundOutcome;
  /** Local date of the end of the round (YYYY-MM-DD). */
  date: string;
  /** Local date of the start of the round (game of the day); defaults to `date`. */
  startDate?: string;
  /** Session seed when the app was opened through the seed link (challenge draw). */
  sessionSeed?: number;
};

export type RoundResult = {
  game: GameId;
  score: number;
  short: boolean;
  newBest: boolean;
  bestScore: number;
  starsBefore: number;
  starsAfter: number;
  newStars: number;
  coins: number; // coins from the round itself (not level-ups, challenges, achievements)
  xp: number;
  levelUps: LevelUp[];
  worldsUnlocked: WorldId[];
  /** Games that became playable inside a world that was already open (« Nouveau jeu : … ! »). */
  gamesUnlocked: GameId[];
  challengesCompleted: ChallengeId[];
  allChallengesBonus: boolean;
  achievementsUnlocked: AchievementId[];
  outcome: RoundOutcome | 'short';
  /** A settled round of the game of the day (round coins doubled). */
  dailyGame: boolean;
};

function recordDay(save: Save, date: string): Save {
  if (save.profile.lastPlayedDate === date) return save;
  return { ...save, profile: { ...save.profile, lastPlayedDate: date, daysPlayed: save.profile.daysPlayed + 1 } };
}

function recordRecent(save: Save, game: GameId): Save {
  const recentGames = [game, ...save.profile.recentGames.filter((g) => g !== game)].slice(0, 3);
  return { ...save, profile: { ...save.profile, lastPlayedGame: game, recentGames } };
}

/** Settles a round: stars, coins, XP, level-ups, unlocks, challenges, achievements. Short rounds grant nothing. */
export function settleRound(save: Save, round: RoundInput): { save: Save; result: RoundResult } {
  const before = gameSave(save, round.game);
  const base: RoundResult = {
    game: round.game,
    score: round.score,
    short: false,
    newBest: false,
    bestScore: before.bestScore,
    starsBefore: before.stars,
    starsAfter: before.stars,
    newStars: 0,
    coins: 0,
    xp: 0,
    levelUps: [],
    worldsUnlocked: [],
    gamesUnlocked: [],
    challengesCompleted: [],
    allChallengesBonus: false,
    achievementsUnlocked: [],
    outcome: round.outcome,
    dailyGame: false,
  };
  if (round.durationS < SHORT_ROUND_SECONDS) {
    return { save: recordRecent(save, round.game), result: { ...base, short: true, outcome: 'short' } };
  }

  // The game of the day is the one of the date the round started (saved before a later unlock can change the draw).
  const dailyGame = dailyGameFor(save, round.startDate ?? round.date, round.sessionSeed) === round.game;
  let next = ensureChallenges(recordDay(recordRecent(save, round.game), round.date), round.date, round.sessionSeed);
  next = ensureDailyGame(next, round.date, round.sessionSeed);

  // Stars and best score.
  const earned = starsForScore(round.game, round.score);
  const starsAfter = mergeStars(before.stars, earned);
  const newStars = starsAfter - before.stars;
  const newBest = round.score > before.bestScore;
  const game = { ...(next.games[round.game] ?? defaultGameSave()), bestScore: Math.max(before.bestScore, round.score), stars: starsAfter, rounds: before.rounds + 1 };
  next = { ...next, games: { ...next.games, [round.game]: game }, profile: { ...next.profile, roundsPlayed: next.profile.roundsPlayed + 1 } };

  // Coins and XP of the round.
  const coins = roundCoins(round.score, newStars, upgradeLevel(next, round.game, 'coins'), dailyGame ? DAILY_GAME_COINS_MULTIPLIER : 1);
  const xp = roundXp(round.score, newStars);
  next = { ...next, profile: addCoins(next.profile, coins) };
  const leveled = addXp(next.profile, xp);
  next = { ...next, profile: leveled.profile };

  // Challenges of the day.
  const challenges = applyRoundToChallenges(next, { game: round.game, score: round.score, newStars, combos: round.combos, coins });
  next = challenges.save;
  next = { ...next, profile: addCoins(next.profile, challenges.coins) };
  const challengeLevels = addXp(next.profile, challenges.xp);
  next = { ...next, profile: challengeLevels.profile };

  // Unlocks and achievements (achievement coins never trigger a level-up: coins carry no XP).
  const unlocks = checkUnlocks(next);
  next = unlocks.save;
  const achievements = checkAchievements(next);
  next = achievements.save;
  const unlocksAfter = checkUnlocks(next); // an achievement cannot change stars or level, kept for safety
  next = unlocksAfter.save;

  return {
    save: next,
    result: {
      ...base,
      newBest,
      bestScore: game.bestScore,
      starsAfter,
      newStars,
      coins,
      xp,
      dailyGame,
      levelUps: [...leveled.levelUps, ...challengeLevels.levelUps],
      worldsUnlocked: [...unlocks.unlocked, ...unlocksAfter.unlocked],
      gamesUnlocked: newlyUnlockedGames(save, next),
      challengesCompleted: challenges.completed,
      allChallengesBonus: challenges.allDone,
      achievementsUnlocked: achievements.unlocked,
    },
  };
}

export type CollectResult = {
  reward: DailyCollection;
  levelUps: LevelUp[];
  worldsUnlocked: WorldId[];
  achievementsUnlocked: AchievementId[];
};

/** Collects today's reward (coins, XP on day 7) and applies the level-ups, unlocks and achievements it triggers. */
export function collectDailyReward(save: Save, date: string): { save: Save; result: CollectResult } | null {
  const collected = collectDaily(save, date);
  if (!collected) return null;
  let next = collected.save;
  next = { ...next, profile: addCoins(next.profile, collected.reward.coins) };
  const leveled = addXp(next.profile, collected.reward.xp);
  next = { ...next, profile: leveled.profile };
  const unlocks = checkUnlocks(next);
  next = unlocks.save;
  const achievements = checkAchievements(next);
  next = achievements.save;
  return {
    save: next,
    result: { reward: collected.reward, levelUps: leveled.levelUps, worldsUnlocked: unlocks.unlocked, achievementsUnlocked: achievements.unlocked },
  };
}

export type PurchaseResult = BuyResult & { achievementsUnlocked: AchievementId[] };

/** Buys an upgrade and checks the achievements it may unlock. */
export function purchaseUpgrade(save: Save, game: GameId, upgrade: UpgradeId): PurchaseResult {
  const bought = buyUpgrade(save, game, upgrade);
  if ('refused' in bought) return { ...bought, achievementsUnlocked: [] };
  const achievements = checkAchievements(bought.save);
  return { ...bought, save: achievements.save, achievementsUnlocked: achievements.unlocked };
}

/** Marks the tutorial of a game as done (last help bubble dismissed). */
export function completeTutorial(save: Save, game: GameId): Save {
  const current = gameSave(save, game);
  if (current.tutorialDone) return save;
  return { ...save, games: { ...save.games, [game]: { ...current, tutorialDone: true } } };
}

/** « Revoir le tutoriel »: the next round of the game is guided again. */
export function resetTutorial(save: Save, game: GameId): Save {
  const current = gameSave(save, game);
  return { ...save, games: { ...save.games, [game]: { ...current, tutorialDone: false } } };
}
