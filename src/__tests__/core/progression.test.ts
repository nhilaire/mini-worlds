import { CHALLENGES, LEVEL_CAP } from '../../game/core/content';
import { settleRound } from '../../game/core/engine';
import { addXp, roundCoins, roundXp, spendCoins } from '../../game/core/progression';
import { defaultSave } from '../../game/core/save';

const DATE = '2026-11-11';

describe('round rewards (AC-06)', () => {
  it.each([
    [3000, 1, 0, 95, 180],
    [0, 0, 0, 10, 10],
    [4500, 0, 0, 100, 190],
    [1000, 2, 0, 80, 150],
  ])('score %i with %i new stars and bonus %i gives %i XP and %i coins', (score, stars, bonus, xp, coins) => {
    expect(roundXp(score, stars)).toBe(xp);
    expect(roundCoins(score, stars, bonus)).toBe(coins);
  });

  it('coin bonus upgrade multiplies the base coins only, rounded down', () => {
    // base 10 + floor(1005/25) = 50 → ×1.3 = 65 ; +50 for one star
    expect(roundCoins(1005, 1, 3)).toBe(65 + 50);
    expect(roundCoins(0, 0, 1)).toBe(11);
  });

  it('a round shorter than 20 s grants nothing and is not counted', () => {
    const { save, result } = settleRound(defaultSave(), { game: 'blocks', score: 3000, durationS: 19, combos: 2, outcome: 'ended', date: DATE });
    expect(result.short).toBe(true);
    expect(result.outcome).toBe('short');
    expect(result.coins).toBe(0);
    expect(result.xp).toBe(0);
    expect(save.profile.coins).toBe(0);
    expect(save.profile.roundsPlayed).toBe(0);
    expect(save.games.blocks.stars).toBe(0);
    expect(save.games.blocks.bestScore).toBe(0);
    expect(save.achievements).toEqual([]);
    expect(save.profile.lastPlayedGame).toBe('blocks');
  });

  it('a 20 s round is settled', () => {
    const { save, result } = settleRound(defaultSave(), { game: 'blocks', score: 0, durationS: 20, combos: 0, outcome: 'quit', date: DATE });
    expect(result.short).toBe(false);
    expect(result.coins).toBe(10);
    expect(result.xp).toBe(10);
    expect(save.profile.roundsPlayed).toBe(1);
  });
});

describe('levels (AC-07)', () => {
  const profile = defaultSave().profile;

  it('reaches level 2 at 100 XP and carries the excess', () => {
    const { profile: p, levelUps } = addXp(profile, 130);
    expect(p.level).toBe(2);
    expect(p.xp).toBe(30);
    expect(levelUps).toEqual([{ level: 2, coins: 100 }]);
    expect(p.coins).toBe(100);
    expect(p.lifetimeCoins).toBe(100);
  });

  it('can gain several levels in one go: 350 XP at level 1 → level 3 with 50 XP left and 100 + 150 coins', () => {
    const { profile: p, levelUps } = addXp(profile, 350);
    expect(p.level).toBe(3);
    expect(p.xp).toBe(50);
    expect(levelUps.map((l) => l.level)).toEqual([2, 3]);
    expect(p.coins).toBe(250);
  });

  it('needs 100 × L XP to leave level L', () => {
    const { profile: p } = addXp({ ...profile, level: 4, xp: 399 }, 0);
    expect(p.level).toBe(4);
    expect(addXp({ ...profile, level: 4, xp: 399 }, 1).profile.level).toBe(5);
  });

  it('never exceeds level 50', () => {
    const { profile: p } = addXp({ ...profile, level: 49, xp: 0 }, 1_000_000);
    expect(p.level).toBe(LEVEL_CAP);
    expect(p.xp).toBe(1_000_000 - 4900);
  });

  it('spending is refused when unaffordable and never goes negative', () => {
    expect(spendCoins({ ...profile, coins: 50 }, 60)).toBeNull();
    expect(spendCoins({ ...profile, coins: 50 }, 50)?.coins).toBe(0);
  });
});

describe('settled round summary', () => {
  it('reports new best, new stars, level-ups and achievements', () => {
    const { save, result } = settleRound(defaultSave(), { game: 'blocks', score: 1500, durationS: 60, combos: 1, outcome: 'ended', date: DATE });
    expect(result.newBest).toBe(true);
    expect(result.bestScore).toBe(1500);
    expect(result.starsBefore).toBe(0);
    expect(result.starsAfter).toBe(1); // 1500 < 2500: one star with the thresholds of the first phone test
    expect(result.newStars).toBe(1);
    expect(result.xp).toBe(40 + 25);
    expect(result.coins).toBe(70 + 50);
    expect(result.levelUps).toEqual([]); // 65 XP < 100
    expect(result.achievementsUnlocked).toEqual(['first_round', 'first_star']);
    const challengeCoins = result.challengesCompleted.reduce((n, id) => n + (CHALLENGES.find((c) => c.id === id)?.reward.coins ?? 0), 0);
    expect(save.profile.coins).toBe(120 + 25 + 50 + challengeCoins + (result.allChallengesBonus ? 100 : 0));
    expect(save.games.blocks.rounds).toBe(1);

    const again = settleRound(save, { game: 'blocks', score: 600, durationS: 60, combos: 0, outcome: 'ended', date: DATE });
    expect(again.result.newBest).toBe(false);
    expect(again.result.newStars).toBe(0);
    expect(again.result.starsAfter).toBe(1);
    expect(again.save.games.blocks.bestScore).toBe(1500);
  });

  it('counts a day played once per date and keeps the three most recent games', () => {
    let save = defaultSave();
    save = settleRound(save, { game: 'blocks', score: 100, durationS: 30, combos: 0, outcome: 'ended', date: DATE }).save;
    save = settleRound(save, { game: 'blocks', score: 100, durationS: 30, combos: 0, outcome: 'ended', date: DATE }).save;
    expect(save.profile.daysPlayed).toBe(1);
    save = settleRound(save, { game: 'garden', score: 100, durationS: 30, combos: 0, outcome: 'ended', date: '2026-11-12' }).save;
    expect(save.profile.daysPlayed).toBe(2);
    expect(save.profile.recentGames).toEqual(['garden', 'blocks']);
    expect(save.profile.lastPlayedGame).toBe('garden');
  });
});
