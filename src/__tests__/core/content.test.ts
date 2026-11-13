import {
  ACHIEVEMENTS,
  CHALLENGES,
  DAILY_REWARDS,
  GAME_IDS,
  GAMES,
  gameById,
  mergeStars,
  SLOTS_PER_WORLD,
  starsForScore,
  UPGRADE_COSTS,
  WORLDS,
  worldOfGame,
} from '../../game/core/content';

describe('content catalogue', () => {
  it('has 10 worlds in display order, eight of them holding the v0.3.0 games', () => {
    expect(WORLDS.map((w) => w.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(WORLDS.filter((w) => w.games.length > 0).map((w) => w.id)).toEqual(['arcade', 'puzzle', 'strategy', 'cards', 'bubbles', 'skill', 'exploration', 'memory']);
    expect(WORLDS.filter((w) => w.comingSoon).length).toBe(2);
    for (const w of WORLDS) expect(w.games.length).toBeLessThanOrEqual(SLOTS_PER_WORLD);
    expect(WORLDS.find((w) => w.id === 'arcade')?.conditions).toEqual([]);
  });

  it('places every game in its world', () => {
    expect(GAME_IDS).toEqual(['blocks', 'garden', 'bubbles', 'tower', 'hop', 'lights', 'pipes', 'flood', 'socks', 'twentyone', 'candles', 'parrot', 'moles', 'fruit', 'slide', 'cardline', 'marbles', 'quicksum', 'army', 'merge', 'maze', 'trail', 'treasure']);
    expect(worldOfGame('blocks').id).toBe('arcade');
    expect(worldOfGame('garden').id).toBe('puzzle');
    expect(worldOfGame('bubbles').id).toBe('bubbles');
    for (const game of GAMES) expect(worldOfGame(game.id).games).toContain(game.id);
  });

  it.each([
    ['blocks', [1000, 2500, 5000]],
    ['garden', [1500, 3000, 5000]],
    ['bubbles', [800, 2000, 4000]],
  ] as const)('%s star thresholds are increasing and match the PRD', (id, thresholds) => {
    expect(gameById(id).stars).toEqual(thresholds);
  });

  it('the first three games have 3 upgrades, the v0.2.0 games 2, of 3 levels including the coin bonus, costs 250 / 600 / 1200', () => {
    for (const game of GAMES) {
      expect(game.upgrades).toHaveLength(['blocks', 'garden', 'bubbles'].includes(game.id) ? 3 : 2);
      expect(game.upgrades.map((u) => u.id)).toContain('coins');
      for (const u of game.upgrades) expect(u.maxLevel).toBe(3);
    }
    expect(UPGRADE_COSTS).toEqual([250, 600, 1200]);
  });

  it('challenge pool has 28 entries, Jouer 3 parties fixed first, games2 needs 2 games', () => {
    expect(CHALLENGES).toHaveLength(28);
    expect(CHALLENGES.filter((c) => c.fixedFirst).map((c) => c.id)).toEqual(['rounds3']);
    expect(CHALLENGES.find((c) => c.id === 'games2')?.minGames).toBe(2);
    expect(CHALLENGES.find((c) => c.id === 'score_blocks')?.target).toBe(gameById('blocks').stars[0]);
    expect(CHALLENGES.find((c) => c.id === 'score_garden')?.target).toBe(gameById('garden').stars[0]);
    expect(CHALLENGES.find((c) => c.id === 'score_bubbles')?.target).toBe(gameById('bubbles').stars[0]);
  });

  it('has 13 achievements with unique ids and 7 daily rewards ending with 600 coins + 100 XP', () => {
    expect(ACHIEVEMENTS).toHaveLength(13);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(13);
    expect(DAILY_REWARDS.map((d) => d.coins)).toEqual([100, 150, 200, 250, 300, 400, 600]);
    expect(DAILY_REWARDS[6].xp).toBe(100);
    expect(DAILY_REWARDS.slice(0, 6).every((d) => d.xp === 0)).toBe(true);
  });
});

describe('stars (AC-08)', () => {
  it.each([
    [0, 0],
    [999, 0],
    [1000, 1],
    [2499, 1],
    [2500, 2],
    [5000, 3],
    [10000, 3],
  ])('blocks score %i earns %i star(s), threshold inclusive', (score, stars) => {
    expect(starsForScore('blocks', score)).toBe(stars);
  });

  it('a lower score later never removes a star', () => {
    expect(mergeStars(2, 1)).toBe(2);
    expect(mergeStars(1, 3)).toBe(3);
    expect(mergeStars(0, 0)).toBe(0);
  });
});
