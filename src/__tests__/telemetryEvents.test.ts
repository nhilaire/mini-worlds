import { logEvent } from '@react-native-firebase/analytics';

import { sanitizeParams, TelemetryEvents } from '../telemetry/events';
import { applyConsent, track } from '../telemetry/telemetry';

// The exact catalogue of docs/PRD.md "Telemetry events": names, params, enum values. Nothing else is sent.
const SAMPLE: { [N in keyof TelemetryEvents]: TelemetryEvents[N] } = {
  round_start: { game: 'blocks' },
  round_end: { game: 'garden', score: 1500, duration_s: 72, stars_new: 1, outcome: 'ended' },
  tutorial_complete: { game: 'bubbles' },
  level_up: { level: 3 },
  world_unlock: { world: 'puzzle' },
  upgrade_buy: { game: 'blocks', upgrade: 'preview', level: 1 },
  daily_reward_collect: { day: 7 },
  daily_challenge_complete: { challenge: 'rounds3' },
  achievement_unlock: { achievement: 'first_star' },
  settings_change: { setting: 'theme', value: 'dark' },
};

describe('telemetry events (AC-40)', () => {
  beforeEach(() => {
    jest.mocked(logEvent).mockClear();
  });

  it.each(Object.keys(SAMPLE) as (keyof TelemetryEvents)[])('%s is sent with its PRD params once consent is granted', async (name) => {
    await applyConsent(true);
    track(name, SAMPLE[name] as never);
    expect(logEvent).toHaveBeenCalledTimes(1);
    const [, sentName, sentParams] = jest.mocked(logEvent).mock.calls[0];
    expect(sentName).toBe(name);
    expect(sentParams).toEqual(SAMPLE[name]);
    for (const value of Object.values(sentParams as Record<string, unknown>)) {
      expect(typeof value === 'number' || /^[a-z0-9_]{1,36}$/.test(String(value))).toBe(true);
    }
  });

  it('sends nothing when consent is refused or statistics are turned off', async () => {
    await applyConsent(false);
    track('round_start', { game: 'blocks' });
    track('level_up', { level: 2 });
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('strips anything that is not a number or a short enum', () => {
    expect(sanitizeParams({ game: 'blocks', score: 12, free: 'Hello world!', user_name: 'x', ok: true })).toEqual({ game: 'blocks', score: 12, ok: 1 });
  });

  it('the catalogue has exactly the 10 PRD events', () => {
    expect(Object.keys(SAMPLE).sort()).toEqual(
      ['round_start', 'round_end', 'tutorial_complete', 'level_up', 'world_unlock', 'upgrade_buy', 'daily_reward_collect', 'daily_challenge_complete', 'achievement_unlock', 'settings_change'].sort(),
    );
  });
});
