// « Fruits en Fusion » screen: the pure engine (src/game/fruit) on a 6 × 8 grid of plain views; each column is one
// Pressable (a tap drops the next fruit there). Turn-based: a drop settles at once in the engine; the fruits that
// changed zoom in for 300 ms, the engine's input guard (ticked by the injectable clock in a frame loop that never
// re-renders React) ignores taps meanwhile. HUD: fruits left of the 40 and the next fruit; « Coup de balai » clears the bottom row.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { FRUITS } from '../../art/games/fruit';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { cellOf, createFruit, FRUIT_COLS, FRUIT_GUARD_MS, FRUIT_ROWS, FruitAction, FruitState, reduceFruit } from '../../game/fruit/engine';
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
const MAX_DT_MS = 50;
const TUTORIAL = [{ key: 'drop' }] as const;

/** Engine events → sound / haptic names of the shared kit (src/feedback/feedback.ts). */
function feedbackOf(events: FruitState['events']): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'drop') out.push({ kind: 'drop' });
    else if (e.kind === 'merge') out.push({ kind: 'match' });
    else if (e.kind === 'vanish') out.push({ kind: 'cascade' });
    else if (e.kind === 'sweep') out.push({ kind: 'lines' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push({ kind: e.kind });
  }
  return out;
}

/** What React draws: the engine state and the cells that changed with the last move (they zoom in). */
type Shown = { game: FruitState; changed: readonly boolean[] };

export function FruitGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const cell = Math.max(28, Math.min(60, Math.floor(Math.min((width - 2 * spacing.md - 8) / FRUIT_COLS, (height - 360) / FRUIT_ROWS))));
  const spriteScale = Math.max(1, Math.floor((cell - 6) / SPRITE_PIXELS));

  const [view, setView] = useState<Shown>(() => {
    const game = createFruit(seed, upgradeLevels(save, 'fruit'));
    return { game, changed: game.cells.map(() => false) };
  });
  const state = view.game;
  const stateRef = useRef(state);
  const steps = useMemo(() => TUTORIAL.map((s) => ({ key: s.key, text: t.tutorial.fruit[s.key] })), [t]);
  const frame = useRoundFrame({ game: 'fruit', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  const dispatch = useCallback(
    (action: FruitAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceFruit(previous, action);
      stateRef.current = next;
      // Ticks only count the guard down: React re-renders when the board, the score or the round changes.
      if (action.type !== 'tick' && next.cells !== previous.cells) {
        setView({ game: next, changed: next.cells.map((v, i) => v !== null && v !== previous.cells[i]) });
      }
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [finish, setCombos],
  );
  // The frame loop reads the latest dispatch through a ref: a new callback identity never restarts it.
  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  // Frame loop: counts the input guard down with the injectable clock while the round is active.
  useEffect(() => {
    if (!active) return;
    let last = now();
    let handle = 0;
    const loop = () => {
      const time = now();
      const dt = Math.min(MAX_DT_MS, time - last);
      last = time;
      if (dt > 0 && stateRef.current.busyMs > 0) dispatchRef.current({ type: 'tick', dt });
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [active]);

  const onColumn = useCallback(
    (col: number) => {
      if (paused || stateRef.current.status !== 'playing') return;
      dispatch({ type: 'drop', col });
      advanceTutorial('drop');
    },
    [advanceTutorial, dispatch, paused],
  );

  const locked = paused || state.status !== 'playing';

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.moves}
        </PixelText>
        <PixelText testID="hud-fruits">{String(state.fruitsLeft)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.next}
        </PixelText>
        <View testID="hud-next" accessibilityLabel={String(state.next)}>
          <PixelSprite sprite={FRUITS[state.next]} scale={2} />
        </View>
      </View>
    </>
  );

  return (
    <GameFrame game="fruit" frame={frame} score={state.score} hud={hud} testID="fruit-screen">
      <View style={styles.column}>
        <View testID="fruit-board" style={[styles.board, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {Array.from({ length: FRUIT_COLS }, (_, col) => (
            <Pressable
              key={col}
              testID={`fruit-col-${col}`}
              accessibilityRole="button"
              disabled={locked}
              onPress={() => onColumn(col)}
              style={({ pressed }) => [styles.col, { borderColor: colors.border }, pressed && { backgroundColor: colors.surfaceAlt }]}
            >
              {Array.from({ length: FRUIT_ROWS }, (__, row) => {
                const i = cellOf(col, row);
                const fruit = state.cells[i];
                return (
                  <View key={row} testID={`fruit-cell-${col}-${row}`} accessibilityLabel={fruit === null ? 'empty' : String(fruit)} style={[styles.cell, { width: cell, height: cell }]} pointerEvents="none">
                    {fruit !== null && (
                      <Animated.View key={view.changed[i] ? `m${state.drops}-${state.sweepsLeft}` : 'still'} entering={view.changed[i] ? ZoomIn.duration(FRUIT_GUARD_MS) : undefined}>
                        <PixelSprite sprite={FRUITS[fruit]} scale={spriteScale} />
                      </Animated.View>
                    )}
                  </View>
                );
              })}
            </Pressable>
          ))}
        </View>
        <Button label={t.play.sweep(state.sweepsLeft)} onPress={() => dispatch({ type: 'sweep' })} disabled={locked || state.sweepsLeft <= 0} variant="secondary" compact testID="fruit-btn-sweep" />
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.md },
  board: { flexDirection: 'row', borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  col: { borderLeftWidth: StyleSheet.hairlineWidth },
  cell: { alignItems: 'center', justifyContent: 'center' },
  hudItem: { gap: 2, alignItems: 'center' },
});
