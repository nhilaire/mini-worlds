// Sound and haptic feedback for engine events (respecting the Sons / Vibrations settings). Filled in by the
// sound task (T-31): the hook only maps events to feedback names for now.
import { useEffect } from 'react';

import { useGameStore } from '../../state/GameStore';
import { playFeedback } from '../../feedback/feedback';

export function useGameFeedback(events: readonly { kind: string }[]): void {
  const { save } = useGameStore();
  const { sound, vibrations } = save.settings;
  useEffect(() => {
    for (const event of events) playFeedback(event.kind, { sound, vibrations });
  }, [events, sound, vibrations]);
}
