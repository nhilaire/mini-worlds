// Active play time of a round (paused time excluded), for the short-round rule and telemetry. Reads the injectable
// clock only inside handlers, never during render.
import { useCallback, useRef } from 'react';

import { now } from '../../game/clock';

export type RoundClock = {
  /** Call when the round starts or resumes. */
  resume: () => void;
  /** Call when the round pauses (overlay, background, tutorial bubble). */
  pause: () => void;
  /** Active seconds so far. */
  elapsedS: () => number;
  /** Restarts the counter from zero (new round in place). */
  reset: () => void;
};

export function useRoundClock(): RoundClock {
  const accumulated = useRef(0);
  const runningSince = useRef<number | null>(null);

  const pause = useCallback(() => {
    if (runningSince.current !== null) {
      accumulated.current += now() - runningSince.current;
      runningSince.current = null;
    }
  }, []);
  const resume = useCallback(() => {
    if (runningSince.current === null) runningSince.current = now();
  }, []);
  const elapsedS = useCallback(() => {
    const running = runningSince.current === null ? 0 : now() - runningSince.current;
    return (accumulated.current + running) / 1000;
  }, []);
  const reset = useCallback(() => {
    accumulated.current = 0;
    runningSince.current = null;
  }, []);

  return { pause, resume, elapsedS, reset };
}
