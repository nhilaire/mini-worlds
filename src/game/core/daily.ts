// Daily reward calendar (docs/PRD.md "Daily reward"). Dates are local YYYY-MM-DD strings given by the caller.
import { DAILY_REWARDS } from './content';
import type { DailyRewardSave, Save } from './save';

export const CALENDAR_DAYS = DAILY_REWARDS.length;

/** Local date of a timestamp as YYYY-MM-DD (device time zone). */
export function localDate(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole days between two local dates (b − a), computed in UTC to ignore DST. */
export function daysBetween(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

/** Collectable when nothing was collected on this local date (a device date earlier than the last one counts as collected). */
export function canCollectDaily(state: DailyRewardSave, date: string): boolean {
  if (state.lastCollectedDate === null) return true;
  return daysBetween(state.lastCollectedDate, date) >= 1;
}

/** The calendar day (1-7) that the next collection on `date` would grant. */
export function nextCalendarDay(state: DailyRewardSave, date: string): number {
  if (state.lastCollectedDate === null || state.calendarDay === 0) return 1;
  const gap = daysBetween(state.lastCollectedDate, date);
  if (gap === 1) return (state.calendarDay % CALENDAR_DAYS) + 1; // consecutive day: advance (7 wraps to 1)
  return 1; // any missed day resets the calendar (v0.4.0 phone test)
}

export type DailyCollection = { day: number; coins: number; xp: number };

export function dailyRewardFor(day: number): DailyCollection {
  const reward = DAILY_REWARDS[day - 1];
  return { day, coins: reward.coins, xp: reward.xp };
}

/** Applies a collection to the calendar state (rewards are granted by the engine). Null when not collectable. */
export function collectDaily(save: Save, date: string): { save: Save; reward: DailyCollection } | null {
  if (!canCollectDaily(save.dailyReward, date)) return null;
  const day = nextCalendarDay(save.dailyReward, date);
  return {
    save: { ...save, dailyReward: { lastCollectedDate: date, calendarDay: day } },
    reward: dailyRewardFor(day),
  };
}
