import { GAME_IDS, WORLDS } from '../../game/core/content';
import { dailyGameFor, drawDailyGame, ensureDailyGame } from '../../game/core/dailyGame';
import { settleRound } from '../../game/core/engine';
import { roundCoins } from '../../game/core/progression';
import { defaultSave, parseSave, Save, serializeSave } from '../../game/core/save';
import { playableGames } from '../../game/core/unlocks';

const DATE = '2026-11-23';

/** Every world of the version open and every game playable (as the /unlocked test link). */
function allOpen(): Save {
  return { ...defaultSave(), unlockedWorlds: WORLDS.filter((w) => !w.comingSoon).map((w) => w.id), sessionAllGames: true };
}

describe('game of the day (AC-111)', () => {
  it('is drawn among the playable games, identical for the same date and set, and follows the session seed', () => {
    const playable = playableGames(allOpen());
    expect(playable.length).toBe(GAME_IDS.length);
    const dates = ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'];
    const drawn = dates.map((d) => drawDailyGame(d, playable));
    for (const [i, d] of dates.entries()) {
      expect(playable).toContain(drawn[i]);
      expect(drawDailyGame(d, playable)).toBe(drawn[i]);
    }
    expect(new Set(drawn).size).toBeGreaterThan(1); // it changes from day to day
    expect(drawDailyGame('2026-11-20', playable, 42)).toBe(drawDailyGame('2026-11-27', playable, 42));
  });

  it('is never a locked game: a fresh save only plays Pluie de Blocs', () => {
    for (const d of ['2026-11-01', '2026-11-02', '2026-11-03']) expect(dailyGameFor(defaultSave(), d)).toBe('blocks');
  });

  it('is saved the first time on a date, and a game unlocked later that day does not change it', () => {
    const saved = ensureDailyGame(defaultSave(), DATE);
    expect(saved.dailyGame).toEqual({ date: DATE, gameId: 'blocks' });
    expect(ensureDailyGame(saved, DATE)).toBe(saved);
    const later = { ...saved, unlockedWorlds: allOpen().unlockedWorlds, sessionAllGames: true };
    expect(dailyGameFor(later, DATE)).toBe('blocks');
    expect(ensureDailyGame(later, DATE).dailyGame).toEqual({ date: DATE, gameId: 'blocks' });
    // The next day draws again among the new set.
    expect(ensureDailyGame(later, '2026-11-24').dailyGame).toEqual({ date: '2026-11-24', gameId: drawDailyGame('2026-11-24', playableGames(later)) });
  });

  it('survives a save round trip, and an older save without it loads with no game of the day', () => {
    const saved = ensureDailyGame(defaultSave(), DATE);
    expect(parseSave(serializeSave(saved)).save.dailyGame).toEqual({ date: DATE, gameId: 'blocks' });
    const old = JSON.parse(serializeSave(defaultSave()));
    delete old.dailyGame;
    expect(parseSave(JSON.stringify(old)).save.dailyGame).toEqual({ date: null, gameId: null });
  });

  it('doubles the round coins (not the new-star coins) of a settled round started that date', () => {
    expect(roundCoins(1005, 1, 3, 2)).toBe(Math.floor(50 * 1.3 * 2) + 50);
    const { save, result } = settleRound(defaultSave(), { game: 'blocks', score: 1000, durationS: 60, combos: 0, outcome: 'ended', date: DATE, startDate: DATE });
    expect(result.dailyGame).toBe(true);
    expect(result.newStars).toBe(1);
    expect(result.coins).toBe((10 + 40) * 2 + 50);
    expect(save.profile.lifetimeCoins).toBeGreaterThanOrEqual(result.coins);
    expect(save.dailyGame).toEqual({ date: DATE, gameId: 'blocks' });
  });

  it('does not double another game, a round started on another date, or a short round', () => {
    const open = ensureDailyGame(allOpen(), DATE);
    const daily = open.dailyGame.gameId;
    const other = GAME_IDS.find((g) => g !== daily)!;
    const notDaily = settleRound(open, { game: other, score: 0, durationS: 60, combos: 0, outcome: 'ended', date: DATE, startDate: DATE });
    expect(notDaily.result.dailyGame).toBe(false);
    expect(notDaily.result.coins).toBe(10);
    const yesterday = settleRound(defaultSave(), { game: 'blocks', score: 0, durationS: 60, combos: 0, outcome: 'ended', date: DATE, startDate: '2026-11-22' });
    expect(yesterday.result.dailyGame).toBe(true); // blocks was also the game of 11-22 (only playable game)
    const savedOther = { ...defaultSave(), dailyGame: { date: '2026-11-22', gameId: 'tower' as const } };
    const started = settleRound(savedOther, { game: 'blocks', score: 0, durationS: 60, combos: 0, outcome: 'ended', date: DATE, startDate: '2026-11-22' });
    expect(started.result.dailyGame).toBe(false);
    expect(started.result.coins).toBe(10);
    const short = settleRound(defaultSave(), { game: 'blocks', score: 3000, durationS: 10, combos: 0, outcome: 'ended', date: DATE, startDate: DATE });
    expect(short.result.coins).toBe(0);
    expect(short.result.dailyGame).toBe(false);
  });

  it('counts the doubled coins for « Gagner 200 pièces en jouant »', () => {
    const save: Save = {
      ...defaultSave(),
      challenges: { date: DATE, ids: ['rounds3', 'coins200', 'star1'], progress: {}, completed: [], allDoneBonus: false, gamesPlayed: [] },
    };
    const { save: next, result } = settleRound(save, { game: 'blocks', score: 2000, durationS: 60, combos: 0, outcome: 'ended', date: DATE, startDate: DATE });
    expect(result.coins).toBe((10 + 80) * 2 + 50);
    expect(next.challenges.progress.coins200).toBe(result.coins);
  });
});
