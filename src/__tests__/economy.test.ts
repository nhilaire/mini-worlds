import { UPGRADE_COSTS } from '../game/core/content';
import { collectDailyReward, settleRound } from '../game/core/engine';
import { defaultSave } from '../game/core/save';

// AC-50: a first session (three rounds of Pluie de Blocs and the day-1 reward) pays for the first upgrade level,
// never for the first two levels together. Whatever the challenges drawn for that date.
describe('coin economy pacing (AC-50)', () => {
  it.each(['2026-11-12', '2026-11-13', '2026-11-20', '2026-12-25'])('a first session on %s affords one upgrade level, not two', (date) => {
    const collected = collectDailyReward(defaultSave(), date);
    if (!collected) throw new Error('day 1 must be collectable');
    let save = collected.save;
    for (const score of [1000, 1500, 2000]) {
      save = settleRound(save, { game: 'blocks', score, durationS: 90, combos: 0, outcome: 'ended', date }).save;
    }
    expect(save.profile.coins).toBeGreaterThanOrEqual(UPGRADE_COSTS[0]);
    expect(save.profile.coins).toBeLessThan(UPGRADE_COSTS[0] + UPGRADE_COSTS[1]);
  });

  it('a full upgrade line costs 2050 coins and the nine lines 18 450', () => {
    const line = UPGRADE_COSTS.reduce((a, b) => a + b, 0);
    expect(line).toBe(2050);
    expect(line * 9).toBe(18450);
  });
});
