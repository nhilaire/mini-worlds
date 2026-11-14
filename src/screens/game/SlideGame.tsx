// « Bloc Glissant » screen: the sliding-block engine (src/game/slide) on a 6 × 6 board of plain Views. A swipe on a
// block (one Pan gesture over the board, the touch point picks the block) moves it one cell; the block glides there
// in 120 ms (Reanimated layout transition) while the engine ignores other swipes. The engine's slide counter is
// ticked by a requestAnimationFrame loop on the injectable clock that never re-renders React. The exit is the notch
// on the right of row 2. « Indice » outlines the block of the next move of a shortest solution and its direction.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInUp, LinearTransition } from 'react-native-reanimated';

import { PALETTE, PaletteColor } from '../../art/palette';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { blockAt, createSlide, Direction, directionOf, reduceSlide, RED_ROW, SLIDE_MS, SLIDE_PUZZLES, SLIDE_SIZE, SlideAction, SlideState } from '../../game/slide/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { Button } from '../../ui/Button';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const SWIPE_PX = 18;
const MAX_DT_MS = 100;
/** Colours of the other blocks (each block keeps its colour for the puzzle). */
const BLOCK_COLORS: readonly PaletteColor[] = ['blue', 'green', 'orange', 'purple', 'sky', 'yellow', 'brown', 'lime', 'pink', 'grey'];
const ARROWS: Record<Direction, string> = { left: '<', right: '>', up: '^', down: 'v' };

/** Engine events → sound / haptic names of the shared kit (src/feedback/feedback.ts). */
function feedbackOf(events: SlideState['events']): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'slide') out.push({ kind: 'move' });
    else if (e.kind === 'solved') out.push({ kind: 'lines' });
    else if (e.kind === 'failed') out.push({ kind: 'drop' });
    else if (e.kind === 'hint') out.push({ kind: 'button' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push({ kind: e.kind });
  }
  return out;
}

type PuzzleResult = { puzzle: number; points: number };

export function SlideGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const cell = Math.min(64, Math.floor(Math.min((width - 2 * spacing.md - 16) / SLIDE_SIZE, (height - 340) / SLIDE_SIZE)));

  const [state, setState] = useState(() => createSlide(seed, upgradeLevels(save, 'slide')));
  const stateRef = useRef(state);
  const [last, setLast] = useState<PuzzleResult | null>(null);
  const steps = useMemo(() => [{ key: 'slide', text: t.tutorial.slide.slide }], [t]);
  const frame = useRoundFrame({ game: 'slide', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  const dispatch = useCallback(
    (action: SlideAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceSlide(previous, action);
      stateRef.current = next;
      // Ticks only count the slide down (nothing drawn changes): no re-render for them.
      if (action.type === 'tick') return;
      setState(next);
      for (const e of next.events) {
        if (e.kind === 'solved') setLast({ puzzle: e.puzzle, points: e.points });
        else if (e.kind === 'failed') setLast({ puzzle: e.puzzle, points: 0 });
      }
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [finish, setCombos],
  );

  // The slide guard is ticked with the injectable clock; the loop reads dispatch through a ref, so it never restarts
  // when a callback changes identity.
  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);
  const running = !paused && state.status === 'playing';
  useEffect(() => {
    if (!running) return;
    let previous = now();
    let handle = 0;
    const loop = () => {
      const time = now();
      const dt = Math.min(MAX_DT_MS, time - previous);
      previous = time;
      if (dt > 0 && stateRef.current.slideMs > 0) dispatchRef.current({ type: 'tick', dt });
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [running]);

  const swipe = useCallback(
    (block: number, dir: Direction) => {
      if (paused) return;
      advanceTutorial('slide');
      dispatch({ type: 'swipe', block, dir });
    },
    [advanceTutorial, dispatch, paused],
  );

  const origin = useRef<number>(-1);
  /* eslint-disable react-hooks/refs -- the gesture callbacks run on touch events, never during render */
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .withTestId('slide-pan')
        .runOnJS(true)
        .minDistance(4)
        .onBegin((e) => {
          const col = Math.floor(e.x / cell);
          const row = Math.floor(e.y / cell);
          origin.current = col >= 0 && col < SLIDE_SIZE && row >= 0 && row < SLIDE_SIZE ? blockAt(stateRef.current.blocks, col, row) : -1;
        })
        .onEnd((e) => {
          const block = origin.current;
          origin.current = -1;
          const dx = e.translationX;
          const dy = e.translationY;
          if (block < 0 || Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
          swipe(block, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
        })
        .onFinalize(() => {
          origin.current = -1;
        }),
    [cell, swipe],
  );
  /* eslint-enable react-hooks/refs */

  const locked = paused || state.status !== 'playing';
  const hint = state.hint;
  const boardPx = SLIDE_SIZE * cell;

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.puzzle}
        </PixelText>
        <PixelText testID="hud-puzzle">{t.hud.of(state.puzzle, SLIDE_PUZZLES)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.moves}
        </PixelText>
        <PixelText testID="hud-moves">{String(state.moves)}</PixelText>
      </View>
    </>
  );

  return (
    <GameFrame game="slide" frame={frame} score={state.score} hud={hud} testID="slide-screen">
      <View style={styles.column}>
        <View style={styles.row}>
          <GestureDetector gesture={pan}>
            <View testID="slide-board" style={[styles.board, { width: boardPx + 4, height: boardPx + 4, backgroundColor: colors.surface, borderColor: colors.border }]}>
              {Array.from({ length: SLIDE_SIZE * SLIDE_SIZE }, (_, i) => (
                // Grid dots and invisible targets: Maestro swipes from `slide-cell-<col>-<row>`.
                <View key={i} testID={`slide-cell-${i % SLIDE_SIZE}-${Math.floor(i / SLIDE_SIZE)}`} pointerEvents="none" style={[styles.cell, { left: (i % SLIDE_SIZE) * cell, top: Math.floor(i / SLIDE_SIZE) * cell, width: cell, height: cell }]}>
                  <View style={[styles.dot, { backgroundColor: colors.border }]} />
                </View>
              ))}
              {state.blocks.map((b, i) => {
                const hinted = hint !== null && hint.block === i;
                const color = i === 0 ? PALETTE.red : PALETTE[BLOCK_COLORS[(i - 1) % BLOCK_COLORS.length]];
                return (
                  <Animated.View
                    key={`${state.puzzle}-${i}`}
                    testID={`slide-block-${i}`}
                    layout={LinearTransition.duration(SLIDE_MS)}
                    pointerEvents="none"
                    style={[
                      styles.block,
                      {
                        left: b.col * cell + 2,
                        top: b.row * cell + 2,
                        width: (b.horizontal ? b.len : 1) * cell - 4,
                        height: (b.horizontal ? 1 : b.len) * cell - 4,
                        backgroundColor: color,
                        borderColor: hinted ? colors.accent : PALETTE.outline,
                        borderWidth: hinted ? 4 : 2,
                      },
                    ]}
                  >
                    <View style={[styles.shine, b.horizontal ? styles.shineH : styles.shineV]} />
                    {hinted && hint && (
                      <PixelText testID={`slide-hint-${i}-${directionOf(state.blocks, hint)}`} color="accent" bold>
                        {ARROWS[directionOf(state.blocks, hint)]}
                      </PixelText>
                    )}
                  </Animated.View>
                );
              })}
            </View>
          </GestureDetector>
          {/* The exit: a notch on the right side of row 2. */}
          <View testID="slide-exit" style={[styles.exit, { top: RED_ROW * cell + 6, height: cell - 8, backgroundColor: PALETTE.yellow, borderColor: PALETTE.outline }]} />
        </View>

        <View style={styles.footer}>
          {last && (
            <Animated.View key={`last-${last.puzzle}`} entering={FadeInUp.duration(220)}>
              <PixelText testID="slide-last" color={last.points > 0 ? 'success' : 'danger'} bold>
                {last.points > 0 ? `+${last.points}` : '0'}
              </PixelText>
            </Animated.View>
          )}
          <Button label={t.play.hint(state.hintsLeft)} onPress={() => dispatch({ type: 'hint' })} disabled={locked || state.hintsLeft <= 0 || hint !== null} variant="secondary" compact testID="slide-btn-hint" />
        </View>
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.md },
  row: { flexDirection: 'row' },
  board: { borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  cell: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2 },
  block: { position: 'absolute', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  shine: { position: 'absolute', backgroundColor: 'rgba(255, 255, 255, 0.35)', borderRadius: 2 },
  shineH: { left: 6, right: 6, top: 4, height: 4 },
  shineV: { top: 6, bottom: 6, left: 4, width: 4 },
  exit: { position: 'absolute', right: -10, width: 10, borderWidth: 2, borderLeftWidth: 0, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  hudItem: { gap: 2 },
  footer: { alignItems: 'center', gap: spacing.sm, minHeight: 90, alignSelf: 'stretch', paddingHorizontal: spacing.md },
});
