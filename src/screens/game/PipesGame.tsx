// « Plombier Express » screen: the pipe engine (src/game/pipes) on a 5 × 5 grid of Pressable cells. Turn-based: a
// tap settles at once (HUD, score); the turned piece replays its quarter turn (200 ms Reanimated keyframe) and the
// pieces connected to the entry are drawn filled with water. The water enters on the left of the entry row and
// leaves on the right of the exit row. The « Indice » button highlights a path cell that is not yet turned right.
// A solved grid stays shown 1 s (engine pause `solvedMs`, AC-88): the water runs from the entry through the connected
// pieces in path order and the grid points pop above the board; a frame loop ticks the engine with the injectable
// clock only during that pause, and React re-renders only when the water front moves or the grid changes.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, Keyframe, ZoomIn } from 'react-native-reanimated';

import { PALETTE } from '../../art/palette';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { createPipes, E, filledCells, N, PieceKind, PIPES_GRIDS, PIPES_SIZE, PipesAction, PipesState, reducePipes, S, W, waterFront } from '../../game/pipes/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { Button } from '../../ui/Button';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const TURN_MS = 200;
const MAX_DT_MS = 50;
/** A tapped piece starts a quarter turn back and turns into place. */
const SPIN = new Keyframe({ 0: { transform: [{ rotate: '-90deg' }] }, 100: { transform: [{ rotate: '0deg' }] } }).duration(TURN_MS);
/** Openings of each piece before its rotation (the View is then rotated by rot × 90°). */
const BASE_OPENINGS: Record<PieceKind, number> = { straight: E | W, elbow: N | E };

/** Engine events → sound / haptic names of the shared kit (src/feedback/feedback.ts). */
function feedbackOf(events: PipesState['events']): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'turn') out.push({ kind: 'rotate' });
    else if (e.kind === 'solved') out.push({ kind: 'lines' });
    else if (e.kind === 'failed') out.push({ kind: 'drop' });
    else if (e.kind === 'hint') out.push({ kind: 'button' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push({ kind: e.kind });
  }
  return out;
}

type Rect = { left: number; top: number; width: number; height: number };

/** Centre square and one arm per opening, for a pipe of thickness `t` in a cell of size `c`. */
function pipeRects(mask: number, c: number, t: number): Rect[] {
  const a = (c - t) / 2;
  const b = (c + t) / 2;
  const rects: Rect[] = [{ left: a, top: a, width: t, height: t }];
  if (mask & N) rects.push({ left: a, top: 0, width: t, height: b });
  if (mask & E) rects.push({ left: a, top: a, width: b, height: t });
  if (mask & S) rects.push({ left: a, top: a, width: t, height: b });
  if (mask & W) rects.push({ left: 0, top: a, width: b, height: t });
  return rects;
}

function PipeShape({ kind, size, water }: { kind: PieceKind; size: number; water: boolean }) {
  const thick = Math.max(6, Math.round(size * 0.34));
  const outline = pipeRects(BASE_OPENINGS[kind], size, thick + 6);
  const fill = pipeRects(BASE_OPENINGS[kind], size, thick);
  return (
    <>
      {outline.map((r, i) => (
        <View key={`o${i}`} style={[styles.abs, r, { backgroundColor: PALETTE.outline }]} />
      ))}
      {fill.map((r, i) => (
        <View key={`f${i}`} style={[styles.abs, r, { backgroundColor: water ? PALETTE.sky : PALETTE.grey }]} />
      ))}
    </>
  );
}

type GridResult = { grid: number; points: number };

export function PipesGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const cell = Math.min(80, Math.floor(Math.min((width - 2 * spacing.md) / (PIPES_SIZE + 1), (height - 340) / PIPES_SIZE)));
  const gutter = Math.floor(cell / 2);

  const [state, setState] = useState(() => createPipes(seed, upgradeLevels(save, 'pipes')));
  const stateRef = useRef(state);
  const [last, setLast] = useState<GridResult | null>(null);
  const steps = useMemo(() => [{ key: 'turn', text: t.tutorial.pipes.turn }], [t]);
  const frame = useRoundFrame({ game: 'pipes', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);
  const water = useMemo(() => filledCells(state), [state]);

  const dispatch = useCallback(
    (action: PipesAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reducePipes(previous, action);
      stateRef.current = next;
      // A tick of the solved pause only re-renders when the water moves one step, the grid changes or the round ends.
      const redraw = action.type !== 'tick' || next.grid !== previous.grid || next.status !== previous.status || waterFront(next) !== waterFront(previous);
      if (redraw) setState(next);
      for (const e of next.events) {
        if (e.kind === 'solved') setLast({ grid: e.grid, points: e.points });
        else if (e.kind === 'failed') setLast({ grid: e.grid, points: 0 });
      }
      if (action.type === 'tap') advanceTutorial('turn');
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [advanceTutorial, finish, setCombos],
  );

  // Frame loop of the solved pause (1 s): reads the injectable clock, keeps dispatch in a ref so that a new callback
  // identity never restarts it.
  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);
  const showing = active && state.solvedMs > 0;
  useEffect(() => {
    if (!showing) return;
    let last = now();
    let handle = 0;
    const loop = () => {
      const time = now();
      const dt = Math.min(MAX_DT_MS, time - last);
      last = time;
      if (dt > 0) dispatchRef.current({ type: 'tick', dt });
      if (stateRef.current.solvedMs > 0 && stateRef.current.status === 'playing') handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [showing]);

  const solvedShown = state.solvedMs > 0;
  const locked = paused || state.status !== 'playing' || solvedShown;
  const stub = Math.max(6, Math.round(cell * 0.34));

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.grid}
        </PixelText>
        <PixelText testID="hud-grid">{t.hud.of(state.grid, PIPES_GRIDS)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.taps}
        </PixelText>
        <PixelText testID="hud-taps">{String(state.taps)}</PixelText>
      </View>
    </>
  );

  return (
    <GameFrame game="pipes" frame={frame} score={state.score} hud={hud} testID="pipes-screen">
      <View style={styles.column}>
        <Animated.View key={`grid-${state.grid}`} entering={FadeIn.duration(250)} style={styles.row}>
          {/* Entry: the water comes in from the left of the entry row. */}
          <View style={{ width: gutter, height: PIPES_SIZE * cell + 4 }}>
            <View testID="pipes-entry" style={[styles.abs, { left: 0, width: gutter, top: 2 + state.entryRow * cell + (cell - stub) / 2, height: stub, backgroundColor: PALETTE.sky, borderColor: PALETTE.outline, borderWidth: 3 }]} />
          </View>
          <View testID="pipes-board" style={[styles.board, { width: PIPES_SIZE * cell + 4, backgroundColor: colors.surface, borderColor: colors.border }]}>
            {state.pieces.map((piece, i) => {
              const col = i % PIPES_SIZE;
              const row = Math.floor(i / PIPES_SIZE);
              const hinted = state.hint === i;
              const turns = state.turns[i];
              return (
                <Pressable
                  key={i}
                  testID={`pipes-cell-${col}-${row}`}
                  accessibilityRole="button"
                  accessibilityValue={{ text: water[i] ? 'water' : 'empty' }}
                  disabled={locked}
                  onPress={() => dispatch({ type: 'tap', cell: i })}
                  style={[styles.cell, { width: cell, height: cell, borderColor: hinted ? colors.accent : colors.border, borderWidth: hinted ? 3 : 0.5 }]}
                >
                  <Animated.View key={`${i}-${turns}`} entering={turns > 0 ? SPIN : undefined} style={styles.fill} pointerEvents="none">
                    <View testID={`pipes-piece-${col}-${row}`} style={[styles.fill, { transform: [{ rotate: `${piece.rot * 90}deg` }] }]}>
                      <PipeShape kind={piece.kind} size={cell - (hinted ? 6 : 1)} water={water[i]} />
                    </View>
                  </Animated.View>
                </Pressable>
              );
            })}
          </View>
          {/* Exit: the drain on the right of the exit row. */}
          <View style={{ width: gutter, height: PIPES_SIZE * cell + 4 }}>
            <View testID="pipes-exit" style={[styles.abs, { right: 0, width: gutter, top: 2 + state.exitRow * cell + (cell - stub) / 2, height: stub, backgroundColor: water[state.exitRow * PIPES_SIZE + PIPES_SIZE - 1] && solvedShown ? PALETTE.sky : PALETTE.grey, borderColor: PALETTE.outline, borderWidth: 3 }]} />
          </View>
          {/* The grid points pop above the solved grid while its water runs. */}
          {solvedShown && last && (
            <View style={[styles.abs, styles.popLayer]} pointerEvents="none">
              <Animated.View key={`pop-${last.grid}`} entering={ZoomIn.duration(250)} style={[styles.pop, { borderColor: PALETTE.outline }]}>
                <PixelText testID="pipes-points" size={18} bold style={{ color: PALETTE.outline }}>
                  {`+${last.points}`}
                </PixelText>
              </Animated.View>
            </View>
          )}
        </Animated.View>

        <View style={styles.footer}>
          {last && (
            <Animated.View key={`last-${last.grid}`} entering={FadeInUp.duration(220)}>
              <PixelText testID="pipes-last" color={last.points > 0 ? 'success' : 'danger'} bold>
                {last.points > 0 ? `+${last.points}` : '0'}
              </PixelText>
            </Animated.View>
          )}
          <Button label={t.play.hint(state.hintsLeft)} onPress={() => dispatch({ type: 'hint' })} disabled={locked || state.hintsLeft <= 0 || state.hint !== null} variant="secondary" compact testID="pipes-btn-hint" />
        </View>
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  board: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  cell: { overflow: 'hidden' },
  fill: { flex: 1 },
  abs: { position: 'absolute' },
  popLayer: { left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pop: { backgroundColor: PALETTE.yellow, borderWidth: 3, borderRadius: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  hudItem: { gap: 2 },
  footer: { alignItems: 'center', gap: spacing.sm, minHeight: 90, alignSelf: 'stretch', paddingHorizontal: spacing.md },
});
