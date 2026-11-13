import { GameId, WORLDS } from '../../game/core/content';
import { defaultSave, Save } from '../../game/core/save';
import { checkUnlocks, conditionProgress, isWorldUnlocked, nextUnlock } from '../../game/core/unlocks';

function withStars(save: Save, stars: Partial<Record<GameId, number>>, level = 1): Save {
  const games = { ...save.games };
  for (const [id, n] of Object.entries(stars)) games[id] = { ...games[id], stars: n };
  return { ...save, games, profile: { ...save.profile, level } };
}

describe('world unlocks (AC-09)', () => {
  it('only Arcade is open at the start', () => {
    const save = defaultSave();
    expect(save.unlockedWorlds).toEqual(['arcade']);
    expect(checkUnlocks(save).unlocked).toEqual([]);
    expect(nextUnlock(save)?.id).toBe('puzzle');
  });

  it('Puzzle unlocks exactly at 2 stars in Arcade', () => {
    expect(checkUnlocks(withStars(defaultSave(), { blocks: 1 })).unlocked).toEqual([]);
    const { save, unlocked } = checkUnlocks(withStars(defaultSave(), { blocks: 2 }));
    expect(unlocked).toEqual(['puzzle']);
    expect(isWorldUnlocked(save, 'puzzle')).toBe(true);
    expect(nextUnlock(save)?.id).toBe('cards'); // v0.2.0: Cartes (world 4) comes before Bulles in display order
  });

  it('Bubbles needs 4 stars in total AND level 3', () => {
    // 4 stars at level 2: not yet
    expect(checkUnlocks(withStars(defaultSave(), { blocks: 3, garden: 1 }, 2)).unlocked).toEqual(['puzzle']);
    // level 3 with 3 stars: not yet
    expect(checkUnlocks(withStars(defaultSave(), { blocks: 3 }, 3)).unlocked).toEqual(['puzzle']);
    // both: unlocked (Puzzle too, in display order)
    const { save, unlocked } = checkUnlocks(withStars(defaultSave(), { blocks: 3, garden: 1 }, 3));
    expect(unlocked).toEqual(['puzzle', 'bubbles']);
    expect(save.unlockedWorlds).toEqual(['arcade', 'puzzle', 'bubbles']);
    expect(nextUnlock(save)?.id).toBe('cards');
  });

  it('coming-soon worlds never unlock even when their indicative condition is met', () => {
    const save = withStars(defaultSave(), { blocks: 3, garden: 3, bubbles: 3 }, 50);
    const { unlocked } = checkUnlocks(save);
    expect(unlocked).toEqual(['puzzle', 'cards', 'bubbles', 'skill']); // Mémoire needs 12 stars
    for (const world of WORLDS.filter((w) => w.comingSoon)) expect(unlocked).not.toContain(world.id);
  });

  it('unlocks are permanent: losing the condition changes nothing', () => {
    const { save } = checkUnlocks(withStars(defaultSave(), { blocks: 2 }));
    const worse = { ...save, games: { ...save.games, blocks: { ...save.games.blocks, stars: 0 } } };
    expect(checkUnlocks(worse).save.unlockedWorlds).toContain('puzzle');
  });

  it('reports the progress of each condition', () => {
    const save = withStars(defaultSave(), { blocks: 1 }, 2);
    expect(conditionProgress(save, { kind: 'starsIn', world: 'arcade', n: 2 })).toEqual({ condition: { kind: 'starsIn', world: 'arcade', n: 2 }, current: 1, met: false });
    expect(conditionProgress(save, { kind: 'starsTotal', n: 4 }).current).toBe(1);
    expect(conditionProgress(save, { kind: 'level', n: 3 })).toMatchObject({ current: 2, met: false });
  });
});
