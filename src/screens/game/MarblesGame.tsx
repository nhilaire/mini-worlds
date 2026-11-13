// « Tri de Billes » screen: the pure engine (src/game/marbles) on a row (or two) of Pressable glass tubes. Marbles are
// the bubble sprites (one face per colour). Tap a tube then another: the moved marbles pop in on their new tube
// (200 ms, the engine ignores taps meanwhile). The round timer is an engine counter ticked by a frame loop with the
// injectable clock while the round is active; React re-renders for it at most once per second (the HUD shows whole
// seconds), plus on every tap.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { MARBLES } from '../../art/games/marbles';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { createMarbles, MarblesAction, MarblesEvent, MarblesState, MOVE_GUARD_MS, reduceMarbles, secondsLeft, TUBE_SIZE } from '../../game/marbles/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { Button } from '../../ui/Button';
import { PixelSprite } from '../../ui/PixelSprite';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const MAX_DT_MS = 50;
const SPRITE_PIXELS = 12;
const TUBE_PAD = 4;
const LIFT = 10;

/** Engine events → sound / haptic names of the shared kit (src/feedback/feedback.ts). */
function feedbackOf(events: readonly MarblesEvent[]): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'move') out.push({ kind: 'move' });
    else if (e.kind === 'refused') out.push({ kind: 'swap_back' });
    else if (e.kind === 'solved') out.push({ kind: 'match' });
    else if (e.kind === 'restart') out.push({ kind: 'shuffle' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push({ kind: e.kind });
  }
  return out;
}

/** Does this transition change what React draws? Ticks only do when the whole second or the status changes. */
function needsRender(previous: MarblesState, next: MarblesState, action: MarblesAction): boolean {
  if (action.type !== 'tick') return true;
  return next.status !== previous.status || secondsLeft(next) !== secondsLeft(previous);
}

const TUTORIAL = [{ key: 'move' }] as const;

export function MarblesGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();

  const [state, setState] = useState(() => createMarbles(seed, upgradeLevels(save, 'marbles')));
  const stateRef = useRef(state);
  const steps = useMemo(() => TUTORIAL.map((s) => ({ key: s.key, text: t.tutorial.marbles[s.key] })), [t]);
  const frame = useRoundFrame({ game: 'marbles', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  // Every action goes through here: the engine stays the single source of truth.
  const dispatch = useCallback(
    (action: MarblesAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return previous;
      const next = reduceMarbles(previous, action);
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

  const onTube = useCallback(
    (tube: number) => {
      if (paused) return;
      const next = dispatch({ type: 'tap', tube });
      if (next.events.some((e) => e.kind === 'move')) advanceTutorial('move');
    },
    [advanceTutorial, dispatch, paused],
  );
  const onRestart = useCallback(() => {
    if (!paused) dispatch({ type: 'restart' });
  }, [dispatch, paused]);

  // Board size: one row up to 5 tubes, two rows beyond; marbles as big as the phone allows.
  const count = state.tubes.length;
  const rows = count > 5 ? 2 : 1;
  const perRow = Math.ceil(count / rows);
  const byWidth = (width - 2 * spacing.md) / perRow - spacing.sm - 2 * TUBE_PAD;
  const byHeight = (height - 360) / rows / TUBE_SIZE - 6;
  const scale = Math.max(2, Math.min(5, Math.floor(Math.min(byWidth, byHeight) / SPRITE_PIXELS)));
  const marble = SPRITE_PIXELS * scale;
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
          {t.hud.puzzle}
        </PixelText>
        <PixelText testID="hud-puzzle">{String(state.puzzle)}</PixelText>
      </View>
    </>
  );

  return (
    <GameFrame game="marbles" frame={frame} score={state.score} hud={hud} testID="marbles-screen">
      <View style={styles.column}>
        <View testID="marbles-board" style={[styles.board, { width: perRow * (marble + 2 * TUBE_PAD + spacing.sm) }]}>
          {state.tubes.map((tube, i) => {
            const selected = state.selected === i;
            return (
              <Pressable
                key={`${state.puzzle}-${i}`}
                testID={`marbles-tube-${i}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                disabled={locked}
                onPress={() => onTube(i)}
                style={[
                  styles.tube,
                  {
                    width: marble + 2 * TUBE_PAD,
                    height: TUBE_SIZE * marble + 2 * TUBE_PAD + 4,
                    borderColor: selected ? colors.accent : colors.border,
                    backgroundColor: colors.surface,
                    transform: [{ translateY: selected ? -LIFT : 0 }],
                  },
                ]}
              >
                {tube.map((colour, slot) => (
                  // A marble keeps its key while it stays in place: only the moved ones pop in (one short animation).
                  <Animated.View key={`${slot}-${colour}`} testID={`marbles-ball-${i}-${slot}-c${colour}`} entering={ZoomIn.duration(MOVE_GUARD_MS)} pointerEvents="none">
                    <PixelSprite sprite={MARBLES[colour]} scale={scale} />
                  </Animated.View>
                ))}
              </Pressable>
            );
          })}
        </View>
        <Button label={t.play.restart} onPress={onRestart} disabled={locked} variant="secondary" compact testID="marbles-btn-restart" />
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.lg },
  board: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: spacing.lg, columnGap: 0 },
  tube: {
    flexDirection: 'column-reverse',
    alignItems: 'center',
    marginHorizontal: spacing.sm / 2,
    padding: TUBE_PAD,
    borderWidth: 3,
    borderTopWidth: 0,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  hudItem: { gap: 2 },
});
