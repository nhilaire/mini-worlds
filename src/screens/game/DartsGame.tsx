// « Lancer de Cible » screen: the pure engine (src/game/darts) drives plain React Native views. The whole play area
// is one Pressable. The target rotation and the 120 ms flight of the dart are Animated values set from the engine
// every frame (no re-render); React re-renders only on events: a dart thrown, stuck or bounced, a level cleared, the
// next target appearing, the end of the round. A bounce is shown three ways: the dart tumbles away, a « −1 ♥ » chip
// appears and the lives of the HUD go down.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { PALETTE } from '../../art/palette';
import { UI_SPRITES } from '../../art/sprites';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { createDarts, DART_POINTS, DartsAction, DartsEvent, dartsLeft, FLIGHT_MS, MAX_LEVEL, reduceDarts, rotationOf } from '../../game/darts/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { PixelSprite } from '../../ui/PixelSprite';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { font, spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const MAX_DT_MS = 50;
const LAUNCH_GAP = 14;
const BOUNCE_MS = 450;
const RINGS = [
  { size: 1, color: PALETTE.red },
  { size: 0.78, color: PALETTE.light },
  { size: 0.56, color: PALETTE.red },
  { size: 0.34, color: PALETTE.light },
  { size: 0.14, color: PALETTE.yellow },
] as const;

type Geometry = { diameter: number; shaft: number; length: number; stage: number };

/** Engine events → existing feedback kinds: move for a dart stuck, drop for a bounce. */
function feedbackOf(events: readonly DartsEvent[]): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'stick') out.push({ kind: 'move' });
    else if (e.kind === 'bounce') out.push({ kind: 'drop' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push(e);
  }
  return out;
}

/** A dart: a thin shaft, point up, with a wide flight (feathers) at its tail. */
function DartShape({ shaft, length, color }: { shaft: number; length: number; color: string }) {
  const feathers = Math.max(6, shaft * 3);
  return (
    <View style={{ width: feathers, height: length, alignItems: 'center' }}>
      <View style={[styles.shaft, { width: shaft, height: length }]} />
      <View style={[styles.feathers, { width: feathers, height: Math.round(length * 0.4), backgroundColor: color }]} />
    </View>
  );
}

/** A dart stuck in the target edge at the bottom point, tail outward; rotate its square to place it at an angle. */
function StuckDart({ g, color, testID }: { g: Geometry; color: string; testID?: string }) {
  const feathers = Math.max(6, g.shaft * 3);
  return (
    <View testID={testID} style={[styles.dart, { left: (g.stage - feathers) / 2, top: g.length + g.diameter - 4 }]}>
      <DartShape shaft={g.shaft} length={g.length} color={color} />
    </View>
  );
}

/** The dart that bounced off tumbles away from the bottom point (visual only: the engine already took the life). */
function Bounced({ g }: { g: Geometry }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: BOUNCE_MS, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [progress]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, g.length + LAUNCH_GAP] });
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, g.diameter * 0.3] });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '140deg'] });
  const opacity = progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });
  const feathers = Math.max(6, g.shaft * 3);
  return (
    <Animated.View testID="darts-bounced" pointerEvents="none" style={[styles.dart, { left: (g.stage - feathers) / 2, top: g.length + g.diameter - 4, opacity, transform: [{ translateX }, { translateY }, { rotate }] }]}>
      <DartShape shaft={g.shaft} length={g.length} color={PALETTE.darkRed} />
    </Animated.View>
  );
}

const TUTORIAL = [{ key: 'throw' }] as const;

export function DartsGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const diameter = Math.max(120, Math.floor(Math.min((width - 2 * spacing.md) * 0.6, (height - 400) * 0.6)));
  const length = Math.round(diameter * 0.2);
  const g: Geometry = { diameter, length, shaft: Math.max(3, Math.round(diameter * 0.02)), stage: diameter + 2 * length };

  const [state, setState] = useState(() => createDarts(seed, upgradeLevels(save, 'darts')));
  const stateRef = useRef(state);
  const [rotation] = useState(() => new Animated.Value(0));
  // 0 while the next dart waits under the target, 1 when the dart in flight reaches the target edge.
  const [flight] = useState(() => new Animated.Value(0));
  const steps = useMemo(() => TUTORIAL.map((s) => ({ key: s.key, text: t.tutorial.darts[s.key] })), [t]);
  const frame = useRoundFrame({ game: 'darts', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  // Every action goes through here: the engine stays the single source of truth.
  const dispatch = useCallback(
    (action: DartsAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceDarts(previous, action);
      stateRef.current = next;
      rotation.setValue(rotationOf(next));
      flight.setValue(next.flightMs > 0 ? 1 - next.flightMs / FLIGHT_MS : 0);
      // Ticks only turn the target and move the dart in flight (Animated values above): re-render when a dart is
      // thrown, sticks or bounces, when a level is cleared, when the next target appears and when the round ends.
      if (
        next.darts !== previous.darts ||
        next.lives !== previous.lives ||
        next.status !== previous.status ||
        next.flightMs > 0 !== previous.flightMs > 0 ||
        next.pauseMs > 0 !== previous.pauseMs > 0
      ) {
        setState(next);
      }
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [finish, flight, rotation, setCombos],
  );
  // The frame loop must not restart when dispatch changes identity: it reads the latest one through a ref.
  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  // Frame loop: ticks the engine with the injectable clock while the round is active (not behind the tutorial bubble
  // nor the pause): the target does not turn and the dart does not fly meanwhile.
  const playing = state.status === 'playing';
  useEffect(() => {
    if (!active || !playing) return;
    let last = now();
    let handle = 0;
    const loop = () => {
      const time = now();
      const dt = Math.min(MAX_DT_MS, time - last);
      last = time;
      if (dt > 0) dispatchRef.current({ type: 'tick', dt });
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [active, playing]);

  const onThrow = useCallback(() => {
    if (paused || stateRef.current.status !== 'playing') return;
    // The engine ignores a tap during a flight or before the next target appears.
    dispatch({ type: 'throw' });
    advanceTutorial('throw');
  }, [advanceTutorial, dispatch, paused]);

  const spin = rotation.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });
  const fly = flight.interpolate({ inputRange: [0, 1], outputRange: [LAUNCH_GAP + length, 0] });
  const left = dartsLeft(state);
  const waiting = state.pauseMs > 0 && playing;
  const bounced = state.events.some((e) => e.kind === 'bounce');
  const stuck = state.events.some((e) => e.kind === 'stick');
  // The dart in flight is not in the row any more.
  const inRow = Math.max(0, left - (state.flightMs > 0 ? 1 : 0));

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.lives}
        </PixelText>
        <PixelText testID="hud-lives">{String(state.lives)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.stage}
        </PixelText>
        <PixelText testID="hud-stage">{t.hud.of(state.level, MAX_LEVEL)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.darts}
        </PixelText>
        <PixelText testID="hud-darts">{String(left)}</PixelText>
      </View>
    </>
  );

  return (
    <GameFrame game="darts" frame={frame} score={state.score} hud={hud} testID="darts-screen">
      <Pressable
        testID="darts-throw"
        accessibilityRole="button"
        accessibilityLabel={t.tutorial.darts.throw}
        onPress={onThrow}
        style={[styles.board, { backgroundColor: colors.surface, borderColor: bounced ? PALETTE.red : colors.border }]}
      >
        <View style={styles.info} pointerEvents="none">
          {bounced && (
            <View style={[styles.chip, { backgroundColor: PALETTE.darkRed }]} testID="darts-bounce">
              <PixelText style={{ color: PALETTE.light }}>−1</PixelText>
              <PixelSprite sprite={UI_SPRITES.heart} scale={2} />
            </View>
          )}
          {stuck && !bounced && (
            <View style={[styles.chip, { backgroundColor: PALETTE.darkGreen }]} testID="darts-stuck">
              <PixelText style={{ color: PALETTE.light }}>{`+${DART_POINTS}`}</PixelText>
            </View>
          )}
        </View>

        <View style={{ width: g.stage, height: g.stage + LAUNCH_GAP + length }} pointerEvents="none">
          {!waiting && (
            <Animated.View testID="darts-target" style={[styles.square, { width: g.stage, height: g.stage, transform: [{ rotate: spin }] }]}>
              <View style={[styles.target, { left: length, top: length, width: diameter, height: diameter, borderRadius: diameter / 2 }]}>
                {RINGS.map((ring) => (
                  <View key={ring.size} style={[styles.ring, { width: diameter * ring.size, height: diameter * ring.size, borderRadius: (diameter * ring.size) / 2, backgroundColor: ring.color }]} />
                ))}
                {/* Two spokes: without them an empty target would not be seen turning. */}
                <View style={[styles.spoke, { width: diameter - 6, height: 2 }]} />
                <View style={[styles.spoke, { width: 2, height: diameter - 6 }]} />
              </View>
              {state.darts.map((d, i) => (
                <View key={i} style={[styles.square, { width: g.stage, height: g.stage, transform: [{ rotate: `${d.angle}deg` }] }]}>
                  <StuckDart g={g} color={d.preset ? PALETTE.sky : PALETTE.green} testID={`darts-dart-${i}`} />
                </View>
              ))}
            </Animated.View>
          )}
          {playing && !waiting && left > 0 && (
            <Animated.View testID={state.flightMs > 0 ? 'darts-flight' : 'darts-next'} style={[styles.square, { width: g.stage, height: g.stage, transform: [{ translateY: fly }] }]}>
              <StuckDart g={g} color={PALETTE.green} />
            </Animated.View>
          )}
          {bounced && <Bounced key={state.lives} g={g} />}
          {waiting && (
            <View style={[styles.square, styles.banner, { width: g.stage, height: g.stage }]}>
              <View style={styles.chip}>
                <PixelText size={font.heading} testID="darts-next-level" style={{ color: PALETTE.light }}>
                  {`${t.hud.stage} ${state.level}`}
                </PixelText>
              </View>
            </View>
          )}
        </View>

        <View style={styles.row} pointerEvents="none" testID="darts-left" accessibilityLabel={`${t.hud.darts} ${left}`}>
          {Array.from({ length: inRow }, (_, i) => (
            <View key={i} testID={`darts-left-${i}`}>
              <DartShape shaft={2} length={22} color={PALETTE.green} />
            </View>
          ))}
        </View>
      </Pressable>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  board: { alignSelf: 'stretch', flex: 1, margin: spacing.md, borderWidth: 2, borderRadius: 4, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, overflow: 'hidden' },
  info: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 36 },
  square: { position: 'absolute', left: 0, top: 0 },
  banner: { alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: PALETTE.outline, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 4 },
  target: { position: 'absolute', borderWidth: 3, borderColor: PALETTE.outline, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ring: { position: 'absolute', borderWidth: 1, borderColor: PALETTE.outline },
  spoke: { position: 'absolute', backgroundColor: PALETTE.outline },
  dart: { position: 'absolute' },
  shaft: { backgroundColor: PALETTE.grey, borderWidth: 1, borderColor: PALETTE.outline },
  feathers: { position: 'absolute', bottom: 0, borderWidth: 1, borderColor: PALETTE.outline, borderRadius: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 4, minHeight: 24 },
  hudItem: { gap: 2 },
});
