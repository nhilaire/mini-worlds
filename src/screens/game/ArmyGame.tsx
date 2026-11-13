// « Armée de Poche » screen: the fort of the run at the top, the road of 10 pairs (dots), the next pair of gates as
// two big buttons and the army at the bottom. Turn-based: a tap settles at once in the engine (soldiers, HUD); the
// 500 ms walk through the gate is an engine counter (input guard) ticked by a frame loop that runs only while the
// army walks; the walk itself is drawn through an Animated value set from the engine (no React render per frame).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { FORT, SOLDIER } from '../../art/games/army';
import { PALETTE } from '../../art/palette';
import { ArmyAction, ArmyEvent, createArmy, Gate, gateLabel, MAX_RUNS, PAIRS_PER_RUN, reduceArmy, Side, WALK_MS } from '../../game/army/engine';
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

/** Gates that grow the army are green, the others red (the sign of the label tells them apart too). */
function gateColor(gate: Gate): string {
  return gate.op === 'add' || gate.op === 'mul' ? PALETTE.green : PALETTE.red;
}

export function ArmyGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width } = useWindowDimensions();
  const gateWidth = Math.floor(Math.min(170, (width - 3 * spacing.md) / 2));

  const [state, setState] = useState(() => createArmy(seed, upgradeLevels(save, 'army')));
  const stateRef = useRef(state);
  const [walk] = useState(() => new Animated.Value(0));
  const [walkSide, setWalkSide] = useState<Side>('left');
  const steps = useMemo(() => [{ key: 'gate', text: t.tutorial.army.gate }], [t]);
  const frame = useRoundFrame({ game: 'army', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  const dispatch = useCallback(
    (action: ArmyAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceArmy(previous, action);
      stateRef.current = next;
      walk.setValue(next.walkMs > 0 ? 1 - next.walkMs / WALK_MS : 0);
      // Ticks only move the army (Animated value): re-render when a gate is taken or the walk ends.
      const walkingChanged = next.walkMs > 0 !== previous.walkMs > 0;
      if (next.pair !== previous.pair || next.run !== previous.run || next.status !== previous.status || walkingChanged) setState(next);
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [finish, setCombos, walk],
  );
  // The frame loop must not restart when dispatch changes identity: it reads the latest one through a ref.
  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  // Frame loop, only while the army walks through a gate (the input guard lives in the engine).
  const walking = state.walkMs > 0 && state.status === 'playing';
  useEffect(() => {
    if (!active || !walking) return;
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
  }, [active, walking]);

  const onGate = useCallback(
    (side: Side) => {
      const current = stateRef.current;
      if (paused || current.status !== 'playing') return;
      if (current.walkMs <= 0) setWalkSide(side);
      dispatch({ type: 'choose', side });
      advanceTutorial('gate');
    },
    [advanceTutorial, dispatch, paused],
  );

  const pair = state.pair < PAIRS_PER_RUN ? state.pairs[state.pair] : null;
  const fort = state.lastFort;
  const showFort = fort !== null && (state.pair === 0 || state.status === 'over');
  const lift = walk.interpolate({ inputRange: [0, 1], outputRange: [0, -70] });
  const shift = walk.interpolate({ inputRange: [0, 1], outputRange: [0, walkSide === 'left' ? -gateWidth / 2 : gateWidth / 2] });
  const fade = walk.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0.3] });

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

        <View style={styles.gates}>
          {(['left', 'right'] as const).map((side, i) => {
            const gate = pair?.[i];
            return (
              <Pressable
                key={side}
                testID={`army-btn-${side}`}
                accessibilityRole="button"
                accessibilityLabel={`${side === 'left' ? t.play.left : t.play.right} ${gate ? gateLabel(gate) : ''}`}
                disabled={!gate || state.status !== 'playing'}
                onPress={() => onGate(side)}
                style={[styles.gate, { width: gateWidth, height: Math.round(gateWidth * 0.8), backgroundColor: gate ? gateColor(gate) : colors.surfaceAlt, borderColor: PALETTE.outline, opacity: walking ? 0.7 : 1 }]}
              >
                <PixelText size={font.title} bold style={{ color: PALETTE.white }} testID={`army-gate-${side}`}>
                  {gate ? gateLabel(gate) : ''}
                </PixelText>
              </Pressable>
            );
          })}
        </View>

        <Animated.View style={[styles.army, { opacity: fade, transform: [{ translateX: shift }, { translateY: lift }] }]} pointerEvents="none" testID="army-squad">
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
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.md },
  fort: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 2, borderRadius: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 4 },
  road: { flexDirection: 'row', gap: 6 },
  dot: { width: 12, height: 12, borderWidth: 2, borderRadius: 2 },
  gates: { flexDirection: 'row', gap: spacing.md },
  gate: { borderWidth: 3, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  army: { alignItems: 'center', gap: 4, marginTop: spacing.md },
  squad: { flexDirection: 'row', gap: 2 },
  hudItem: { gap: 2 },
});
