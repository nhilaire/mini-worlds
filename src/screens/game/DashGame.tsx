// « Couleur Éclair » screen: a road of three lanes (three Pressables); the gate on its way shows one door per lane
// and comes down to the runner at the bottom (engine `approachMs`, ticked by a frame loop while the round is
// active); a tap on a lane moves the runner there. The approach is drawn through Animated values set from the engine
// (no React render per frame). Colour is never the only cue: each colour has its own shape (red round, blue square,
// yellow triangle), on the doors, on the runner and in the HUD.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { SHAPES } from '../../art/games/dash';
import { PALETTE } from '../../art/palette';
import { UI_SPRITES } from '../../art/sprites';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { approachTime, createDash, DashAction, DashEvent, DOOR_POINTS, Lane, LANES, MAX_GATES, reduceDash } from '../../game/dash/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { PixelSprite } from '../../ui/PixelSprite';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const MAX_DT_MS = 50;

/** Engine events → feedback kinds of the shared kit. */
function feedbackOf(events: readonly DashEvent[]): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'door') out.push({ kind: e.ok ? 'move' : 'drop' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push(e);
  }
  return out;
}

const LANE_HEIGHT = 300;
const DOOR_HEIGHT = 60;
const RUNNER_HEIGHT = 64;
const LANE_SWITCH_MS = 120;
const LANE_GAP = spacing.sm;

export function DashGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width } = useWindowDimensions();
  const laneWidth = Math.floor(Math.min(110, (width - 2 * spacing.md - 2 * LANE_GAP) / 3));

  const [state, setState] = useState(() => createDash(seed, upgradeLevels(save, 'dash')));
  const stateRef = useRef(state);
  // 0 at the start of an approach, 1 when the gate reaches the runner; the lane position slides on a tap.
  const [progress] = useState(() => new Animated.Value(0));
  const [laneX] = useState(() => new Animated.Value(LANES.indexOf(state.lane) * (laneWidth + LANE_GAP)));
  const steps = useMemo(() => [{ key: 'lane', text: t.tutorial.dash.lane }], [t]);
  const frame = useRoundFrame({ game: 'dash', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  const laneOffset = laneWidth + LANE_GAP;
  const dispatch = useCallback(
    (action: DashAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceDash(previous, action);
      stateRef.current = next;
      progress.setValue(next.status === 'playing' ? 1 - next.approachMs / approachTime(next.passed + 1) : 1);
      if (next.lane !== previous.lane) {
        Animated.timing(laneX, { toValue: LANES.indexOf(next.lane) * laneOffset, duration: LANE_SWITCH_MS, useNativeDriver: false }).start();
      }
      // Ticks only move the gate (Animated value): re-render when a gate is passed, the lane changes or the round ends.
      if (next.passed !== previous.passed || next.status !== previous.status || next.lane !== previous.lane) setState(next);
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [finish, laneOffset, laneX, progress, setCombos],
  );
  // The frame loop must not restart when dispatch changes identity: it reads the latest one through a ref.
  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  // Frame loop: the gate comes down while the round is active (not behind the tutorial bubble nor the pause).
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

  const onLane = useCallback(
    (lane: Lane) => {
      if (paused || stateRef.current.status !== 'playing') return;
      dispatch({ type: 'steer', lane });
      advanceTutorial('lane');
    },
    [advanceTutorial, dispatch, paused],
  );

  const laneNames: Record<Lane, string> = { left: t.play.left, middle: t.play.middle, right: t.play.right };
  const last = state.last;
  const fall = progress.interpolate({ inputRange: [0, 1], outputRange: [0, LANE_HEIGHT - DOOR_HEIGHT - RUNNER_HEIGHT - 12] });

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
          {t.hud.gates}
        </PixelText>
        <PixelText testID="hud-gates">{t.hud.of(state.passed, MAX_GATES)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.colour}
        </PixelText>
        <PixelSprite sprite={SHAPES[state.colour]} scale={2} testID={`hud-colour-${state.colour}`} />
      </View>
    </>
  );

  return (
    <GameFrame game="dash" frame={frame} score={state.score} hud={hud} testID="dash-screen">
      <View style={styles.column}>
        <View style={styles.info}>
          <View style={styles.infoItem}>
            <PixelText size={8} color="muted">
              {t.hud.streak}
            </PixelText>
            <PixelText testID="dash-streak">{String(state.streak)}</PixelText>
          </View>
          {(state.shields > 0 || last?.shielded) && (
            <View style={styles.infoItem}>
              <PixelText size={8} color="muted">
                {t.hud.shields}
              </PixelText>
              <PixelText testID="dash-shields">{String(state.shields)}</PixelText>
            </View>
          )}
          {last && (
            <View style={[styles.chip, { backgroundColor: last.ok ? PALETTE.darkGreen : PALETTE.darkRed }]} testID={last.ok ? 'dash-result-ok' : 'dash-result-wrong'}>
              <PixelText style={{ color: PALETTE.light }}>{last.ok ? `+${DOOR_POINTS}` : last.shielded ? t.upgrade.guard.name : '−1'}</PixelText>
              {!last.ok && !last.shielded && <PixelSprite sprite={UI_SPRITES.heart} scale={2} />}
            </View>
          )}
        </View>

        <View style={[styles.field, { gap: LANE_GAP }]}>
          {LANES.map((lane, i) => {
            const selected = state.lane === lane;
            return (
              <Pressable
                key={lane}
                testID={`dash-lane-${lane}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={laneNames[lane]}
                disabled={!playing}
                onPress={() => onLane(lane)}
                style={[styles.lane, { width: laneWidth, height: LANE_HEIGHT, borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.surfaceAlt : colors.surface }]}
              >
                {playing && (
                  <Animated.View
                    testID={`dash-door-${lane}`}
                    pointerEvents="none"
                    style={[styles.door, { height: DOOR_HEIGHT, backgroundColor: colors.background, borderColor: PALETTE[state.doors[i]], transform: [{ translateY: fall }] }]}
                  >
                    <PixelSprite sprite={SHAPES[state.doors[i]]} scale={3} testID={`dash-shape-${state.doors[i]}`} />
                  </Animated.View>
                )}
              </Pressable>
            );
          })}
          <Animated.View style={[styles.runner, { width: laneWidth, height: RUNNER_HEIGHT, transform: [{ translateX: laneX }] }]} pointerEvents="none" testID="dash-runner">
            <PixelSprite sprite={SHAPES[state.colour]} scale={4} testID={`dash-shape-${state.colour}`} />
          </Animated.View>
        </View>
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.md },
  info: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 36 },
  infoItem: { gap: 2, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 4 },
  field: { flexDirection: 'row' },
  lane: { borderWidth: 2, borderRadius: 6, padding: 4 },
  door: { borderWidth: 4, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  runner: { position: 'absolute', left: 0, bottom: 4, alignItems: 'center', justifyContent: 'center' },
  hudItem: { gap: 2 },
});
