import { achievementValue, checkAchievements } from '../../game/core/achievements';
import { ACHIEVEMENTS } from '../../game/core/content';
import { settleRound } from '../../game/core/engine';
import { defaultSave, Save } from '../../game/core/save';

const DATE = '2026-11-11';

function round(save: Save, game: 'blocks' | 'garden' | 'bubbles', score: number): Save {
  return settleRound(save, { game, score, durationS: 60, combos: 0, outcome: 'ended', date: DATE }).save;
}

describe('achievements (AC-14)', () => {
  it('first round, ten rounds, first star, explorer', () => {
    let save = defaultSave();
    save = round(save, 'blocks', 100);
    expect(save.achievements).toEqual(['first_round']);
    for (let i = 0; i < 8; i++) save = round(save, 'blocks', 100);
    expect(save.achievements).not.toContain('rounds10');
    save = round(save, 'blocks', 1000);
    expect(save.achievements).toEqual(expect.arrayContaining(['rounds10', 'first_star']));
    save = round(save, 'garden', 100);
    save = round(save, 'bubbles', 100);
    expect(save.achievements).toContain('explorer');
  });

  it('all stars and level achievements', () => {
    let save = defaultSave();
    save = { ...save, games: { blocks: { ...save.games.blocks, stars: 3 }, garden: { ...save.games.garden, stars: 3 }, bubbles: { ...save.games.bubbles, stars: 3 } }, profile: { ...save.profile, level: 10 } };
    const { unlocked } = checkAchievements(save);
    expect(unlocked).toEqual(expect.arrayContaining(['all_stars', 'level5', 'level10']));
  });

  it('each achievement unlocks once with its coins, and « Trésor » can follow from their coins', () => {
    let save = defaultSave();
    save = { ...save, profile: { ...save.profile, lifetimeCoins: 4990, roundsPlayed: 1 } };
    const first = checkAchievements(save);
    expect(first.unlocked).toEqual(['first_round', 'rich']); // 4990 + 25 ≥ 5000
    expect(first.save.profile.coins).toBe(25 + 150);
    const again = checkAchievements(first.save);
    expect(again.unlocked).toEqual([]);
    expect(again.save).toBe(first.save);
  });

  it('every achievement kind reads a value', () => {
    const save = defaultSave();
    for (const def of ACHIEVEMENTS) expect(achievementValue(save, def)).toBe(def.kind === 'level' ? 1 : 0);
    expect(achievementValue({ ...save, profile: { ...save.profile, level: 4 } }, ACHIEVEMENTS.find((a) => a.id === 'level5')!)).toBe(4);
  });
});
