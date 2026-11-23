// Game of the day (docs/PRD.md "Game of the day", v0.4.0 phone test): one playable game per local date, drawn with
// the date hash (or the session seed), saved the first time it is computed on a date so that a game unlocked later
// that day does not change it. Its settled rounds earn twice the round coins (applied by the engine).
import type { GameId } from './content';
import { hashString } from '../rng';
import type { Save } from './save';
import { playableGames } from './unlocks';

export const DAILY_GAME_COINS_MULTIPLIER = 2;

/** The game of a date among the playable games (catalogue order): index = seed mod count. */
export function drawDailyGame(date: string, playable: readonly GameId[], sessionSeed?: number): GameId {
  const seed = sessionSeed ?? hashString(date);
  return playable[(seed >>> 0) % playable.length];
}

/** The game of the day of `date`: the saved one when it was already computed that date, else a fresh draw. */
export function dailyGameFor(save: Save, date: string, sessionSeed?: number): GameId {
  if (save.dailyGame.date === date && save.dailyGame.gameId !== null) return save.dailyGame.gameId;
  return drawDailyGame(date, playableGames(save), sessionSeed);
}

/** Makes sure the save holds the game of the day of `date` (saved once per date). */
export function ensureDailyGame(save: Save, date: string, sessionSeed?: number): Save {
  if (save.dailyGame.date === date && save.dailyGame.gameId !== null) return save;
  return { ...save, dailyGame: { date, gameId: drawDailyGame(date, playableGames(save), sessionSeed) } };
}
