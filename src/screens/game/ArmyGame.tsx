// « Armée de Poche » screen: the fort of the run at the top, the road of 10 pairs (dots), then two lanes, each with
// its gate at the top. Timed choice (AC-92): the army walks on its own up its lane (engine `approachMs`, ticked by
// a frame loop while the round is active) and goes through the gate of its lane; a tap on a lane moves it there.
// The walk is drawn through Animated values set from the engine (no React render per frame). Every gate has the same
// neutral colour: only its label tells a good gate from a bad one.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { FORT, SOLDIER } from '../../art/games/army';
import { PALETTE } from '../../art/palette';
import { approachTime, ArmyAction, ArmyEvent, createArmy, gateLabel, MAX_RUNS, PAIRS_PER_RUN, reduceArmy, Side } from '../../game/army/engine';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { PixelSprite } from '../../ui/PixelSprite';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { font, spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const MAX_DT_MS = 50;

/** Engine events → feedback kinds of the shared kit. */
function feedbackOf(events: readonly ArmyEvent[]): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'gate') out.push({ kind: e.to >= e.from ? 'move' : 'drop' });
    else if (e.kind === 'fort') out.push({ kind: e.won ? 'refill' : 'drop' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push(e);
  }
  return out;
}

/** One neutral colour for every gate (v0.3.0 phone test: red gates gave the answer away). */
export const GATE_COLOR = PALETTE.blue;
const LANE_HEIGHT = 260;
const DOOR_HEIGHT = 64;
const SQUAD_HEIGHT = 56;
const LANE_SWITCH_MS = 150;

export function ArmyGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width } = useWindowDimensions();
  const laneWidth = Math.floor(Math.min(170, (width - 3 * spacing.md) / 2));

  const [state, setState] = useState(() => createArmy(seed, upgradeLevels(save, 'army')));
  const stateRef = useRef(state);
  // 0 at the start of an approach, 1 when the army reaches the gates; the lane position slides on a tap.
  const [progress] = useState(() => new Animated.Value(0));
  const [laneX] = useState(() => new Animated.Value(0));
  const steps = useMemo(() => [{ key: 'gate', text: t.tutorial.army.gate }], [t]);
  const frame = useRoundFrame({ game: 'army', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  const laneOffset = laneWidth + spacing.md;
  const dispatch = useCallback(
    (action: ArmyAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceArmy(previous, action);
      stateRef.current = next;
      progress.setValue(next.status === 'playing' ? 1 - next.approachMs / approachTime(next.run) : 1);
      if (next.lane !== previous.lane) {
        Animated.timing(laneX, { toValue: next.lane === 'left' ? 0 : laneOffset, duration: LANE_SWITCH_MS, useNativeDriver: false }).start();
      }
      // Ticks only move the army (Animated values): re-render when a gate is crossed, the lane changes or the round ends.
      if (next.pair !== previous.pair || next.run !== previous.run || next.status !== previous.status || next.lane !== previous.lane) setState(next);
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

  // Frame loop: the army walks while the round is active (not behind the tutorial bubble nor the pause).
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
    (side: Side) => {
      if (paused || stateRef.current.status !== 'playing') return;
      dispatch({ type: 'steer', side });
      advanceTutorial('gate');
    },
    [advanceTutorial, dispatch, paused],
  );

  const pair = state.pair < PAIRS_PER_RUN ? state.pairs[state.pair] : null;
  const fort = state.lastFort;
  const showFort = fort !== null && (state.pair === 0 || state.status === 'over');
  const climb = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -(LANE_HEIGHT - DOOR_HEIGHT - SQUAD_HEIGHT)] });

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.soldiers}
        </PixelText>
        <PixelText testID="hud-soldiers">{String(state.army)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.run}
        </PixelText>
        <PixelText testID="hud-run">{t.hud.of(state.run, MAX_RUNS)}</PixelText>
      </View>
    </>
  );

  return (
    <GameFrame game="army" frame={frame} score={state.score} hud={hud} testID="army-screen">
      <View style={styles.column}>
        <View style={[styles.fort, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <PixelSprite sprite={FORT} scale={4} />
          <PixelText size={font.heading} testID="army-fort">
            {t.play.fort(state.defenders)}
          </PixelText>
        </View>

        {showFort && fort && (
          <View style={[styles.chip, { backgroundColor: fort.won ? PALETTE.darkGreen : PALETTE.darkRed }]} testID="army-fort-result">
            <PixelText style={{ color: PALETTE.light }}>{fort.won ? `${t.play.win} +${fort.points}` : t.play.lose}</PixelText>
          </View>
        )}

        <View style={styles.road} testID="army-road">
          {Array.from({ length: PAIRS_PER_RUN }, (_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i < state.pair ? colors.accent : colors.surfaceAlt, borderColor: colors.border }]} />
          ))}
        </View>

        <View style={styles.field}>
          {(['left', 'right'] as const).map((side, i) => {
            const gate = pair?.[i];
            const selected = state.lane === side;
            return (
              <Pressable
                key={side}
                testID={`army-lane-${side}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${side === 'left' ? t.play.left : t.play.right} ${gate ? gateLabel(gate) : ''}`}
                disabled={!playing}
                onPress={() => onLane(side)}
                style={[styles.lane, { width: laneWidth, height: LANE_HEIGHT, borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.surfaceAlt : colors.surface }]}
              >
                <View testID={`army-door-${side}`} style={[styles.door, { height: DOOR_HEIGHT, backgroundColor: GATE_COLOR, borderColor: PALETTE.outline }]}>
                  <PixelText size={font.title} bold style={{ color: PALETTE.white }} testID={`army-gate-${side}`}>
                    {gate ? gateLabel(gate) : ''}
                  </PixelText>
                </View>
              </Pressable>
            );
          })}
          <Animated.View
            style={[styles.army, { width: laneWidth, height: SQUAD_HEIGHT, transform: [{ translateX: laneX }, { translateY: climb }] }]}
            pointerEvents="none"
            testID="army-squad"
          >
            <View style={styles.squad}>
              {Array.from({ length: Math.min(5, Math.max(1, Math.ceil(state.army / 10))) }, (_, i) => (
                <PixelSprite key={i} sprite={SOLDIER} scale={3} />
              ))}
            </View>
            <PixelText size={font.pixelBig} testID="army-count">
              {String(state.army)}
            </PixelText>
          </Animated.View>
        </View>
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.md },
  fort: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 2, borderRadius: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 4 },
  road: { flexDirection: 'row', gap: 6 },
  dot: { width: 12, height: 12, borderWidth: 2, borderRadius: 2 },
  field: { flexDirection: 'row', gap: spacing.md },
  lane: { borderWidth: 2, borderRadius: 6, padding: 6 },
  door: { borderWidth: 3, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  army: { position: 'absolute', left: 0, bottom: 0, alignItems: 'center', justifyContent: 'flex-end' },
  squad: { flexDirection: 'row', gap: 2 },
  hudItem: { gap: 2 },
});
