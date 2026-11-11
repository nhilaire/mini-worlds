// Maps engine and UI events to a sound effect and/or a haptic tick. Sounds are generated WAV files
// (scripts/generate-sounds.mjs) played with expo-audio; haptics use expo-haptics. Both obey the settings.
import * as Haptics from 'expo-haptics';

import { playSound, SoundName } from './sounds';

export type FeedbackSettings = { sound: boolean; vibrations: boolean };

type Mapping = { sound?: SoundName; haptic?: 'light' | 'medium' | 'success' };

/** Event kind (engine events of the three games, UI moments) → feedback. Unknown kinds do nothing. */
export const FEEDBACK: Readonly<Record<string, Mapping>> = {
  move: { sound: 'tick' },
  rotate: { sound: 'tick' },
  drop: { sound: 'drop', haptic: 'light' },
  lock: { sound: 'drop' },
  lines: { sound: 'clear', haptic: 'medium' },
  swap: { sound: 'tick' },
  swap_back: { sound: 'refused' },
  match: { sound: 'clear', haptic: 'light' },
  cascade: { sound: 'combo', haptic: 'medium' },
  shuffle: { sound: 'tick' },
  shot: { sound: 'shoot' },
  pop: { sound: 'pop', haptic: 'light' },
  drop_bubbles: { sound: 'combo', haptic: 'medium' },
  push: { sound: 'tick' },
  refill: { sound: 'star', haptic: 'success' },
  combo: { sound: 'combo' },
  over: { sound: 'over', haptic: 'medium' },
  star: { sound: 'star', haptic: 'success' },
  coin: { sound: 'coin' },
  level_up: { sound: 'levelup', haptic: 'success' },
  reward: { sound: 'coin', haptic: 'success' },
  button: { sound: 'tick' },
};

const HAPTIC = {
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
};

export function playFeedback(kind: string, settings: FeedbackSettings): void {
  const mapping = FEEDBACK[kind];
  if (!mapping) return;
  if (settings.sound && mapping.sound) playSound(mapping.sound);
  if (settings.vibrations && mapping.haptic) void HAPTIC[mapping.haptic]().catch(() => {});
}
