// « Duo Synchro » screen: the twins engine (src/game/twins) on a 6 × 6 grid of plain Views. A swipe anywhere on the
// grid, or one of the four arrow buttons, moves both characters (blue round, orange square) one cell; each glides
// there in 120 ms (Reanimated layout transition) and a character that cannot move gives a small bump. The exits are
// hollow shapes of the same shape and colour. The engine's counters (120 ms move guard, 800 ms a finished puzzle
// stays shown) are ticked by a requestAnimationFrame loop on the injectable clock that runs only while one of them
// is counting. « Indice » highlights the arrow of the next move of a shortest solution.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInUp, Keyframe, LinearTransition } from 'react-native-reanimated';

import { PALETTE } from '../../art/palette';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { acceptsInput, colOf, createTwins, Direction, reduceTwins, rowOf, TWINS_CELLS, TWINS_MOVE_MS, TWINS_PUZZLES, TWINS_SIZE, TwinsAction, TwinsState } from '../../game/twins/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { Button } from '../../ui/Button';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

/** Shortest finger travel read as a swipe (px). */
const SWIPE_PX = 16;
const MAX_DT_MS = 100;
/** Travel of the bump of a character that cannot move (px). */
const BUMP_PX = 5;

const bumpOf = (x: number, y: number) =>
  new Keyframe({
    0: { transform: [{ translateX: 0 }, { translateY: 0 }] },
    45: { transform: [{ translateX: x }, { translateY: y }] },
    100: { transform: [{ translateX: 0 }, { translateY: 0 }] },
  }).duration(TWINS_MOVE_MS);
/** A blocked character leans towards the wall or the edge and comes back, in the time of a move. */
const BUMPS: Record<Direction, ReturnType<typeof bumpOf>> = { up: bumpOf(0, -BUMP_PX), right: bumpOf(BUMP_PX, 0), down: bumpOf(0, BUMP_PX), left: bumpOf(-BUMP_PX, 0) };

/** Engine events → sound / haptic names of the shared kit (src/feedback/feedback.ts). */
function feedbackOf(events: TwinsState['events']): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'move') out.push({ kind: 'move' });
    else if (e.kind === 'blocked') out.push({ kind: 'swap_back' });
    else if (e.kind === 'solved') out.push({ kind: 'lines' });
    else if (e.kind === 'failed') out.push({ kind: 'drop' });
    else if (e.kind === 'hint') out.push({ kind: 'button' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push({ kind: e.kind });
  }
  return out;
}

/** Direction of a swipe from its translation; null when too short. */
function swipeDirection(dx: number, dy: number): Direction | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/** The last bump: which character could not move, and which way it tried (`id` restarts the animation). */
type Bump = { id: number; a: Direction | null; b: Direction | null };
type PuzzleResult = { puzzle: number; points: number };
/** What the screen draws: the round, plus what it keeps of past events (ticks replace the engine's events). */
type Shown = { round: TwinsState; bump: Bump; last: PuzzleResult | null };

/** One engine transition and what the screen remembers of its events. A tick with nothing to wait for changes nothing. */
function advance(view: Shown, action: TwinsAction): Shown {
  if (view.round.status !== 'playing') return view;
  const round = reduceTwins(view.round, action);
  if (round === view.round) return view;
  let { bump, last } = view;
  for (const e of round.events) {
    if (e.kind === 'move' && !(e.a && e.b)) bump = { id: bump.id + 1, a: e.a ? null : e.direction, b: e.b ? null : e.direction };
    else if (e.kind === 'blocked') bump = { id: bump.id + 1, a: e.direction, b: e.direction };
    else if (e.kind === 'solved') last = { puzzle: e.puzzle, points: e.points };
    else if (e.kind === 'failed') last = { puzzle: e.puzzle, points: 0 };
  }
  return { round, bump, last };
}

export function TwinsGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();

  const [view, setView] = useState<Shown>(() => ({ round: createTwins(seed, upgradeLevels(save, 'twins')), bump: { id: 0, a: null, b: null }, last: null }));
  const [hintOwned] = useState(() => (upgradeLevels(save, 'twins').hint ?? 0) > 0);
  const { round: state, bump, last } = view;
  const stateRef = useRef(state);
  const steps = useMemo(() => [{ key: 'move', text: t.tutorial.twins.move }], [t]);
  const frame = useRoundFrame({ game: 'twins', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  // The grid: what is left of the screen under the HUD and above the arrows and the hint button.
  const cell = Math.max(28, Math.min(64, Math.floor(Math.min((width - 2 * spacing.md - 8) / TWINS_SIZE, (height - 440) / TWINS_SIZE))));
  const board = cell * TWINS_SIZE;

  // The reducer runs inside the state updater (no ref is read, so the swipe gesture can be built during render);
  // what follows a transition (tutorial, combos, end of the round) is done once it is drawn.
  const dispatch = useCallback((action: TwinsAction) => {
    setView((previous) => advance(previous, action));
  }, []);
  useEffect(() => {
    stateRef.current = state;
    if (state.events.some((e) => e.kind === 'move' || e.kind === 'blocked')) advanceTutorial('move');
    if (state.status === 'over') finish(state.score, state.combos);
    else setCombos(state.combos);
  }, [advanceTutorial, finish, setCombos, state]);

  // Frame loop of the engine counters (injectable clock): it runs only while a move animates or a finished puzzle
  // is shown, and stops with the pause.
  const waiting = !paused && state.status === 'playing' && !acceptsInput(state);
  useEffect(() => {
    if (!waiting) return;
    let lastTime = now();
    let handle = 0;
    const loop = () => {
      const time = now();
      const dt = Math.min(MAX_DT_MS, time - lastTime);
      lastTime = time;
      if (dt > 0) dispatch({ type: 'tick', dt });
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [dispatch, waiting]);

  const onMove = useCallback(
    (direction: Direction) => {
      if (paused) return;
      dispatch({ type: 'move', direction });
    },
    [dispatch, paused],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .withTestId('twins-pan')
        .runOnJS(true)
        .minDistance(4)
        .onEnd((e) => {
          const direction = swipeDirection(e.translationX, e.translationY);
          if (direction !== null) onMove(direction);
        }),
    [onMove],
  );

  const locked = paused || state.status !== 'playing';
  const hint = state.hint;
  const { a, b } = state.positions;
  const together = a === b;
  // Characters fill 60 % of a cell, exits 84 % (their outline stays visible around the character standing on them).
  const body = Math.round(cell * 0.6);
  const exit = Math.round(cell * 0.84);
  const line = Math.max(3, Math.round(cell * 0.09));
  // On the same cell the two characters are drawn side by side on a diagonal, so both shapes stay visible.
  const shift = together ? Math.round(cell * 0.12) : 0;
  const inset = (size: number) => (cell - size) / 2;

  const arrow = (direction: Direction, label: string) => {
    const hinted = hint === direction;
    return (
      <View testID={hinted ? `twins-hint-${direction}` : undefined} style={[styles.arrow, { borderColor: hinted ? colors.accent : PALETTE.transparent }]}>
        <Button label={label} onPress={() => onMove(direction)} disabled={locked} variant={hinted ? 'primary' : 'secondary'} compact testID={`twins-${direction}`} />
      </View>
    );
  };

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.puzzle}
        </PixelText>
        <PixelText testID="hud-puzzle">{t.hud.of(state.puzzle, TWINS_PUZZLES)}</PixelText>
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
    <GameFrame game="twins" frame={frame} score={state.score} hud={hud} testID="twins-screen">
      <View style={styles.column}>
        <GestureDetector gesture={pan}>
          <View testID="twins-board" style={[styles.board, { width: board + 4, height: board + 4, backgroundColor: colors.surface, borderColor: colors.border }]}>
            {Array.from({ length: TWINS_CELLS }, (_, i) => {
              const wall = state.board.walls.includes(i);
              return (
                // Walls, grid dots and invisible targets: Maestro reads `twins-cell-<col>-<row>`.
                <View
                  key={i}
                  testID={wall ? `twins-wall-${colOf(i)}-${rowOf(i)}` : `twins-cell-${colOf(i)}-${rowOf(i)}`}
                  pointerEvents="none"
                  style={[styles.cell, { left: colOf(i) * cell, top: rowOf(i) * cell, width: cell, height: cell }]}
                >
                  {wall ? <View style={[styles.wall, { backgroundColor: PALETTE.darkGrey, borderColor: PALETTE.outline }]} /> : <View style={[styles.dot, { backgroundColor: colors.border }]} />}
                </View>
              );
            })}
            {/* The exits: hollow shapes of the same shape and colour as their character. */}
            <View
              testID="twins-exit-a"
              accessibilityValue={{ text: `${colOf(state.board.exits.a)},${rowOf(state.board.exits.a)}` }}
              pointerEvents="none"
              style={[styles.piece, { left: colOf(state.board.exits.a) * cell + inset(exit), top: rowOf(state.board.exits.a) * cell + inset(exit), width: exit, height: exit, borderRadius: exit / 2, borderWidth: line, borderColor: PALETTE.blue }]}
            />
            <View
              testID="twins-exit-b"
              accessibilityValue={{ text: `${colOf(state.board.exits.b)},${rowOf(state.board.exits.b)}` }}
              pointerEvents="none"
              style={[styles.piece, { left: colOf(state.board.exits.b) * cell + inset(exit), top: rowOf(state.board.exits.b) * cell + inset(exit), width: exit, height: exit, borderRadius: 3, borderWidth: line, borderColor: PALETTE.orange }]}
            />
            {/* The orange square, then the blue round on top. */}
            <Animated.View
              key={`b-${state.puzzle}`}
              testID="twins-b"
              accessibilityValue={{ text: `${colOf(b)},${rowOf(b)}` }}
              layout={LinearTransition.duration(TWINS_MOVE_MS)}
              pointerEvents="none"
              style={[styles.piece, { left: colOf(b) * cell + inset(body) + shift, top: rowOf(b) * cell + inset(body) + shift, width: body, height: body }]}
            >
              <Animated.View key={bump.id} entering={bump.b ? BUMPS[bump.b] : undefined} style={[styles.body, styles.square, { backgroundColor: PALETTE.orange, borderColor: PALETTE.outline }]}>
                <View style={[styles.shine, styles.shineSquare]} />
              </Animated.View>
            </Animated.View>
            <Animated.View
              key={`a-${state.puzzle}`}
              testID="twins-a"
              accessibilityValue={{ text: `${colOf(a)},${rowOf(a)}` }}
              layout={LinearTransition.duration(TWINS_MOVE_MS)}
              pointerEvents="none"
              style={[styles.piece, { left: colOf(a) * cell + inset(body) - shift, top: rowOf(a) * cell + inset(body) - shift, width: body, height: body }]}
            >
              <Animated.View key={bump.id} entering={bump.a ? BUMPS[bump.a] : undefined} style={[styles.body, { borderRadius: body / 2, backgroundColor: PALETTE.blue, borderColor: PALETTE.outline }]}>
                <View style={[styles.shine, styles.shineRound]} />
              </Animated.View>
            </Animated.View>
          </View>
        </GestureDetector>

        <View style={styles.footer}>
          <View style={styles.result}>
            {last && (
              <Animated.View key={`last-${last.puzzle}`} entering={FadeInUp.duration(220)}>
                <PixelText testID="twins-last" color={last.points > 0 ? 'success' : 'danger'} bold>
                  {last.points > 0 ? `${t.play.solved} +${last.points}` : t.play.lost}
                </PixelText>
              </Animated.View>
            )}
          </View>
          {arrow('up', t.play.up)}
          <View style={styles.arrows}>
            {arrow('left', t.play.left)}
            {arrow('right', t.play.right)}
          </View>
          {arrow('down', t.play.down)}
          {hintOwned && (
            <Button
              label={t.play.hint(state.hintsLeft)}
              onPress={() => dispatch({ type: 'hint' })}
              disabled={locked || state.hintsLeft <= 0 || hint !== null || state.result !== null}
              variant="secondary"
              compact
              testID="twins-hint"
            />
          )}
        </View>
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.sm, alignSelf: 'stretch' },
  board: { borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  cell: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2 },
  wall: { position: 'absolute', left: 1, top: 1, right: 1, bottom: 1, borderWidth: 2, borderRadius: 3 },
  piece: { position: 'absolute' },
  body: { flex: 1, borderWidth: 2 },
  square: { borderRadius: 3 },
  shine: { position: 'absolute', backgroundColor: 'rgba(255, 255, 255, 0.4)', borderRadius: 2 },
  shineSquare: { left: 4, right: 4, top: 3, height: 3 },
  shineRound: { left: '28%', top: '16%', width: '30%', height: 3 },
  hudItem: { gap: 2 },
  result: { minHeight: 22, justifyContent: 'center' },
  arrows: { flexDirection: 'row', gap: spacing.md },
  arrow: { width: 124, borderWidth: 2, borderRadius: 10 },
  footer: { alignItems: 'center', gap: spacing.xs, alignSelf: 'stretch', paddingHorizontal: spacing.md },
});
