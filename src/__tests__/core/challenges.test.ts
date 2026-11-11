import { applyRoundToChallenges, challengeProgress, drawChallenges, ensureChallenges, unlockedGames } from '../../game/core/challenges';
import { CHALLENGES } from '../../game/core/content';
import { settleRound } from '../../game/core/engine';
import { defaultSave, Save } from '../../game/core/save';

const DATE = '2026-11-11';

function withChallenges(ids: Parameters<typeof applyRoundToChallenges>[0]['challenges']['ids']): Save {
  const save = defaultSave();
  return { ...save, challenges: { date: DATE, ids, progress: {}, completed: [], allDoneBonus: false, gamesPlayed: [] } };
}

describe('daily challenge draw (AC-12)', () => {
  it('draws 3 distinct challenges, « Jouer 3 parties » first, only for unlocked games', () => {
    const ids = drawChallenges(DATE, ['blocks']);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe('rounds3');
    expect(ids).not.toContain('games2');
    expect(ids).not.toContain('score_garden');
    expect(ids).not.toContain('score_bubbles');
  });

  it('is identical for the same date and unlocked set, and may differ for another date', () => {
    expect(drawChallenges(DATE, ['blocks', 'garden'])).toEqual(drawChallenges(DATE, ['blocks', 'garden']));
    const draws = new Set(['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'].map((d) => drawChallenges(d, ['blocks', 'garden', 'bubbles']).join()));
    expect(draws.size).toBeGreaterThan(1);
  });

  it('a session seed replaces the date hash', () => {
    expect(drawChallenges(DATE, ['blocks'], 1)).toEqual(drawChallenges('2026-12-25', ['blocks'], 1));
  });

  it('games2 is only drawable with 2+ unlocked games', () => {
    const seeds = Array.from({ length: 50 }, (_, i) => i);
    expect(seeds.some((s) => drawChallenges(DATE, ['blocks', 'garden'], s).includes('games2'))).toBe(true);
    expect(seeds.some((s) => drawChallenges(DATE, ['blocks'], s).includes('games2'))).toBe(false);
  });

  it('ensureChallenges draws for a new date and discards the previous progress', () => {
    let save = ensureChallenges(defaultSave(), DATE);
    expect(save.challenges.date).toBe(DATE);
    save = applyRoundToChallenges(save, { game: 'blocks', score: 100, newStars: 0, combos: 0, coins: 14 }).save;
    expect(save.challenges.progress.rounds3).toBe(1);
    const next = ensureChallenges(save, '2026-11-12');
    expect(next.challenges.date).toBe('2026-11-12');
    expect(next.challenges.progress).toEqual({});
    expect(ensureChallenges(next, '2026-11-12')).toBe(next);
    expect(unlockedGames(save)).toEqual(['blocks']);
  });
});

describe('daily challenge progress (AC-13)', () => {
  it('rounds, distinct games, new stars, combos, coins and per-game score follow their definitions', () => {
    let save = withChallenges(['rounds3', 'games2', 'star1']);
    let step = applyRoundToChallenges(save, { game: 'blocks', score: 100, newStars: 0, combos: 0, coins: 14 });
    expect(step.completed).toEqual([]);
    expect(step.save.challenges.progress).toEqual({ rounds3: 1, games2: 1, star1: 0 });
    step = applyRoundToChallenges(step.save, { game: 'garden', score: 100, newStars: 1, combos: 0, coins: 14 });
    expect(step.completed).toEqual(['games2', 'star1']);
    expect(step.coins).toBe(50 + 75);
    step = applyRoundToChallenges(step.save, { game: 'garden', score: 100, newStars: 1, combos: 0, coins: 14 });
    expect(step.completed).toEqual(['rounds3']);
    expect(step.coins).toBe(50 + 100); // third challenge → all-done bonus
    expect(step.allDone).toBe(true);
    save = step.save;
    expect(challengeProgress(save, 'rounds3')).toEqual({ done: 3, target: 3, completed: true });
    // nothing more is granted
    const more = applyRoundToChallenges(save, { game: 'garden', score: 100, newStars: 1, combos: 0, coins: 14 });
    expect(more.completed).toEqual([]);
    expect(more.coins).toBe(0);
    expect(more.allDone).toBe(false);
  });

  it('combos, coins and score challenges', () => {
    let step = applyRoundToChallenges(withChallenges(['combos5', 'coins200', 'score_blocks']), { game: 'blocks', score: 499, newStars: 0, combos: 3, coins: 150 });
    expect(step.completed).toEqual([]);
    step = applyRoundToChallenges(step.save, { game: 'garden', score: 600, newStars: 0, combos: 2, coins: 60 });
    expect(step.completed).toEqual(['combos5', 'coins200']);
    expect(step.xp).toBe(50);
    expect(step.save.challenges.progress.score_blocks).toBe(499);
    step = applyRoundToChallenges(step.save, { game: 'blocks', score: 500, newStars: 0, combos: 0, coins: 30 });
    expect(step.completed).toEqual(['score_blocks']);
    expect(step.allDone).toBe(true);
  });

  it('a settled round through the engine grants the challenge rewards once', () => {
    const save = withChallenges(['rounds3', 'star1', 'score_blocks']);
    const { save: next, result } = settleRound(save, { game: 'blocks', score: 500, durationS: 30, combos: 0, outcome: 'ended', date: DATE });
    expect(result.challengesCompleted).toEqual(['star1', 'score_blocks']);
    const expectedCoins = result.coins + 75 + 75 + 25 + 50; // round + two challenges + first_round + first_star
    expect(next.profile.coins).toBe(expectedCoins);
    expect(CHALLENGES.find((c) => c.id === 'star1')?.reward.coins).toBe(75);
  });
});
