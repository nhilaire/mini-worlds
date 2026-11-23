import { canCollectDaily, daysBetween, localDate, nextCalendarDay } from '../../game/core/daily';
import { collectDailyReward } from '../../game/core/engine';
import { defaultSave, Save } from '../../game/core/save';

function collect(save: Save, date: string) {
  const out = collectDailyReward(save, date);
  if (!out) throw new Error(`not collectable on ${date}`);
  return out;
}

describe('daily reward (AC-11)', () => {
  it('first collection is day 1 (100 coins), then the calendar advances on consecutive dates and wraps after 7', () => {
    let save = defaultSave();
    const dates = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
    const expected = [100, 150, 200, 250, 300, 400, 600, 100];
    const days = [1, 2, 3, 4, 5, 6, 7, 1];
    dates.forEach((date, i) => {
      const { save: next, result } = collect(save, date);
      expect(result.reward).toEqual({ day: days[i], coins: expected[i], xp: i === 6 ? 100 : 0 });
      expect(next.dailyReward).toEqual({ lastCollectedDate: date, calendarDay: days[i] });
      save = next;
    });
    expect(save.profile.coins).toBe(100 + 150 + 200 + 250 + 300 + 400 + 600 + 100 + 200 + 50); // + « Semaine complète » 200 + level-up 2 (50)
    expect(save.profile.level).toBe(2); // 100 XP on day 7
    expect(save.achievements).toContain('week');
  });

  it('refuses a second collection on the same date', () => {
    const { save } = collect(defaultSave(), '2026-11-01');
    expect(collectDailyReward(save, '2026-11-01')).toBeNull();
    expect(canCollectDaily(save.dailyReward, '2026-11-01')).toBe(false);
  });

  it('AC-11: any missed day resets the calendar to day 1', () => {
    let save = collect(defaultSave(), '2026-11-01').save;
    save = collect(save, '2026-11-02').save; // day 2
    save = collect(save, '2026-11-03').save; // day 3
    expect(nextCalendarDay(save.dailyReward, '2026-11-05')).toBe(1); // 11-04 missed
    const reset = collect(save, '2026-11-05');
    expect(reset.result.reward.day).toBe(1);
    expect(reset.result.reward.coins).toBe(100);
    expect(nextCalendarDay(reset.save.dailyReward, '2026-11-06')).toBe(2);
    expect(nextCalendarDay(reset.save.dailyReward, '2026-11-09')).toBe(1); // 3 days missed
  });

  it('a device date earlier than the last collection counts as collected', () => {
    const { save } = collect(defaultSave(), '2026-11-10');
    expect(canCollectDaily(save.dailyReward, '2026-11-09')).toBe(false);
    expect(collectDailyReward(save, '2026-11-09')).toBeNull();
  });

  it('a level-up from the day-7 XP can unlock Bubbles', () => {
    let save = defaultSave();
    save = { ...save, profile: { ...save.profile, level: 2, xp: 150 }, games: { ...save.games, blocks: { ...save.games.blocks, stars: 3 }, garden: { ...save.games.garden, stars: 1 } } };
    save = { ...save, dailyReward: { lastCollectedDate: '2026-11-06', calendarDay: 6 }, unlockedWorlds: ['arcade', 'puzzle'] };
    const { result } = collect(save, '2026-11-07');
    expect(result.levelUps.map((l) => l.level)).toEqual([3]);
    expect(result.worldsUnlocked).toEqual(['bubbles']);
  });
});

describe('dates', () => {
  it('formats local dates and counts days', () => {
    expect(localDate(new Date(2026, 10, 11, 23, 59).getTime())).toBe('2026-11-11');
    expect(localDate(new Date(2026, 0, 5, 0, 0).getTime())).toBe('2026-01-05');
    expect(daysBetween('2026-11-11', '2026-11-12')).toBe(1);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(daysBetween('2026-11-12', '2026-11-11')).toBe(-1);
  });
});
