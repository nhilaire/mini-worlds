// v0.3.0 catalogue: ten more games, worlds Stratégie and Exploration open (AC-75).
import { CHALLENGES, gameById, GAMES, worldById } from '../../game/core/content';
import { checkUnlocks } from '../../game/core/unlocks';
import { defaultSave, Save } from '../../game/core/save';
import { DICTIONARIES, LANGUAGES } from '../../i18n';

function withStars(stars: number, level: number): Save {
  const save = defaultSave();
  const ids = ['blocks', 'garden', 'bubbles', 'tower', 'hop', 'lights', 'pipes'];
  let left = stars;
  for (const id of ids) {
    const n = Math.min(3, left);
    save.games[id] = { ...save.games[id], stars: n };
    left -= n;
  }
  return { ...save, profile: { ...save.profile, level } };
}

describe('v0.3.0 catalogue (AC-75)', () => {
  it.each([
    ['fruit', 'arcade', [500, 1200, 2500], 'sweep', false],
    ['slide', 'puzzle', [500, 900, 1300], 'hint', false],
    ['cardline', 'cards', [500, 750, 950], 'hint', false],
    ['marbles', 'bubbles', [300, 700, 1000], 'extra_time', true],
    ['quicksum', 'memory', [300, 700, 1200], 'extra_time', true],
    ['army', 'strategy', [300, 800, 1500], 'recruits', false],
    ['merge', 'strategy', [200, 500, 1000], 'veteran', false],
    ['maze', 'exploration', [300, 700, 1200], 'extra_time', true],
    ['trail', 'exploration', [600, 1000, 1400], 'hint', false],
    ['treasure', 'exploration', [400, 700, 1000], 'detector', false],
  ] as const)('%s sits in %s with stars %j, upgrades %s + coins', (id, world, stars, upgrade, realTime) => {
    const game = gameById(id);
    expect(game.world).toBe(world);
    expect(game.stars).toEqual(stars);
    expect(game.upgrades.map((u) => u.id)).toEqual([upgrade, 'coins']);
    expect(game.realTime).toBe(realTime);
    expect(CHALLENGES.find((c) => c.id === `score_${id}`)).toMatchObject({ target: stars[0], game: id });
    for (const language of LANGUAGES) {
      const t = DICTIONARIES[language];
      expect(t.game[id].name.length).toBeGreaterThan(0);
      expect(Object.values(t.tutorial[id]).every((s) => s.length > 0)).toBe(true);
      for (const n of [1, 2, 3]) expect(t.upgrade[upgrade].desc(n).length).toBeGreaterThan(0);
    }
  });

  it('Stratégie unlocks at 15 stars + level 7, Exploration at 18 stars + level 8; 23 games, 69 stars', () => {
    expect(worldById('strategy')).toMatchObject({ comingSoon: false, conditions: [{ kind: 'starsTotal', n: 15 }, { kind: 'level', n: 7 }] });
    expect(worldById('exploration')).toMatchObject({ comingSoon: false, conditions: [{ kind: 'starsTotal', n: 18 }, { kind: 'level', n: 8 }] });
    expect(checkUnlocks(withStars(15, 7)).unlocked).toContain('strategy');
    expect(checkUnlocks(withStars(14, 7)).unlocked).not.toContain('strategy');
    expect(checkUnlocks(withStars(15, 6)).unlocked).not.toContain('strategy');
    expect(checkUnlocks(withStars(18, 8)).unlocked).toContain('exploration');
    expect(checkUnlocks(withStars(18, 7)).unlocked).not.toContain('exploration');
    expect(GAMES).toHaveLength(23);
    expect(GAMES.length * 3).toBe(69);
  });
});
