// « Suite Logique » screen: the sequence of the pure engine (src/game/pattern) as 4 tiles and a « ? » tile above 4
// large answer buttons. An answer is shown 250 ms on its button - green with a check or red with a cross - while the
// engine ignores taps; then the next question takes its place. The round timer is an engine counter ticked by a
// frame loop with the injectable clock while the round is active; React re-renders for it at most once per second
// (the HUD shows whole seconds), plus on taps and when the shown answer goes away.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { CHECK_MARK, CROSS_MARK, SYMBOL_SPRITES } from '../../art/games/pattern';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { createPattern, Item, levelNow, PatternAction, PatternEvent, PatternState, reducePattern, secondsLeft } from '../../game/pattern/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { PixelSprite } from '../../ui/PixelSprite';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { font, spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const MAX_DT_MS = 50;
const SYMBOL_PIXELS = 12;
const TILE_GAP = spacing.sm;
const MAX_TILE = 72;
const MAX_BUTTON = 170;

/** Engine events → sound / haptic names of the shared kit (src/feedback/feedback.ts). */
function feedbackOf(events: readonly PatternEvent[]): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'right') out.push({ kind: 'coin' });
    else if (e.kind === 'wrong') out.push({ kind: 'drop' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push({ kind: e.kind });
  }
  return out;
}

/** Does this transition change what React draws? Ticks only do when the whole second, the shown answer or the status changes. */
function needsRender(previous: PatternState, next: PatternState, action: PatternAction): boolean {
  if (action.type !== 'tick') return next !== previous;
  return next.status !== previous.status || next.flash !== previous.flash || secondsLeft(next) !== secondsLeft(previous);
}

/** A number in the pixel font, or the sprite of a symbol, inside a box of `size`. */
function ItemView({ item, size }: { item: Item; size: number }) {
  if (typeof item === 'number') {
    return (
      <PixelText size={font.heading} bold numberOfLines={1} adjustsFontSizeToFit>
        {String(item)}
      </PixelText>
    );
  }
  return <PixelSprite sprite={SYMBOL_SPRITES[item]} scale={Math.max(1, Math.floor((size * 0.7) / SYMBOL_PIXELS))} />;
}

type AnswerProps = { index: number; item: Item; size: number; disabled: boolean; /** The answer shown on this button, if any. */ shown: 'right' | 'wrong' | null; onPress: (index: number) => void };

/** One large answer button; while its answer is shown it is green with a check, or red with a cross. */
function AnswerButton({ index, item, size, disabled, shown, onPress }: AnswerProps) {
  const { colors } = useTheme();
  const height = Math.floor(size * 0.7);
  const shownColor = shown === 'right' ? colors.success : shown === 'wrong' ? colors.danger : null;
  return (
    <Pressable
      testID={`pattern-answer-${index}`}
      accessibilityRole="button"
      accessibilityLabel={String(item)}
      disabled={disabled}
      onPress={() => onPress(index)}
      style={({ pressed }) => [styles.answer, { width: size, height, backgroundColor: shownColor ?? (pressed ? colors.surfaceAlt : colors.surface), borderColor: colors.border }]}
    >
      <ItemView item={item} size={height} />
      {shown !== null && <PixelSprite testID={`pattern-mark-${shown}`} sprite={shown === 'right' ? CHECK_MARK : CROSS_MARK} scale={3} style={styles.mark} />}
    </Pressable>
  );
}

export function PatternGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const button = Math.floor(Math.min((width - 2 * spacing.md - spacing.md) / 2, (height - 460) / 2, MAX_BUTTON));
  const tile = Math.floor(Math.min((width - 2 * spacing.md - 4 * TILE_GAP) / 5, MAX_TILE));

  const [state, setState] = useState(() => createPattern(seed, upgradeLevels(save, 'pattern')));
  const stateRef = useRef(state);
  const steps = useMemo(() => [{ key: 'answer', text: t.tutorial.pattern.answer }], [t]);
  const frame = useRoundFrame({ game: 'pattern', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  const dispatch = useCallback(
    (action: PatternAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return previous;
      const next = reducePattern(previous, action);
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

  const onAnswer = useCallback(
    (index: number) => {
      if (paused) return;
      const next = dispatch({ type: 'answer', index });
      if (next.events.some((e) => e.kind === 'right' || e.kind === 'wrong')) advanceTutorial('answer');
    },
    [advanceTutorial, dispatch, paused],
  );

  // While an answer is shown, the question it was given to stays on screen.
  const { flash } = state;
  const question = flash?.question ?? state.question;
  const locked = paused || state.status !== 'playing';
  const rowWidth = tile * 5 + TILE_GAP * 4;

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.time}
        </PixelText>
        <PixelText testID="hud-time">{String(secondsLeft(state))}</PixelText>
      </View>
      <PixelText testID="hud-level">{t.hud.level(levelNow(state))}</PixelText>
    </>
  );

  return (
    <GameFrame game="pattern" frame={frame} score={state.score} hud={hud} testID="pattern-screen">
      <View style={styles.column}>
        <View style={[styles.sequence, { width: rowWidth }]}>
          {question.terms.map((item, i) => (
            <View key={i} testID={`pattern-term-${i}`} accessible accessibilityLabel={String(item)} style={[styles.tile, { width: tile, height: tile, backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ItemView item={item} size={tile} />
            </View>
          ))}
          <View testID="pattern-unknown" accessible accessibilityLabel="?" style={[styles.tile, { width: tile, height: tile, backgroundColor: colors.surfaceAlt, borderColor: colors.accent }]}>
            <PixelText size={font.heading} bold color="accent">
              ?
            </PixelText>
          </View>
        </View>
        <View style={[styles.grid, { width: button * 2 + spacing.md }]}>
          {question.answers.map((item, i) => (
            <AnswerButton key={i} index={i} item={item} size={button} disabled={locked} shown={flash?.index === i ? (flash.correct ? 'right' : 'wrong') : null} onPress={onAnswer} />
          ))}
        </View>
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.lg },
  sequence: { flexDirection: 'row', gap: TILE_GAP },
  tile: { borderWidth: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  answer: { borderWidth: 3, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  mark: { position: 'absolute', top: 4, right: 4 },
  hudItem: { gap: 2 },
});
