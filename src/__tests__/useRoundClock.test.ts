import { renderHook } from '@testing-library/react-native';

import { setClock } from '../game/clock';
import { useRoundClock } from '../screens/game/useRoundClock';

// AC-74: the round clock is one stable object across renders (a new object per render restarted the Perroquet show
// on every lit pad, phone test of v0.2.0), and it counts active time only.
describe('useRoundClock (AC-74)', () => {
  let nowMs = 0;
  let restore = () => {};
  beforeEach(() => {
    nowMs = 1_000_000;
    restore = setClock(() => nowMs);
  });
  afterEach(() => restore());

  it('AC-74: returns the same clock object on every render', async () => {
    const { result, rerender } = await renderHook(() => useRoundClock());
    const first = result.current;
    for (let i = 0; i < 5; i++) await rerender(undefined);
    expect(result.current).toBe(first);
    expect(result.current.pause).toBe(first.pause);
    expect(result.current.elapsedS).toBe(first.elapsedS);
  });

  it('AC-74: keeps its running time across renders and excludes paused time', async () => {
    const { result, rerender } = await renderHook(() => useRoundClock());
    result.current.resume();
    nowMs += 3000;
    await rerender(undefined);
    expect(result.current.elapsedS()).toBe(3);
    result.current.pause();
    nowMs += 10_000;
    await rerender(undefined);
    expect(result.current.elapsedS()).toBe(3);
    result.current.resume();
    nowMs += 1500;
    expect(result.current.elapsedS()).toBe(4.5);
    result.current.reset();
    expect(result.current.elapsedS()).toBe(0);
  });
});
