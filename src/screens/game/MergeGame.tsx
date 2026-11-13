// « Fusion de Guerriers » screen: the pure engine (src/game/merge) on a 4 × 4 grid of Pressable cells. Tap a warrior
// (highlighted), then an adjacent warrior of the same level: the merged warrior zooms in and the new recruits fade in
// for 200 ms, while the engine's input guard (ticked by the injectable clock in a frame loop that never re-renders
// React) ignores taps. Each warrior shows its level sprite and its level number (readable without colour).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { warriorSprite } from '../../art/games/merge';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { createMerge, MERGE_GUARD_MS, MERGE_SIZE, MergeAction, MergeState, reduceMerge } from '../../game/merge/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { PixelSprite } from '../../ui/PixelSprite';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const SPRITE_PIXELS = 10;
const MAX_DT_MS = 50;
const TUTORIAL = [{ key: 'merge' }] as const;

/** Engine events → sound / haptic names of the shared kit (src/feedback/feedback.ts). */
function feedbackOf(events: MergeState['events']): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'select') out.push({ kind: 'button' });
    else if (e.kind === 'merge') out.push({ kind: 'match' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push({ kind: e.kind });
  }
  return out;
}

/** How a cell entered with the last merge: the merged warrior zooms in, a recruit fades in. */
function enteringOf(state: MergeState, cell: number) {
  for (const e of state.events) {
    if (e.kind === 'merge' && e.to === cell) return ZoomIn.duration(MERGE_GUARD_MS);
    if (e.kind === 'spawn' && e.cell === cell) return FadeIn.duration(MERGE_GUARD_MS);
  }
  return undefined;
}

export function MergeGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const cell = Math.max(48, Math.min(88, Math.floor(Math.min((width - 2 * spacing.md - 8) / MERGE_SIZE, (height - 340) / MERGE_SIZE))));
  const spriteScale = Math.max(1, Math.floor((cell - 16) / SPRITE_PIXELS));

  const [state, setState] = useState(() => createMerge(seed, upgradeLevels(save, 'merge')));
  const stateRef = useRef(state);
  const steps = useMemo(() => TUTORIAL.map((s) => ({ key: s.key, text: t.tutorial.merge[s.key] })), [t]);
  const frame = useRoundFrame({ game: 'merge', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  const dispatch = useCallback(
    (action: MergeAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceMerge(previous, action);
      stateRef.current = next;
      // Ticks only count the guard down: React re-renders when the board or the selection changes.
      if (next.cells !== previous.cells || next.selected !== previous.selected || next.status !== previous.status) setState(next);
      if (next.events.some((e) => e.kind === 'merge')) advanceTutorial('merge');
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [advanceTutorial, finish, setCombos],
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

  const locked = paused || state.status !== 'playing';

  const hud = (
    <View style={styles.hudItem}>
      <PixelText size={8} color="muted">
        {t.hud.best}
      </PixelText>
      <PixelText testID="hud-best">{String(state.best)}</PixelText>
    </View>
  );

  return (
    <GameFrame game="merge" frame={frame} score={state.score} hud={hud} testID="merge-screen">
      <View testID="merge-board" style={[styles.board, { width: MERGE_SIZE * cell + 4, backgroundColor: colors.surface, borderColor: colors.border }]}>
        {state.cells.map((level, i) => {
          const col = i % MERGE_SIZE;
          const row = Math.floor(i / MERGE_SIZE);
          const selected = state.selected === i;
          return (
            <Pressable
              key={i}
              testID={`merge-cell-${col}-${row}`}
              accessibilityRole="button"
              accessibilityLabel={level === 0 ? 'empty' : String(level)}
              accessibilityState={{ selected }}
              disabled={locked}
              onPress={() => dispatch({ type: 'tap', cell: i })}
              style={({ pressed }) => [
                styles.cell,
                { width: cell, height: cell, borderColor: selected ? colors.accent : colors.border, borderWidth: selected ? 4 : 1 },
                selected && { backgroundColor: colors.surfaceAlt },
                pressed && { backgroundColor: colors.surfaceAlt },
              ]}
            >
              {level > 0 && (
                <Animated.View key={`${state.merges}-${level}`} entering={enteringOf(state, i)} style={styles.warrior} pointerEvents="none">
                  <PixelSprite sprite={warriorSprite(level)} scale={spriteScale} />
                  <PixelText testID={`merge-level-${col}-${row}`} size={8} bold style={[styles.level, { color: colors.text }]}>
                    {String(level)}
                  </PixelText>
                </Animated.View>
              )}
            </Pressable>
          );
        })}
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  board: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  warrior: { alignItems: 'center', justifyContent: 'center' },
  level: { position: 'absolute', right: -6, bottom: -6 },
  hudItem: { gap: 2 },
});
