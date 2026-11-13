// « Calcul Éclair » screen: the question of the pure engine (src/game/quicksum) above 4 large answer buttons. A new
// question pops in (200 ms; the engine ignores taps for its first 250 ms); a wrong answer flashes its button red
// (300 ms) and costs 5 s. The round timer is an engine counter ticked by a frame loop with the injectable clock while
// the round is active; React re-renders for it at most once per second (the HUD shows whole seconds), plus on taps.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming, ZoomIn } from 'react-native-reanimated';

import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { createQuickSum, Op, QuickSumAction, QuickSumEvent, QuickSumState, reduceQuickSum, secondsLeft } from '../../game/quicksum/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { font, spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const MAX_DT_MS = 50;
const FLASH_MS = 300;
const QUESTION_IN_MS = 200;
const OP_SIGNS: Record<Op, string> = { '+': '+', '-': '-', '×': '×' };

/** Engine events → sound / haptic names of the shared kit (src/feedback/feedback.ts). */
function feedbackOf(events: readonly QuickSumEvent[]): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'right') out.push({ kind: 'coin' });
    else if (e.kind === 'wrong') out.push({ kind: 'drop' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push({ kind: e.kind });
  }
  return out;
}

/** Does this transition change what React draws? Ticks only do when the whole second or the status changes. */
function needsRender(previous: QuickSumState, next: QuickSumState, action: QuickSumAction): boolean {
  if (action.type !== 'tick') return next !== previous;
  return next.status !== previous.status || secondsLeft(next) !== secondsLeft(previous);
}

type AnswerProps = { index: number; value: number; size: number; disabled: boolean; onPress: (index: number) => boolean };

/** One large answer button; it flashes red (300 ms) when the engine says the tap was a wrong answer. */
function AnswerButton({ index, value, size, disabled, onPress }: AnswerProps) {
  const { colors } = useTheme();
  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.get() }));
  return (
    <Pressable
      testID={`quicksum-answer-${index}`}
      accessibilityRole="button"
      accessibilityLabel={String(value)}
      disabled={disabled}
      onPress={() => {
        if (onPress(index)) flash.set(withSequence(withTiming(1, { duration: 0 }), withTiming(0, { duration: FLASH_MS })));
      }}
      style={({ pressed }) => [styles.answer, { width: size, height: size * 0.7, backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderColor: colors.border }]}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.danger }, flashStyle]} />
      <PixelText size={font.heading} bold>
        {String(value)}
      </PixelText>
    </Pressable>
  );
}

export function QuickSumGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const button = Math.floor(Math.min((width - 2 * spacing.md - spacing.md) / 2, (height - 420) / 2, 170));

  const [state, setState] = useState(() => createQuickSum(seed, upgradeLevels(save, 'quicksum')));
  const stateRef = useRef(state);
  const steps = useMemo(() => [{ key: 'answer', text: t.tutorial.quicksum.answer }], [t]);
  const frame = useRoundFrame({ game: 'quicksum', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  const dispatch = useCallback(
    (action: QuickSumAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return previous;
      const next = reduceQuickSum(previous, action);
      stateRef.current = next;
      if (needsRender(previous, next, action)) setState(next);
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
      return next;
    },
    [finish, setCombos],
  );

  // The frame loop must not restart when dispatch changes identity: it reads the latest dispatch through a ref.
  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);
  useEffect(() => {
    if (!active) return;
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
  }, [active]);

  /** Returns true when the tap was a wrong answer (the button flashes). */
  const onAnswer = useCallback(
    (index: number) => {
      if (paused) return false;
      const next = dispatch({ type: 'answer', index });
      if (next.events.some((e) => e.kind === 'right' || e.kind === 'wrong')) advanceTutorial('answer');
      return next.events.some((e) => e.kind === 'wrong');
    },
    [advanceTutorial, dispatch, paused],
  );

  const { question } = state;
  const locked = paused || state.status !== 'playing';

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.time}
        </PixelText>
        <PixelText testID="hud-time">{String(secondsLeft(state))}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.streak}
        </PixelText>
        <PixelText testID="hud-streak">{String(state.streak)}</PixelText>
      </View>
    </>
  );

  return (
    <GameFrame game="quicksum" frame={frame} score={state.score} hud={hud} testID="quicksum-screen">
      <View style={styles.column}>
        <View style={[styles.questionBox, { backgroundColor: colors.surface, borderColor: colors.border, width: button * 2 + spacing.md }]}>
          <Animated.View key={state.questionId} entering={ZoomIn.duration(QUESTION_IN_MS)}>
            <PixelText testID="quicksum-question" size={font.heading} bold>
              {`${question.a} ${OP_SIGNS[question.op]} ${question.b} = ?`}
            </PixelText>
          </Animated.View>
        </View>
        <View style={[styles.grid, { width: button * 2 + spacing.md }]}>
          {question.choices.map((value, i) => (
            <AnswerButton key={i} index={i} value={value} size={button} disabled={locked} onPress={onAnswer} />
          ))}
        </View>
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.lg },
  questionBox: { borderWidth: 2, borderRadius: 8, paddingVertical: spacing.lg, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  answer: { borderWidth: 3, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  hudItem: { gap: 2 },
});
