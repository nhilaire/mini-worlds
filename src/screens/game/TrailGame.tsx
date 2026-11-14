// « Fil d'Ariane » screen: the trail engine (src/game/trail) on a 6 × 6 grid of Pressable cells. A tap next to the
// head extends the trail, a tap on the head steps back; the trail is drawn as a golden line through the cell centres
// (one bar per step, the new one fades in in 120 ms) over the start flag, the exit door, the gems and the rocks.
// The engine's 150 ms guard between taps is ticked by a requestAnimationFrame loop on the injectable clock that never
// re-renders React. « Indice » outlines the next cell of the seeded path, or the head when the trail left it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

import { EXIT, GEM, ROCK, START } from '../../art/games/trail';
import { PALETTE } from '../../art/palette';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { colOf, createTrail, gemsOnTrail, reduceTrail, rowOf, TRAIL_GRIDS, TRAIL_SIZE, TrailAction, TrailState } from '../../game/trail/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { Button } from '../../ui/Button';
import { PixelSprite } from '../../ui/PixelSprite';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const SPRITE_PIXELS = 10;
const MAX_DT_MS = 100;
const STEP_MS = 120;

/** Engine events → sound / haptic names of the shared kit (src/feedback/feedback.ts). */
function feedbackOf(events: TrailState['events']): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'extend') out.push({ kind: e.gem ? 'lock' : 'move' });
    else if (e.kind === 'back') out.push({ kind: 'move' });
    else if (e.kind === 'exit') out.push({ kind: 'lines' });
    else if (e.kind === 'hint') out.push({ kind: 'button' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push({ kind: e.kind });
  }
  return out;
}

type GridResult = { grid: number; points: number };

export function TrailGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const cell = Math.min(64, Math.floor(Math.min((width - 2 * spacing.md) / TRAIL_SIZE, (height - 340) / TRAIL_SIZE)));
  const spriteScale = Math.max(1, Math.floor((cell - 10) / SPRITE_PIXELS));
  const line = Math.max(4, Math.round(cell * 0.18));

  const [state, setState] = useState(() => createTrail(seed, upgradeLevels(save, 'trail')));
  const stateRef = useRef(state);
  const [last, setLast] = useState<GridResult | null>(null);
  const steps = useMemo(() => [{ key: 'step', text: t.tutorial.trail.step }], [t]);
  const frame = useRoundFrame({ game: 'trail', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  const dispatch = useCallback(
    (action: TrailAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceTrail(previous, action);
      stateRef.current = next;
      // Ticks only count the guard down (nothing drawn changes): no re-render for them.
      if (action.type === 'tick') return;
      setState(next);
      for (const e of next.events) if (e.kind === 'exit') setLast({ grid: e.grid, points: e.points });
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [finish, setCombos],
  );

  // The tap guard is ticked with the injectable clock; the loop reads dispatch through a ref, so it never restarts
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
      if (dt > 0 && stateRef.current.guardMs > 0) dispatchRef.current({ type: 'tick', dt });
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [running]);

  const onTap = useCallback(
    (cellIndex: number) => {
      if (paused) return;
      advanceTutorial('step');
      dispatch({ type: 'tap', cell: cellIndex });
    },
    [advanceTutorial, dispatch, paused],
  );

  const locked = paused || state.status !== 'playing';
  const { trail, gems, rocks, start, exit, hint } = state;
  const head = trail[trail.length - 1];
  const collected = gemsOnTrail(state);
  const centre = (c: number) => ({ x: colOf(c) * cell + cell / 2, y: rowOf(c) * cell + cell / 2 });

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.grid}
        </PixelText>
        <PixelText testID="hud-grid">{t.hud.of(state.grid, TRAIL_GRIDS)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.gems}
        </PixelText>
        <PixelText testID="hud-gems">{t.hud.of(collected, gems.length)}</PixelText>
      </View>
    </>
  );

  return (
    <GameFrame game="trail" frame={frame} score={state.score} hud={hud} testID="trail-screen">
      <View style={styles.column}>
        <View testID="trail-board" style={[styles.board, { width: TRAIL_SIZE * cell + 4, height: TRAIL_SIZE * cell + 4, backgroundColor: colors.surface, borderColor: colors.border }]}>
          {Array.from({ length: TRAIL_SIZE * TRAIL_SIZE }, (_, i) => {
            const hinted = hint === i;
            const sprite = rocks.includes(i) ? ROCK : i === start ? START : i === exit ? EXIT : gems.includes(i) ? GEM : null;
            return (
              <Pressable
                key={`${state.grid}-${i}`}
                testID={`trail-cell-${colOf(i)}-${rowOf(i)}`}
                accessibilityRole="button"
                disabled={locked}
                onPress={() => onTap(i)}
                style={({ pressed }) => [
                  styles.cell,
                  { left: colOf(i) * cell, top: rowOf(i) * cell, width: cell, height: cell, borderColor: hinted ? colors.accent : colors.border, borderWidth: hinted ? 4 : 1 },
                  pressed && { backgroundColor: colors.surfaceAlt },
                ]}
              >
                {sprite && (
                  <View testID={sprite === GEM ? `trail-gem-${colOf(i)}-${rowOf(i)}` : sprite === ROCK ? `trail-rock-${colOf(i)}-${rowOf(i)}` : undefined} style={trail.includes(i) && sprite === GEM ? styles.taken : undefined}>
                    <PixelSprite sprite={sprite} scale={spriteScale} />
                  </View>
                )}
              </Pressable>
            );
          })}
          {/* The trail: one bar from each cell centre to the next (orthogonal steps), then a knot on the head. */}
          {trail.slice(1).map((c, i) => {
            const a = centre(trail[i]);
            const b = centre(c);
            return (
              <Animated.View
                key={`${state.grid}-seg-${i}-${c}`}
                testID={`trail-seg-${i}`}
                entering={FadeIn.duration(STEP_MS)}
                pointerEvents="none"
                style={[
                  styles.segment,
                  {
                    left: Math.min(a.x, b.x) - line / 2,
                    top: Math.min(a.y, b.y) - line / 2,
                    width: Math.abs(a.x - b.x) + line,
                    height: Math.abs(a.y - b.y) + line,
                    borderRadius: line / 2,
                    backgroundColor: PALETTE.yellow,
                  },
                ]}
              />
            );
          })}
          <View
            testID="trail-head"
            pointerEvents="none"
            style={[styles.head, { left: centre(head).x - line, top: centre(head).y - line, width: 2 * line, height: 2 * line, borderRadius: line, backgroundColor: PALETTE.darkYellow, borderColor: PALETTE.outline }]}
          />
        </View>

        <View style={styles.footer}>
          {last && (
            <Animated.View key={`last-${last.grid}`} entering={FadeInUp.duration(220)}>
              <PixelText testID="trail-last" color={last.points > 0 ? 'success' : 'danger'} bold>
                {last.points > 0 ? `+${last.points}` : '0'}
              </PixelText>
            </Animated.View>
          )}
          <Button label={t.play.hint(state.hintsLeft)} onPress={() => dispatch({ type: 'hint' })} disabled={locked || state.hintsLeft <= 0 || hint !== null} variant="secondary" compact testID="trail-btn-hint" />
        </View>
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.md },
  board: { borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  cell: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  taken: { opacity: 0.45 },
  segment: { position: 'absolute' },
  head: { position: 'absolute', borderWidth: 2 },
  hudItem: { gap: 2 },
  footer: { alignItems: 'center', gap: spacing.sm, minHeight: 90, alignSelf: 'stretch', paddingHorizontal: spacing.md },
});
