import { useEffect, useReducer, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { durationSeconds, initialState, reduce, remainingSeconds } from '../game/engine';
import { useI18n } from '../i18n/I18nProvider';
import { track } from '../telemetry/telemetry';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { colors, font, spacing } from '../ui/theme';

type Props = { onExit: () => void; onGameOver: (score: number) => void };

export function GameScreen({ onExit, onGameOver }: Props) {
  const { t } = useI18n();
  // The round starts with the screen: the reducer is initialised already running (no setState in an effect).
  const [state, dispatch] = useReducer(reduce, initialState, (s) => reduce(s, { type: 'start', now: Date.now() }));
  const [now, setNow] = useState(() => state.startedAt ?? Date.now());
  const reported = useRef(false);

  useEffect(() => {
    track('round_start', { game: 'blocks' }); // placeholder screen, replaced in the build phase
  }, []);

  const start = () => {
    reported.current = false;
    const t = Date.now();
    dispatch({ type: 'start', now: t });
    setNow(t);
    track('round_start', { game: 'blocks' }); // placeholder screen, replaced in the build phase
  };

  useEffect(() => {
    if (state.status !== 'playing') return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      dispatch({ type: 'tick', now: t });
    }, 200);
    return () => clearInterval(id);
  }, [state.status]);

  useEffect(() => {
    if (state.status !== 'over' || reported.current) return;
    reported.current = true;
    track('round_end', { game: 'blocks', score: state.score, duration_s: durationSeconds(state), stars_new: 0, outcome: 'ended' });
    onGameOver(state.score);
  }, [state, onGameOver]);

  if (state.status === 'over') {
    return (
      <Screen testID="game-over-screen">
        <View style={styles.center}>
          <Text style={styles.title} accessibilityRole="header">
            {t.result.title}
          </Text>
          <Text style={styles.score}>{String(state.score)}</Text>
        </View>
        <Button label={t.result.replay} onPress={start} testID="game-play-again" />
        <Button label={t.result.back} onPress={onExit} variant="secondary" testID="game-home" />
      </Screen>
    );
  }

  return (
    <Screen testID="game-screen">
      <View style={styles.hud}>
        <Text style={styles.hudText}>{t.hud.score}</Text>
        <Text style={styles.hudText}>{String(remainingSeconds(state, now))}</Text>
      </View>
      <Pressable
        testID="game-tap-zone"
        accessibilityRole="button"
        accessibilityLabel={t.hud.pause}
        onPress={() => dispatch({ type: 'tap', now: Date.now() })}
        style={({ pressed }) => [styles.tapZone, pressed && styles.tapZonePressed]}
      >
        <Text style={styles.tapText}>{t.hud.pause}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  title: { color: colors.text, fontSize: font.title, fontWeight: '800' },
  score: { color: colors.accent, fontSize: font.heading, fontWeight: '700' },
  hud: { flexDirection: 'row', justifyContent: 'space-between' },
  hudText: { color: colors.text, fontSize: font.body, fontWeight: '600' },
  tapZone: { flex: 1, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  tapZonePressed: { backgroundColor: colors.accent },
  tapText: { color: colors.text, fontSize: font.title, fontWeight: '800' },
});
