// v0.2.0 catalogue: ten more games, three more worlds, games unlocked one by one inside a world (AC-55 to AC-58).
import { ACHIEVEMENTS, CHALLENGES, GameId, gameById, GAMES, WORLDS, worldById } from '../../game/core/content';
import { achievementValue } from '../../game/core/achievements';
import { drawChallenges } from '../../game/core/challenges';
import { settleRound } from '../../game/core/engine';
import { defaultSave, parseSave, Save, serializeSave } from '../../game/core/save';
import { checkUnlocks, gameUnlockStars, isGameUnlocked, newlyUnlockedGames, playableGames } from '../../game/core/unlocks';
import { DICTIONARIES, LANGUAGES } from '../../i18n';

const NEW_GAMES: GameId[] = ['tower', 'hop', 'lights', 'pipes', 'flood', 'socks', 'twentyone', 'candles', 'parrot', 'moles'];

function withStars(save: Save, stars: Partial<Record<GameId, number>>, level = 1, worlds?: Save['unlockedWorlds']): Save {
  const games = { ...save.games };
  for (const [id, n] of Object.entries(stars)) games[id] = { ...games[id], stars: n };
  return { ...save, games, profile: { ...save.profile, level }, unlockedWorlds: worlds ?? save.unlockedWorlds };
}

describe('v0.2.0 catalogue (AC-55)', () => {
  it('13 games sit in their worlds in unlock order', () => {
    const byWorld = Object.fromEntries(WORLDS.filter((w) => w.games.length > 0).map((w) => [w.id, w.games]));
    expect(byWorld).toEqual({
      arcade: ['blocks', 'tower', 'hop'],
      puzzle: ['garden', 'lights', 'pipes'],
      cards: ['socks', 'twentyone'],
      bubbles: ['bubbles', 'flood'],
      skill: ['candles'],
      memory: ['parrot', 'moles'],
    });
    expect(GAMES).toHaveLength(13);
    for (const game of GAMES) expect(worldById(game.world).games).toContain(game.id);
  });

  it.each([
    ['tower', [150, 300, 500], 'wide', true],
    ['hop', [150, 350, 600], 'shield', true],
    ['lights', [500, 750, 950], 'hint', false],
    ['pipes', [700, 1100, 1400], 'hint', false],
    ['flood', [800, 2000, 3500], 'more_moves', false],
    ['socks', [800, 1600, 2800], 'peek', false],
    ['twentyone', [400, 600, 750], 'extra_hand', false],
    ['candles', [200, 450, 800], 'slow_spin', true],
    ['parrot', [150, 400, 800], 'second_chance', false],
    ['moles', [400, 900, 1500], 'radar', false],
  ] as const)('%s: stars %j, upgrades %s + coins', (id, stars, upgrade, realTime) => {
    const game = gameById(id);
    expect(game.stars).toEqual(stars);
    expect(game.upgrades.map((u) => u.id)).toEqual([upgrade, 'coins']);
    for (const u of game.upgrades) expect(u.maxLevel).toBe(3);
    expect(game.realTime).toBe(realTime);
  });

  it('Cartes, Adresse and Mémoire are open worlds with their conditions; 4 worlds stay coming soon', () => {
    expect(worldById('cards')).toMatchObject({ comingSoon: false, conditions: [{ kind: 'starsTotal', n: 6 }, { kind: 'level', n: 4 }] });
    expect(worldById('skill')).toMatchObject({ comingSoon: false, conditions: [{ kind: 'starsTotal', n: 9 }, { kind: 'level', n: 5 }] });
    expect(worldById('memory')).toMatchObject({ comingSoon: false, conditions: [{ kind: 'starsTotal', n: 12 }, { kind: 'level', n: 6 }] });
    expect(WORLDS.filter((w) => w.comingSoon).map((w) => w.id)).toEqual(['strategy', 'building', 'exploration', 'challenges']);
    // 6 stars at level 4 opens Cartes; 5 stars or level 3 does not.
    expect(checkUnlocks(withStars(defaultSave(), { blocks: 3, garden: 3 }, 4)).unlocked).toContain('cards');
    expect(checkUnlocks(withStars(defaultSave(), { blocks: 3, garden: 2 }, 4)).unlocked).not.toContain('cards');
    expect(checkUnlocks(withStars(defaultSave(), { blocks: 3, garden: 3 }, 3)).unlocked).not.toContain('cards');
    expect(checkUnlocks(withStars(defaultSave(), { blocks: 3, garden: 3, bubbles: 3 }, 5)).unlocked).toContain('skill');
    expect(checkUnlocks(withStars(defaultSave(), { blocks: 3, garden: 3, bubbles: 3, tower: 3 }, 6)).unlocked).toContain('memory');
  });

  it('every new game has its name, description, tutorial and upgrade copy in every language', () => {
    for (const language of LANGUAGES) {
      const t = DICTIONARIES[language];
      for (const id of NEW_GAMES) {
        expect(t.game[id].name.length).toBeGreaterThan(0);
        expect(t.game[id].desc.length).toBeGreaterThan(0);
        expect(Object.values(t.tutorial[id]).every((s) => s.length > 0)).toBe(true);
        for (const u of gameById(id).upgrades) for (const n of [1, 2, 3]) expect(t.upgrade[u.id].desc(n).length).toBeGreaterThan(0);
      }
    }
    expect(DICTIONARIES.fr.upgrade.slow_spin.desc(2)).toBe('Le gâteau tourne 16 % moins vite');
    expect(DICTIONARIES.en.result.newGame('Wobbly Tower')).toBe('New game: Wobbly Tower!');
    expect(DICTIONARIES.fr.worlds.gameLocked(2, 'Arcade')).toBe('2 étoiles dans Arcade');
  });
});

describe('games inside a world (AC-56)', () => {
  it('the k-th game of a world needs 2 × (k − 1) stars in that world', () => {
    expect(NEW_GAMES.map((g) => [g, gameUnlockStars(g)])).toEqual([
      ['tower', 2],
      ['hop', 4],
      ['lights', 2],
      ['pipes', 4],
      ['flood', 2],
      ['socks', 0],
      ['twentyone', 2],
      ['candles', 0],
      ['parrot', 0],
      ['moles', 2],
    ]);
    const start = defaultSave();
    expect(playableGames(start)).toEqual(['blocks']);
    expect(isGameUnlocked(withStars(start, { blocks: 1 }), 'tower')).toBe(false);
    expect(isGameUnlocked(withStars(start, { blocks: 2 }), 'tower')).toBe(true);
    expect(isGameUnlocked(withStars(start, { blocks: 3 }), 'hop')).toBe(false);
    expect(isGameUnlocked(withStars(start, { blocks: 3, tower: 1 }), 'hop')).toBe(true);
    // Stars of another world do not count; a game of a locked world is never playable.
    expect(isGameUnlocked(withStars(start, { garden: 3 }, 1, ['arcade', 'puzzle']), 'tower')).toBe(false);
    expect(isGameUnlocked(withStars(start, { garden: 3 }), 'lights')).toBe(false);
    expect(isGameUnlocked(withStars(start, {}, 1, ['arcade', 'cards']), 'socks')).toBe(true);
  });

  it('a round reaching the stars of the next game of an open world announces it; a new world is announced as a world', () => {
    const before = withStars(defaultSave(), { blocks: 1 });
    const { result } = settleRound(before, { game: 'blocks', score: 2500, durationS: 60, combos: 0, outcome: 'ended', date: '2026-11-13' });
    expect(result.starsAfter).toBe(2);
    expect(result.worldsUnlocked).toEqual(['puzzle']);
    expect(result.gamesUnlocked).toEqual(['tower']); // garden comes with the world, not as a « new game »
    expect(newlyUnlockedGames(before, before)).toEqual([]);
  });
});

describe('challenges and achievements (AC-57)', () => {
  it('score challenges exist for the 13 games at their 1-star threshold, and only playable games are drawn', () => {
    for (const game of GAMES) {
      const def = CHALLENGES.find((c) => c.id === `score_${game.id}`);
      expect(def).toMatchObject({ kind: 'score', game: game.id, target: game.stars[0], reward: { coins: 50 } });
    }
    const arcadeOnly = withStars(defaultSave(), { blocks: 2 }, 1, ['arcade']);
    const playable = playableGames(arcadeOnly);
    expect(playable).toEqual(['blocks', 'tower']);
    for (let day = 1; day <= 28; day++) {
      const ids = drawChallenges(`2026-11-${String(day).padStart(2, '0')}`, playable);
      for (const id of ids) {
        const game = CHALLENGES.find((c) => c.id === id)?.game;
        if (game) expect(playable).toContain(game);
      }
    }
  });

  it('Explorateur at 3 games, Globe-trotteur at 10 (200 coins), Ciel étoilé at 39 stars', () => {
    expect(ACHIEVEMENTS.find((a) => a.id === 'explorer')).toMatchObject({ kind: 'gamesPlayed', target: 3 });
    expect(ACHIEVEMENTS.find((a) => a.id === 'globetrotter')).toMatchObject({ kind: 'gamesPlayed', target: 10, coins: 200 });
    const allStars = ACHIEVEMENTS.find((a) => a.id === 'all_stars')!;
    expect(allStars.target).toBe(39);
    const played = defaultSave();
    for (const id of NEW_GAMES) played.games[id] = { ...played.games[id], rounds: 1, stars: 3 };
    expect(achievementValue(played, ACHIEVEMENTS.find((a) => a.id === 'globetrotter')!)).toBe(10);
    expect(achievementValue(played, allStars)).toBe(30);
  });
});

describe('save compatibility and test link (AC-58)', () => {
  it('a v0.1.0 save (3 games) loads without loss and the 10 new games get default data', () => {
    const old = defaultSave();
    const v010 = {
      ...old,
      games: { blocks: { ...old.games.blocks, bestScore: 4321, stars: 2, rounds: 7, upgrades: { preview: 2 }, tutorialDone: true }, garden: old.games.garden, bubbles: old.games.bubbles },
      unlockedWorlds: ['arcade', 'puzzle'],
      profile: { ...old.profile, coins: 999, level: 3 },
    };
    const { save, readOnly } = parseSave(serializeSave(v010 as Save));
    expect(readOnly).toBe(false);
    expect(save.games.blocks).toEqual({ bestScore: 4321, stars: 2, rounds: 7, upgrades: { preview: 2 }, tutorialDone: true });
    expect(save.unlockedWorlds).toEqual(['arcade', 'puzzle']);
    expect(save.profile.coins).toBe(999);
    for (const id of NEW_GAMES) expect(save.games[id]).toEqual({ bestScore: 0, stars: 0, rounds: 0, upgrades: {}, tutorialDone: false });
    expect(isGameUnlocked(save, 'tower')).toBe(true); // 2 stars in Arcade already earned in v0.1.0
  });

  it('the /unlocked session flag opens every game of every open world', () => {
    const save = { ...defaultSave(), unlockedWorlds: WORLDS.filter((w) => !w.comingSoon).map((w) => w.id), sessionAllGames: true };
    expect(playableGames(save)).toHaveLength(13);
  });
});
