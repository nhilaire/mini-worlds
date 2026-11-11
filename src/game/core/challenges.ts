// Daily challenges (docs/PRD.md "Daily challenges"): a deterministic draw per local date and progress counted from
// settled rounds. Pure functions; rewards are granted by the engine.
import { ALL_CHALLENGES_BONUS_COINS, ChallengeDef, ChallengeId, CHALLENGES, CHALLENGES_PER_DAY, GameId, WORLDS } from './content';
import { createRng, hashString } from '../rng';
import type { ChallengesSave, Save } from './save';

export function challengeById(id: ChallengeId): ChallengeDef {
  const def = CHALLENGES.find((c) => c.id === id);
  if (!def) throw new Error(`unknown challenge ${id}`);
  return def;
}

/** Games the player can play now (their world is unlocked). */
export function unlockedGames(save: Save): GameId[] {
  return WORLDS.filter((w) => save.unlockedWorlds.includes(w.id)).flatMap((w) => w.games);
}

/**
 * Draws the challenges of a date: « Jouer 3 parties » first, then two others drawn without replacement among the
 * eligible pool. Seed = hash of the date, or the session seed when given (seed deep link).
 */
export function drawChallenges(date: string, unlocked: readonly GameId[], sessionSeed?: number): ChallengeId[] {
  const eligible = CHALLENGES.filter((c) => unlocked.length >= c.minGames && (!c.game || unlocked.includes(c.game)));
  const first = eligible.filter((c) => c.fixedFirst).map((c) => c.id);
  const rest = eligible.filter((c) => !c.fixedFirst).map((c) => c.id);
  const rng = createRng(sessionSeed ?? hashString(date));
  return [...first, ...rng.shuffle(rest).slice(0, CHALLENGES_PER_DAY - first.length)];
}

/** Makes sure the save holds the challenges of `date` (draws them and discards older progress otherwise). */
export function ensureChallenges(save: Save, date: string, sessionSeed?: number): Save {
  if (save.challenges.date === date && save.challenges.ids.length === CHALLENGES_PER_DAY) return save;
  const challenges: ChallengesSave = {
    date,
    ids: drawChallenges(date, unlockedGames(save), sessionSeed),
    progress: {},
    completed: [],
    allDoneBonus: false,
    gamesPlayed: [],
  };
  return { ...save, challenges };
}

export type SettledRound = { game: GameId; score: number; newStars: number; combos: number; coins: number };

export type ChallengeUpdate = { save: Save; completed: ChallengeId[]; coins: number; xp: number; allDone: boolean };

function progressOf(def: ChallengeDef, state: ChallengesSave, round: SettledRound, gamesPlayed: GameId[]): number {
  const current = state.progress[def.id] ?? 0;
  switch (def.kind) {
    case 'rounds':
      return current + 1;
    case 'distinctGames':
      return gamesPlayed.length;
    case 'newStars':
      return current + round.newStars;
    case 'combos':
      return current + round.combos;
    case 'coins':
      return current + round.coins;
    case 'score':
      return def.game === round.game ? Math.max(current, round.score) : current;
  }
}

/** Counts a settled round for the day's challenges and lists the ones that complete now (rewards once). */
export function applyRoundToChallenges(save: Save, round: SettledRound): ChallengeUpdate {
  const state = save.challenges;
  const gamesPlayed = state.gamesPlayed.includes(round.game) ? state.gamesPlayed : [...state.gamesPlayed, round.game];
  const progress = { ...state.progress };
  const completed: ChallengeId[] = [];
  let coins = 0;
  let xp = 0;
  for (const id of state.ids) {
    if (state.completed.includes(id)) continue;
    const def = challengeById(id);
    const value = progressOf(def, state, round, gamesPlayed);
    progress[id] = value;
    if (value >= def.target) {
      completed.push(id);
      coins += def.reward.coins ?? 0;
      xp += def.reward.xp ?? 0;
    }
  }
  const allCompleted = [...state.completed, ...completed];
  const allDone = !state.allDoneBonus && state.ids.length === CHALLENGES_PER_DAY && state.ids.every((id) => allCompleted.includes(id));
  if (allDone) coins += ALL_CHALLENGES_BONUS_COINS;
  return {
    save: { ...save, challenges: { ...state, progress, completed: allCompleted, allDoneBonus: state.allDoneBonus || allDone, gamesPlayed } },
    completed,
    coins,
    xp,
    allDone,
  };
}

export function challengeProgress(save: Save, id: ChallengeId): { done: number; target: number; completed: boolean } {
  const def = challengeById(id);
  const done = Math.min(def.target, save.challenges.progress[id] ?? 0);
  return { done, target: def.target, completed: save.challenges.completed.includes(id) };
}
