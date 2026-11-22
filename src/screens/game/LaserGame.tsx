// « Miroirs et Laser » screen: the laser engine (src/game/laser) on a 6 × 6 grid of Views; the mirrors are Pressable
// cells. Turn-based: a tap settles at once (HUD, score); the flipped mirror swings to its new lean (120 ms
// Reanimated keyframe, the engine ignores taps meanwhile) and the beam is drawn again cell by cell along `traceBeam`.
// The emitter is a block with a nozzle left of the entry row; the target is a diamond in its edge cell, lit when the
// beam reaches it. The « Indice » button (when the upgrade is owned) highlights a mirror of a shortest solution.
// A solved puzzle stays shown 800 ms (engine pause `solvedMs`) with its points above the board. A frame loop ticks
// the flip guard and the solved pause with the injectable clock; React re-renders only when the puzzle changes.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, Keyframe, ZoomIn } from 'react-native-reanimated';

import { PALETTE } from '../../art/palette';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { createLaser, LASER_CELLS, LASER_FLIP_MS, LASER_PUZZLES, LASER_SIZE, mirrorAt, reduceLaser, traceBeam } from '../../game/laser/engine';
import type { BeamStep, Dir, LaserAction, LaserState, Lean } from '../../game/laser/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { Button } from '../../ui/Button';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const MAX_DT_MS = 50;
/** A flipped mirror starts a quarter turn back (its previous lean) and swings into place. */
const SWING = new Keyframe({ 0: { transform: [{ rotate: '90deg' }] }, 100: { transform: [{ rotate: '0deg' }] } }).duration(LASER_FLIP_MS);
/** Rotation of the mirror bar (drawn flat): « / » rises to the right, « \ » falls to the right. */
const BAR_ANGLE: Record<Lean, string> = { slash: '-45deg', backslash: '45deg' };
const OPPOSITE: Record<Dir, Dir> = { E: 'W', W: 'E', N: 'S', S: 'N' };
const CELLS = Array.from({ length: LASER_CELLS }, (_, i) => i);

/** Engine events → sound / haptic names of the shared kit (src/feedback/feedback.ts). */
function feedbackOf(events: LaserState['events']): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'flip') out.push({ kind: 'rotate' });
    else if (e.kind === 'solved') out.push({ kind: 'lines' });
    else if (e.kind === 'failed') out.push({ kind: 'drop' });
    else if (e.kind === 'hint') out.push({ kind: 'button' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push({ kind: e.kind });
  }
  return out;
}

type Rect = { left: number; top: number; width: number; height: number };

/** Half a beam: from the centre of a cell of size `c` to one of its sides, for a beam of thickness `b`. */
function armRect(side: Dir, c: number, b: number): Rect {
  const a = (c - b) / 2;
  const long = (c + b) / 2;
  if (side === 'N') return { left: a, top: 0, width: b, height: long };
  if (side === 'S') return { left: a, top: a, width: b, height: long };
  if (side === 'W') return { left: 0, top: a, width: long, height: b };
  return { left: a, top: a, width: long, height: b };
}

/** The beam inside one cell: it comes in from the side opposite to its heading and leaves by its new heading. */
function BeamShape({ step, size }: { step: BeamStep; size: number }) {
  const thick = Math.max(4, Math.round(size * 0.14));
  const col = step.cell % LASER_SIZE;
  const row = Math.floor(step.cell / LASER_SIZE);
  return (
    <View testID={`laser-beam-${col}-${row}`} style={styles.layer} pointerEvents="none">
      <View style={[styles.abs, armRect(OPPOSITE[step.inDir], size, thick), { backgroundColor: PALETTE.red }]} />
      {step.outDir !== null && <View style={[styles.abs, armRect(step.outDir, size, thick), { backgroundColor: PALETTE.red }]} />}
    </View>
  );
}

/** The target: a diamond (a square on its corner) with a centre dot, lit when the beam reaches it. */
function TargetShape({ size, lit }: { size: number; lit: boolean }) {
  const side = Math.round(size * 0.52);
  const dot = Math.max(4, Math.round(side * 0.3));
  return (
    <View testID="laser-target" accessibilityValue={{ text: lit ? 'lit' : 'dark' }} style={[styles.layer, styles.centre]} pointerEvents="none">
      <View style={[styles.centre, { width: side, height: side, borderWidth: 3, borderColor: PALETTE.outline, backgroundColor: lit ? PALETTE.yellow : PALETTE.grey, transform: [{ rotate: '45deg' }] }]}>
        <View style={{ width: dot, height: dot, backgroundColor: lit ? PALETTE.red : PALETTE.outline }} />
      </View>
    </View>
  );
}

function MirrorShape({ lean, size }: { lean: Lean; size: number }) {
  const thick = Math.max(6, Math.round(size * 0.16));
  return (
    <View style={[styles.layer, styles.centre]} pointerEvents="none">
      <View style={{ width: Math.round(size * 1.1), height: thick, borderWidth: 2, borderColor: PALETTE.outline, backgroundColor: PALETTE.sky, transform: [{ rotate: BAR_ANGLE[lean] }] }} />
    </View>
  );
}

type PuzzleResult = { puzzle: number; points: number };

export function LaserGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const cell = Math.min(64, Math.floor(Math.min((width - 2 * spacing.md) / (LASER_SIZE + 1), (height - 340) / LASER_SIZE)));
  const gutter = Math.floor(cell / 2);

  // The upgrade levels of the round are read once, when it starts.
  const [hintLevel] = useState(() => upgradeLevels(save, 'laser').hint ?? 0);
  const [state, setState] = useState(() => createLaser(seed, { hint: hintLevel }));
  const stateRef = useRef(state);
  const [last, setLast] = useState<PuzzleResult | null>(null);
  const steps = useMemo(() => [{ key: 'flip', text: t.tutorial.laser.flip }], [t]);
  const frame = useRoundFrame({ game: 'laser', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);
  // The beam is traced again from the leans after each flip.
  const beam = useMemo(() => traceBeam(state.board, state.leans), [state.board, state.leans]);

  const dispatch = useCallback(
    (action: LaserAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceLaser(previous, action);
      stateRef.current = next;
      // A tick only counts the flip and the solved pause down: it re-renders when the puzzle changes or the round ends.
      const redraw = action.type !== 'tick' || next.puzzle !== previous.puzzle || next.status !== previous.status;
      if (redraw) setState(next);
      for (const e of next.events) {
        if (e.kind === 'solved') setLast({ puzzle: e.puzzle, points: e.points });
        else if (e.kind === 'failed') setLast({ puzzle: e.puzzle, points: 0 });
      }
      if (action.type === 'flip') advanceTutorial('flip');
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [advanceTutorial, finish, setCombos],
  );

  // The flip guard (120 ms) and the solved pause (800 ms) are ticked with the injectable clock; the loop reads
  // dispatch through a ref, so it never restarts when a callback changes identity.
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
      if (dt > 0 && (stateRef.current.flipMs > 0 || stateRef.current.solvedMs > 0)) dispatchRef.current({ type: 'tick', dt });
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [running]);

  const solvedShown = state.solvedMs > 0;
  const locked = paused || state.status !== 'playing' || solvedShown;
  const boardPx = LASER_SIZE * cell + 4;
  const nozzle = Math.max(6, Math.round(cell * 0.3));

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.puzzle}
        </PixelText>
        <PixelText testID="hud-puzzle">{t.hud.of(state.puzzle, LASER_PUZZLES)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.flips}
        </PixelText>
        <PixelText testID="hud-flips">{String(state.flips)}</PixelText>
      </View>
    </>
  );

  return (
    <GameFrame game="laser" frame={frame} score={state.score} hud={hud} testID="laser-screen">
      <View style={styles.column}>
        <Animated.View key={`puzzle-${state.puzzle}`} entering={FadeIn.duration(250)} style={styles.row}>
          {/* Emitter: a block left of the entry row, its red nozzle against the board. */}
          <View style={{ width: gutter, height: boardPx }}>
            <View
              testID="laser-emitter"
              style={[styles.abs, { left: 0, width: gutter, top: 2 + state.board.entryRow * cell + (cell - nozzle * 2) / 2, height: nozzle * 2, backgroundColor: PALETTE.darkGrey, borderColor: PALETTE.outline, borderWidth: 3 }]}
            />
            <View style={[styles.abs, { right: 0, width: Math.ceil(gutter / 2), top: 2 + state.board.entryRow * cell + (cell - nozzle) / 2, height: nozzle, backgroundColor: PALETTE.red }]} />
          </View>
          <View testID="laser-board" style={[styles.board, { width: boardPx, backgroundColor: colors.surface, borderColor: colors.border }]}>
            {CELLS.map((i) => {
              const col = i % LASER_SIZE;
              const row = Math.floor(i / LASER_SIZE);
              const mirror = mirrorAt(state.board, i);
              const hinted = mirror >= 0 && state.hint === mirror;
              const border = hinted ? 3 : 0.5;
              const inner = cell - 2 * border;
              const cellStyle = [styles.cell, { width: cell, height: cell, borderColor: hinted ? colors.accent : colors.border, borderWidth: border }];
              const content = (
                <>
                  {beam.steps.map((step, s) => (step.cell === i ? <BeamShape key={s} step={step} size={inner} /> : null))}
                  {state.board.target === i && <TargetShape size={inner} lit={beam.reached} />}
                </>
              );
              if (mirror < 0) {
                return (
                  <View key={i} testID={`laser-cell-${col}-${row}`} style={cellStyle}>
                    {content}
                  </View>
                );
              }
              const lean = state.leans[mirror];
              return (
                <Pressable
                  key={i}
                  testID={`laser-mirror-${col}-${row}`}
                  accessibilityRole="button"
                  accessibilityValue={{ text: lean }}
                  disabled={locked}
                  onPress={() => dispatch({ type: 'flip', mirror })}
                  style={cellStyle}
                >
                  {content}
                  {/* The mirror swings into place only when it was flipped (not when a new puzzle comes in). */}
                  <Animated.View key={`${i}-${lean}`} entering={state.flips > 0 ? SWING : undefined} style={styles.layer} pointerEvents="none">
                    <MirrorShape lean={lean} size={inner} />
                  </Animated.View>
                </Pressable>
              );
            })}
          </View>
          <View style={{ width: gutter, height: boardPx }} />
          {/* The puzzle points pop above the solved puzzle while its beam stays on the target. */}
          {solvedShown && last && (
            <View style={[styles.abs, styles.popLayer]} pointerEvents="none">
              <Animated.View key={`pop-${last.puzzle}`} entering={ZoomIn.duration(250)} style={[styles.pop, { borderColor: PALETTE.outline }]}>
                <PixelText testID="laser-points" size={18} bold style={{ color: PALETTE.outline }}>
                  {`+${last.points}`}
                </PixelText>
              </Animated.View>
            </View>
          )}
        </Animated.View>

        <View style={styles.footer}>
          {last && (
            <Animated.View key={`last-${last.puzzle}`} entering={FadeInUp.duration(220)}>
              <PixelText testID="laser-last" color={last.points > 0 ? 'success' : 'danger'} bold>
                {last.points > 0 ? `${t.play.solved} +${last.points}` : t.play.lost}
              </PixelText>
            </Animated.View>
          )}
          {hintLevel > 0 && (
            <Button label={t.play.hint(state.hintsLeft)} onPress={() => dispatch({ type: 'hint' })} disabled={locked || state.hintsLeft <= 0 || state.hint !== null} variant="secondary" compact testID="laser-hint" />
          )}
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
  abs: { position: 'absolute' },
  layer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  popLayer: { left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pop: { backgroundColor: PALETTE.yellow, borderWidth: 3, borderRadius: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  hudItem: { gap: 2 },
  footer: { alignItems: 'center', gap: spacing.sm, minHeight: 90, alignSelf: 'stretch', paddingHorizontal: spacing.md },
});
