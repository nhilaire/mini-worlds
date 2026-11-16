// « Fruits en Fusion » screen: the pure engine (src/game/fruit) on a 6 × 8 grid of plain views; each column is one
// Pressable (a tap drops the next fruit there). Turn-based: a drop settles at once in the engine, then the screen
// replays it (AC-91, src/game/fruit/replay.ts): the drop, then for each merge the merged fruits framed and flashing
// with « +points », shrinking into the cell where the new fruit grows, and the fall. The engine's input guard lasts
// the whole replay; the frame loop ticks it on the injectable clock and React re-renders only when the phase changes.
// HUD: fruits left of the 40 and the next fruit; « Coup de balai » clears the bottom row.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';

import { FRUITS } from '../../art/games/fruit';
import { PALETTE } from '../../art/palette';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { Cell, cellOf, colOf, createFruit, FRUIT_COLS, FRUIT_ROWS, FruitAction, FruitState, reduceFruit, rowOf } from '../../game/fruit/engine';
import { buildFruitReplay, FruitPhase, fruitReplayDuration, phaseIndexAt } from '../../game/fruit/replay';
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
/** Width of the « +points » label over the board (kept inside the board on the edge columns). */
const POP_WIDTH = 110;
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

/** What React draws: the engine state, the replay of the last move and the phase on show (`phases.length`: over). */
type Shown = { game: FruitState; phases: readonly FruitPhase[]; phase: number };

export function FruitGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const cell = Math.max(28, Math.min(60, Math.floor(Math.min((width - 2 * spacing.md - 8) / FRUIT_COLS, (height - 360) / FRUIT_ROWS))));
  const spriteScale = Math.max(1, Math.floor((cell - 6) / SPRITE_PIXELS));

  const [view, setView] = useState<Shown>(() => ({ game: createFruit(seed, upgradeLevels(save, 'fruit')), phases: [], phase: 0 }));
  const state = view.game;
  const stateRef = useRef(state);
  const replayRef = useRef<{ phases: readonly FruitPhase[]; phase: number; total: number }>({ phases: [], phase: 0, total: 0 });
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
      if (action.type !== 'tick') {
        // An accepted move starts its replay.
        if (next.cells !== previous.cells) {
          const phases = buildFruitReplay(previous.cells, next);
          replayRef.current = { phases, phase: 0, total: fruitReplayDuration(phases) };
          setView({ game: next, phases, phase: 0 });
        }
      } else {
        // Ticks count the guard down: React re-renders only when the phase on show changes.
        const replay = replayRef.current;
        const phase = next.busyMs <= 0 ? replay.phases.length : phaseIndexAt(replay.phases, replay.total - next.busyMs);
        if (phase !== replay.phase) {
          replay.phase = phase;
          setView((v) => ({ ...v, phase }));
        }
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
  const current = view.phase < view.phases.length ? view.phases[view.phase] : null;
  const previousBoard = view.phase > 0 && view.phase <= view.phases.length ? view.phases[view.phase - 1].board : null;
  const shown: readonly Cell[] = current ? current.board : state.cells;
  const flashed = new Set(current?.kind === 'flash' ? current.cells : []);
  const popAt = current?.kind === 'flash' ? (current.at ?? current.cells[0]) : null;
  /** How the fruit of cell `i` enters in the current phase: the landed fruit, the grown fruit, a fallen fruit. */
  const entering = (i: number): { key: string; ms: number } | null => {
    if (!current) return null;
    if (current.kind === 'drop' && current.cell === i) return { key: `d${state.drops}`, ms: current.ms };
    if (current.kind === 'shrink' && current.at === i) return { key: `g${state.drops}-${view.phase}`, ms: current.ms };
    if (current.kind === 'fall' && previousBoard && shown[i] !== null && shown[i] !== previousBoard[i]) return { key: `f${state.drops}-${view.phase}`, ms: current.ms };
    return null;
  };

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
                const fruit = shown[i];
                const enter = entering(i);
                const flash = flashed.has(i);
                return (
                  <View
                    key={row}
                    testID={`fruit-cell-${col}-${row}`}
                    accessibilityLabel={fruit === null ? 'empty' : String(fruit)}
                    style={[styles.cell, { width: cell, height: cell }, flash && styles.flash]}
                    pointerEvents="none"
                  >
                    {flash && <View testID={`fruit-flash-${col}-${row}`} />}
                    {fruit !== null && (
                      <Animated.View
                        key={enter ? enter.key : 'still'}
                        entering={enter ? ZoomIn.duration(enter.ms) : undefined}
                        exiting={flash && current?.kind === 'flash' && i !== current.at ? ZoomOut.duration(current.ms) : undefined}
                      >
                        <PixelSprite sprite={FRUITS[fruit]} scale={spriteScale} />
                      </Animated.View>
                    )}
                  </View>
                );
              })}
            </Pressable>
          ))}
          {current?.kind === 'flash' && popAt !== null && (
            <View pointerEvents="none" style={[styles.pop, { left: Math.min(Math.max(0, colOf(popAt) * cell + cell / 2 - POP_WIDTH / 2), FRUIT_COLS * cell - POP_WIDTH), top: Math.max(0, rowOf(popAt) * cell - cell / 2), width: POP_WIDTH }]}>
              <PixelText bold testID="fruit-points-pop" style={styles.popText}>{`+${current.points}`}</PixelText>
            </View>
          )}
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
  cell: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent', borderRadius: 4 },
  flash: { borderColor: PALETTE.orange, backgroundColor: PALETTE.yellow },
  pop: { position: 'absolute', alignItems: 'center', overflow: 'visible' },
  popText: { color: PALETTE.darkOrange, textAlign: 'center' },
  hudItem: { gap: 2, alignItems: 'center' },
});
