import AsyncStorage from '@react-native-async-storage/async-storage';
import { logEvent, setConsent } from '@react-native-firebase/analytics';

import { saveConsent } from '../telemetry/consentStore';

import { sanitizeParams } from '../telemetry/events';
import { applyConsent, track } from '../telemetry/telemetry';

describe('sanitizeParams', () => {
  it('keeps numbers and short enums', () => {
    expect(sanitizeParams({ level: 2, score: 1500, mode: 'hard' })).toEqual({ level: 2, score: 1500, mode: 'hard' });
  });

  it('drops anything that could carry personal data', () => {
    expect(
      sanitizeParams({ email: 'x', user_name: 'x', device_id: 'x', city: 'Paris (free text)', note: 'Hello World', ok: true }),
    ).toEqual({ ok: 1 });
  });
});

describe('telemetry consent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends nothing without consent', async () => {
    await applyConsent(false);
    track('game_start', { level: 1 });
    expect(logEvent).not.toHaveBeenCalled();
    expect(setConsent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ analytics_storage: false, ad_storage: false }));
  });

  it('sends typed events after consent, never ad storage', async () => {
    await applyConsent(true);
    track('game_over', { level: 1, score: 12, duration_s: 10 });
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), 'game_over', { level: 1, score: 12, duration_s: 10 });
    expect(setConsent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ analytics_storage: true, ad_storage: false }));
  });
});

describe('consent storage', () => {
  it('a failed write does not throw (the consent screen must never freeze)', async () => {
    // The storage mock's setItem is already a jest.fn: mockRestore would wipe its behaviour for later tests.
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk full'));
    await expect(saveConsent('granted')).resolves.toBeUndefined();
  });
});
