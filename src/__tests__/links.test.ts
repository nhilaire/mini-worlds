import appJson from '../../app.json';
import { SEED_LINK_SCHEME } from '../game/rng';

// The test links (miniworlds://seed/<n>[/unlocked]) only resolve on Android when the scheme is declared in the
// Expo config: `expo prebuild` writes the intent filter from it. Maestro's openLink failed without it.
describe('deep link scheme', () => {
  it('is declared in app.json and matches the parser', () => {
    expect(appJson.expo.scheme).toBe(SEED_LINK_SCHEME);
    expect(SEED_LINK_SCHEME).toBe('miniworlds');
  });
});
