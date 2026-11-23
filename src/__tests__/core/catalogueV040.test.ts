// v0.4.0 catalogue: twelve more games, world Défis opens (AC-95).
import { CHALLENGES, gameById, GAMES, WORLDS, worldById } from '../../game/core/content';
import { checkUnlocks } from '../../game/core/unlocks';
import { defaultSave, parseSave, Save, serializeSave } from '../../game/core/save';
import { DICTIONARIES, LANGUAGES } from '../../i18n';
import { GAME_ICONS } from '../../art/gameIcons';

function withStars(stars: number, level: number): Save {
  const save = defaultSave();
  const ids = ['blocks', 'garden', 'bubbles', 'tower', 'hop', 'lights', 'pipes', 'flood', 'socks', 'twentyone', 'candles'];
  let left = stars;
  for (const id of ids) {
    const n = Math.min(3, left);
    save.games[id] = { ...save.games[id], stars: n };
    left -= n;
  }
  return { ...save, profile: { ...save.profile, level } };
}

const V040 = [
  ['dash', 'arcade', [450, 550, 950], 'guard', true],
  ['tiles', 'puzzle', [3700, 4650, 8400], 'undo', false],
  ['conquest', 'strategy', [500, 1100, 1200], 'reinforce', false],
  ['defense', 'strategy', [950, 1250, 1400], 'arsenal', true],
  ['hands', 'cards', [150, 250, 350], 'redraw', false],
  ['patience', 'cards', [250, 450, 650], 'wild', false],
  ['darts', 'skill', [350, 550, 800], 'steady', true],
  ['shot', 'skill', [500, 650, 800], 'sight', false],
  ['pattern', 'memory', [450, 600, 1050], 'extra_time', true],
  ['chain', 'memory', [1350, 1600, 2500], 'shuffle', false],
  ['laser', 'challenges', [1000, 1350, 1450], 'hint', false],
  ['twins', 'challenges', [700, 1150, 1400], 'hint', false],
] as const;

describe('v0.4.0 catalogue (AC-95)', () => {
  it.each(V040)('%s sits in %s with stars %j, upgrades %s + coins', (id, world, stars, upgrade, realTime) => {
    const game = gameById(id);
    expect(game.world).toBe(world);
    expect(game.stars).toEqual(stars);
    expect(game.stars[0]).toBeLessThan(game.stars[1]);
    expect(game.stars[1]).toBeLessThan(game.stars[2]);
    expect(game.upgrades.map((u) => u.id)).toEqual([upgrade, 'coins']);
    expect(game.realTime).toBe(realTime);
    expect(CHALLENGES.find((c) => c.id === `score_${id}`)).toMatchObject({ target: stars[0], game: id });
    expect(GAME_ICONS[id].rows).toHaveLength(12);
    for (const language of LANGUAGES) {
      const t = DICTIONARIES[language];
      expect(t.game[id].name.length).toBeGreaterThan(0);
      expect(t.game[id].desc.length).toBeGreaterThan(0);
      expect(Object.values(t.tutorial[id]).every((s) => s.length > 0)).toBe(true);
      expect(t.challenge[`score_${id}`]).toContain(String(stars[0]));
      for (const n of [1, 2, 3]) expect(t.upgrade[upgrade].desc(n).length).toBeGreaterThan(0);
    }
  });

  it('the twelve games come last in their worlds, in unlock order', () => {
    expect(worldById('arcade').games).toEqual(['blocks', 'tower', 'hop', 'fruit', 'dash']);
    expect(worldById('puzzle').games).toEqual(['garden', 'lights', 'pipes', 'slide', 'tiles']);
    expect(worldById('strategy').games).toEqual(['army', 'merge', 'conquest', 'defense']);
    expect(worldById('cards').games).toEqual(['socks', 'twentyone', 'cardline', 'hands', 'patience']);
    expect(worldById('skill').games).toEqual(['candles', 'darts', 'shot']);
    expect(worldById('memory').games).toEqual(['parrot', 'moles', 'quicksum', 'pattern', 'chain']);
    expect(worldById('challenges').games).toEqual(['laser', 'twins']);
  });

  it('Défis unlocks at 30 stars + level 10 and is no longer coming soon; 35 games, 105 stars', () => {
    expect(worldById('challenges')).toMatchObject({ comingSoon: false, conditions: [{ kind: 'starsTotal', n: 30 }, { kind: 'level', n: 10 }] });
    expect(WORLDS.filter((w) => w.comingSoon).map((w) => w.id)).toEqual(['building']);
    expect(checkUnlocks(withStars(30, 10)).unlocked).toContain('challenges');
    expect(checkUnlocks(withStars(29, 10)).unlocked).not.toContain('challenges');
    expect(checkUnlocks(withStars(30, 9)).unlocked).not.toContain('challenges');
    expect(GAMES).toHaveLength(35);
    expect(GAMES.length * 3).toBe(105);
  });
});

describe('save compatibility with v0.3.0 (AC-95)', () => {
  it('a v0.3.0 save (23 games) loads without loss and the 12 v0.4.0 games get default data', () => {
    const V030 = GAMES.map((g) => g.id).filter((id) => !V040.some((g) => g[0] === id));
    expect(V030).toHaveLength(23);
    const base = defaultSave();
    const games = Object.fromEntries(V030.map((id, i) => [id, { bestScore: 100 + i, stars: i % 4, rounds: i, upgrades: { coins: 1 }, tutorialDone: true }]));
    const v030 = { ...base, games, unlockedWorlds: ['arcade', 'puzzle', 'cards', 'bubbles', 'strategy'], profile: { ...base.profile, coins: 4321, level: 9 }, achievements: ['first_round'] };
    const { save, readOnly } = parseSave(serializeSave(v030 as Save));
    expect(readOnly).toBe(false);
    for (const id of V030) expect(save.games[id]).toEqual(games[id]);
    for (const [id] of V040) expect(save.games[id]).toEqual({ bestScore: 0, stars: 0, rounds: 0, upgrades: {}, tutorialDone: false });
    expect(save.unlockedWorlds).toEqual(['arcade', 'puzzle', 'cards', 'bubbles', 'strategy']);
    expect(save.profile.coins).toBe(4321);
    expect(save.achievements).toEqual(['first_round']);
  });
});
