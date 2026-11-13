// « Bougies Folles » screen: the pure engine (src/game/candles) drives plain React Native views. The cake rotation is
// an Animated value set from the engine angle every frame (no re-render); the candles re-render only when one is
// planted. A tap plants the candle at once in the engine; the 120 ms flight from the launcher is drawn only.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { PALETTE } from '../../art/palette';
import { CandlesAction, CandlesEvent, candlesLeft, createCandles, reduceCandles } from '../../game/candles/engine';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const MAX_DT_MS = 50;
const FLIGHT_MS = 120;
const LAUNCH_GAP = 12;

type Geometry = { diameter: number; stick: number; length: number; stage: number };

/** Engine events → existing feedback kinds: tick for a planted candle, combo for a cake, drop for a hit. */
function feedbackOf(events: readonly CandlesEvent[]): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'plant') out.push({ kind: 'move' });
    else if (e.kind === 'hit') out.push({ kind: 'drop' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push(e);
  }
  return out;
}

/** A candle stuck in the cake edge at the bottom point, flame outward; rotate its square to place it at an angle. */
function CandleStick({ g, color, testID }: { g: Geometry; color: string; testID?: string }) {
  const flame = Math.max(4, Math.round(g.stick * 1.2));
  return (
    <View testID={testID} style={[styles.stick, { left: (g.stage - g.stick) / 2, top: g.length + g.diameter - 2, width: g.stick, height: g.length, backgroundColor: color }]}>
      <View style={[styles.flame, { width: flame, height: flame, left: (g.stick - flame) / 2 - 2, bottom: -flame }]} />
    </View>
  );
}

/** The thrown candle flies from the launcher to the cake edge (visual only: the engine planted it already). */
function Flight({ g }: { g: Geometry }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: FLIGHT_MS, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [progress]);
  const distance = g.stage + LAUNCH_GAP - (g.length + g.diameter);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] });
  const opacity = progress.interpolate({ inputRange: [0, 0.9, 1], outputRange: [1, 1, 0] });
  return (
    <Animated.View testID="candles-flight" pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity, transform: [{ translateY }] }]}>
      <CandleStick g={g} color={PALETTE.pink} />
    </Animated.View>
  );
}

const TUTORIAL = [{ key: 'throw' }] as const;

export function CandlesGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const diameter = Math.max(120, Math.floor(Math.min((width - 2 * spacing.md) * 0.62, (height - 320) * 0.6)));
  const length = Math.round(diameter * 0.2);
  const g: Geometry = { diameter, length, stick: Math.max(6, Math.round(diameter * 0.045)), stage: diameter + 2 * length };

  const [state, setState] = useState(() => createCandles(seed, upgradeLevels(save, 'candles')));
  const stateRef = useRef(state);
  const [rotation] = useState(() => new Animated.Value(0));
  const steps = useMemo(() => TUTORIAL.map((s) => ({ key: s.key, text: t.tutorial.candles[s.key] })), [t]);
  const frame = useRoundFrame({ game: 'candles', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);
  const [throws, setThrows] = useState(0);

  // Every action goes through here: the engine stays the single source of truth.
  const dispatch = useCallback(
    (action: CandlesAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceCandles(previous, action);
      stateRef.current = next;
      if (next.rotation !== previous.rotation) rotation.setValue(next.rotation);
      // Ticks only turn the cake (Animated value above): re-render when a candle lands or the round ends.
      if (next.candles !== previous.candles || next.status !== previous.status) setState(next);
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [finish, rotation, setCombos],
  );

  // Frame loop: ticks the engine with the injectable clock while the round is active (not during the bubble).
  useEffect(() => {
    if (!active) return;
    let last = now();
    let handle = 0;
    const loop = () => {
      const time = now();
      const dt = Math.min(MAX_DT_MS, time - last);
      last = time;
      if (dt > 0) dispatch({ type: 'tick', dt });
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [active, dispatch]);

  const onThrow = useCallback(() => {
    if (paused || stateRef.current.status !== 'playing') return;
    setThrows((n) => n + 1);
    dispatch({ type: 'throw' });
    advanceTutorial('throw');
  }, [advanceTutorial, dispatch, paused]);

  const spin = rotation.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });
  const left = candlesLeft(state);

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.cake}
        </PixelText>
        <PixelText testID="hud-cake">{String(state.cake)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.candles}
        </PixelText>
        <PixelText testID="hud-candles">{String(left)}</PixelText>
      </View>
    </>
  );

  return (
    <GameFrame game="candles" frame={frame} score={state.score} hud={hud} testID="candles-screen">
      <Pressable
        testID="candles-btn-throw"
        accessibilityRole="button"
        accessibilityLabel={t.tutorial.candles.throw}
        onPress={onThrow}
        style={[styles.board, { width: g.stage + 2 * spacing.md, height: g.stage + LAUNCH_GAP + length + spacing.md, backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={[styles.stage, { width: g.stage, height: g.stage + LAUNCH_GAP + length }]} pointerEvents="none">
          <Animated.View testID="candles-cake" style={[styles.square, { width: g.stage, height: g.stage, transform: [{ rotate: spin }] }]}>
            <View style={[styles.cake, { left: length, top: length, width: diameter, height: diameter, borderRadius: diameter / 2 }]}>
              <View style={[styles.icing, { width: diameter * 0.7, height: diameter * 0.7, borderRadius: diameter * 0.35 }]} />
            </View>
            {state.candles.map((c, i) => (
              <View key={i} style={[styles.square, { width: g.stage, height: g.stage, transform: [{ rotate: `${c.angle}deg` }] }]}>
                <CandleStick g={g} color={c.preset ? PALETTE.sky : PALETTE.pink} testID={`candles-candle-${i}`} />
              </View>
            ))}
          </Animated.View>
          {state.status === 'playing' && <View style={[styles.square, { top: g.stage + LAUNCH_GAP - (length + diameter) + 2, width: g.stage, height: g.stage }]}>{left > 0 && <CandleStick g={g} color={PALETTE.pink} />}</View>}
          {throws > 0 && <Flight key={throws} g={g} />}
        </View>
      </Pressable>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  board: { borderWidth: 2, borderRadius: 4, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  stage: {},
  square: { position: 'absolute', left: 0, top: 0 },
  cake: { position: 'absolute', backgroundColor: PALETTE.brown, borderWidth: 3, borderColor: PALETTE.outline, alignItems: 'center', justifyContent: 'center' },
  icing: { backgroundColor: PALETTE.light, borderWidth: 2, borderColor: PALETTE.darkBrown },
  stick: { position: 'absolute', borderWidth: 1, borderColor: PALETTE.outline },
  flame: { position: 'absolute', backgroundColor: PALETTE.yellow, borderWidth: 1, borderColor: PALETTE.orange, borderRadius: 2 },
  hudItem: { gap: 2 },
});
