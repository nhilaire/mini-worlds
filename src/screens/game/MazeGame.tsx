// « Labyrinthe Express » screen: the maze drawn once per maze as plain wall Views, the exit flag and the explorer.
// A swipe anywhere on the maze sends the explorer running (engine run at 12 cells/s, swipes ignored meanwhile). The
// frame loop ticks the engine with the injectable clock; the explorer moves through an Animated value (no React
// render per frame); React re-renders only when the HUD (seconds, score, maze) or the maze itself changes.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { PALETTE } from '../../art/palette';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { bit, createMaze, Dir, explorerAt, MazeAction, MazeEvent, MazeState, reduceMaze, secondsLeft } from '../../game/maze/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const MAX_DT_MS = 50;
/** Shortest finger travel read as a swipe (px). */
export const SWIPE_PX = 16;

/** Engine events → feedback kinds of the shared kit. */
function feedbackOf(events: readonly MazeEvent[]): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'run') out.push({ kind: 'move' });
    else if (e.kind === 'blocked') out.push({ kind: 'swap_back' });
    else if (e.kind === 'exit') out.push({ kind: 'lines' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push(e);
  }
  return out;
}

/** Direction of a swipe from its translation; null when too short. */
export function swipeDir(dx: number, dy: number): Dir | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 1 : 3;
  return dy > 0 ? 2 : 0;
}

/** What React draws besides the explorer: re-render only when this changes. */
function shownKey(s: MazeState): string {
  return `${s.maze}|${s.score}|${secondsLeft(s)}|${s.status}`;
}

type Wall = { left: number; top: number; width: number; height: number };

/** Walls of a maze as rectangles (top and left borders, then the east and south side of every closed cell). */
function wallsOf(open: readonly number[], size: number, cell: number): Wall[] {
  const w = Math.max(2, Math.round(cell * 0.14));
  const walls: Wall[] = [
    { left: 0, top: 0, width: size * cell, height: w },
    { left: 0, top: 0, width: w, height: size * cell },
  ];
  for (let i = 0; i < open.length; i++) {
    const x = i % size;
    const y = Math.floor(i / size);
    if (!(open[i] & bit(1))) walls.push({ left: (x + 1) * cell - w, top: y * cell, width: w, height: cell + (y === size - 1 ? 0 : w) });
    if (!(open[i] & bit(2))) walls.push({ left: x * cell, top: (y + 1) * cell - w, width: cell + (x === size - 1 ? 0 : w), height: w });
  }
  return walls;
}

function MazeWalls({ open, size, cell, color }: { open: readonly number[]; size: number; cell: number; color: string }) {
  const walls = useMemo(() => wallsOf(open, size, cell), [open, size, cell]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {walls.map((r, i) => (
        <View key={i} style={[r, styles.wall, { backgroundColor: color }]} />
      ))}
    </View>
  );
}

export function MazeGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();

  const [state, setState] = useState(() => createMaze(seed, upgradeLevels(save, 'maze')));
  const stateRef = useRef(state);
  const boardSide = Math.max(160, Math.floor(Math.min(width - 2 * spacing.md, height - 260)));
  const cell = Math.floor(boardSide / state.size);
  const cellRef = useRef(cell);
  useEffect(() => {
    cellRef.current = cell;
  }, [cell]);
  const dot = Math.max(6, Math.round(cell * 0.6));
  const [explorer] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));

  const steps = useMemo(() => [{ key: 'run', text: t.tutorial.maze.run }], [t]);
  const frame = useRoundFrame({ game: 'maze', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  const dispatch = useCallback(
    (action: MazeAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceMaze(previous, action);
      stateRef.current = next;
      if (next.run !== previous.run || next.pos !== previous.pos || next.maze !== previous.maze) {
        const at = explorerAt(next);
        explorer.setValue({ x: at.x * cellRef.current, y: at.y * cellRef.current });
      }
      // Sounds need the events of swipes; ticks re-render only when the HUD or the maze changes.
      if (action.type === 'swipe' || shownKey(next) !== shownKey(previous)) setState(next);
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [explorer, finish, setCombos],
  );
  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  // Frame loop: ticks the engine (round timer, run animation) while the round is active. It reads dispatch through a
  // ref, so a new callback identity never restarts it (phone test of v0.2.0).
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

  // A new cell size (rotation, new maze) puts the explorer back on its cell.
  useEffect(() => {
    const at = explorerAt(stateRef.current);
    explorer.setValue({ x: at.x * cell, y: at.y * cell });
  }, [cell, explorer, state.maze]);

  const onSwipe = useCallback(
    (dir: Dir) => {
      if (paused || stateRef.current.status !== 'playing') return;
      dispatch({ type: 'swipe', dir });
      advanceTutorial('run');
    },
    [advanceTutorial, dispatch, paused],
  );

  /* eslint-disable react-hooks/refs -- the gesture callbacks run on touch events, never during render */
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .withTestId('maze-pan')
        .runOnJS(true)
        .minDistance(4)
        .onEnd((e) => {
          const dir = swipeDir(e.translationX, e.translationY);
          if (dir !== null) onSwipe(dir);
        }),
    [onSwipe],
  );
  /* eslint-enable react-hooks/refs */

  const exitX = (state.exit % state.size) * cell;
  const exitY = Math.floor(state.exit / state.size) * cell;
  const board = state.size * cell;

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
          {t.hud.maze}
        </PixelText>
        <PixelText testID="hud-maze">{String(state.maze)}</PixelText>
      </View>
    </>
  );

  return (
    <GameFrame game="maze" frame={frame} score={state.score} hud={hud} testID="maze-screen">
      <GestureDetector gesture={pan}>
        <View testID="maze-board" style={[styles.area, { width: boardSide + 2 * spacing.md, height: boardSide + 2 * spacing.md }]}>
          <View style={[styles.board, { width: board, height: board, backgroundColor: colors.surface }]}>
            <View pointerEvents="none" style={[styles.exit, { left: exitX + cell * 0.15, top: exitY + cell * 0.15, width: cell * 0.7, height: cell * 0.7 }]} testID="maze-exit" />
            <MazeWalls key={state.maze} open={state.open} size={state.size} cell={cell} color={PALETTE.darkGreen} />
            <Animated.View
              pointerEvents="none"
              testID="maze-explorer"
              style={[styles.explorer, { width: dot, height: dot, borderRadius: dot / 2, left: (cell - dot) / 2, top: (cell - dot) / 2, transform: explorer.getTranslateTransform() }]}
            />
          </View>
        </View>
      </GestureDetector>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  area: { alignItems: 'center', justifyContent: 'center' },
  board: { overflow: 'hidden' },
  wall: { position: 'absolute' },
  exit: { position: 'absolute', backgroundColor: PALETTE.yellow, borderWidth: 2, borderColor: PALETTE.darkYellow, borderRadius: 2 },
  explorer: { position: 'absolute', backgroundColor: PALETTE.red, borderWidth: 2, borderColor: PALETTE.outline },
  hudItem: { gap: 2 },
});
