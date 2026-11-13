// « Lucioles » screen: the lights-out engine (src/game/lights) on a grid of Pressable cells, 4 × 4 for grids 1-2 and
// 5 × 5 for grids 3-5 (same board size on screen). Turn-based: a tap settles at once (HUD, score); the fireflies that
// switch on zoom in and the ones that switch off zoom out (≤ 180 ms, Reanimated layout animations). The « Indice »
// button highlights one cell of a solution.
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInUp, ZoomIn, ZoomOut } from 'react-native-reanimated';

import { FIREFLY_OFF, FIREFLY_ON } from '../../art/games/lights';
import { upgradeLevels } from '../../game/core/upgrades';
import { createLights, LIGHTS_GRIDS, LIGHTS_SIZE, LightsState, reduceLights } from '../../game/lights/engine';
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
const TOGGLE_MS = 180;

/** Engine events → sound / haptic names of the shared kit (src/feedback/feedback.ts). */
function feedbackOf(events: LightsState['events']): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'toggle') out.push({ kind: 'move' });
    else if (e.kind === 'solved') out.push({ kind: 'lines' });
    else if (e.kind === 'failed') out.push({ kind: 'drop' });
    else if (e.kind === 'hint') out.push({ kind: 'button' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push({ kind: e.kind });
  }
  return out;
}

type GridResult = { grid: number; points: number };

export function LightsGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  // The board keeps the same size on screen: 4 × 4 grids (grids 1-2) get bigger cells than 5 × 5 grids (3-5).
  const boardPx = LIGHTS_SIZE * Math.min(88, Math.floor(Math.min((width - 2 * spacing.md) / LIGHTS_SIZE, (height - 340) / LIGHTS_SIZE)));

  const [state, setState] = useState(() => createLights(seed, upgradeLevels(save, 'lights')));
  const stateRef = useRef(state);
  const [last, setLast] = useState<GridResult | null>(null);
  const steps = useMemo(() => [{ key: 'tap', text: t.tutorial.lights.tap }], [t]);
  const frame = useRoundFrame({ game: 'lights', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  const dispatch = useCallback(
    (action: Parameters<typeof reduceLights>[1]) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceLights(previous, action);
      stateRef.current = next;
      setState(next);
      for (const e of next.events) {
        if (e.kind === 'solved') setLast({ grid: e.grid, points: e.points });
        else if (e.kind === 'failed') setLast({ grid: e.grid, points: 0 });
      }
      if (action.type === 'tap') advanceTutorial('tap');
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [advanceTutorial, finish, setCombos],
  );

  const locked = paused || state.status !== 'playing';
  const size = state.size;
  const cell = Math.floor(boardPx / size);
  const spriteScale = Math.max(1, Math.floor((cell - 12) / SPRITE_PIXELS));

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.grid}
        </PixelText>
        <PixelText testID="hud-grid">{t.hud.of(state.grid, LIGHTS_GRIDS)}</PixelText>
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
    <GameFrame game="lights" frame={frame} score={state.score} hud={hud} testID="lights-screen">
      <View style={styles.column}>
        <View testID="lights-board" style={[styles.board, { width: size * cell + 4, backgroundColor: colors.surface, borderColor: colors.border }]}>
          {state.lit.map((on, i) => {
            const col = i % size;
            const row = Math.floor(i / size);
            const hinted = state.hint === i;
            return (
              <Pressable
                key={`${state.grid}-${i}`}
                testID={`lights-cell-${col}-${row}`}
                accessibilityRole="button"
                accessibilityState={{ checked: on }}
                disabled={locked}
                onPress={() => dispatch({ type: 'tap', cell: i })}
                style={({ pressed }) => [
                  styles.cell,
                  { width: cell, height: cell, borderColor: hinted ? colors.accent : colors.border, borderWidth: hinted ? 4 : 1 },
                  pressed && { backgroundColor: colors.surfaceAlt },
                ]}
              >
                <PixelSprite sprite={FIREFLY_OFF} scale={spriteScale} />
                {on && (
                  <Animated.View key={`on-${state.grid}`} testID={`lights-on-${col}-${row}`} entering={ZoomIn.duration(TOGGLE_MS)} exiting={ZoomOut.duration(TOGGLE_MS)} style={styles.glow} pointerEvents="none">
                    <PixelSprite sprite={FIREFLY_ON} scale={spriteScale} />
                  </Animated.View>
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.footer}>
          {last && (
            <Animated.View key={`last-${last.grid}`} entering={FadeInUp.duration(220)}>
              <PixelText testID="lights-last" color={last.points > 0 ? 'success' : 'danger'} bold>
                {last.points > 0 ? `+${last.points}` : '0'}
              </PixelText>
            </Animated.View>
          )}
          <Button label={t.play.hint(state.hintsLeft)} onPress={() => dispatch({ type: 'hint' })} disabled={locked || state.hintsLeft <= 0 || state.hint !== null} variant="secondary" compact testID="lights-btn-hint" />
        </View>
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.md },
  board: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  hudItem: { gap: 2 },
  footer: { alignItems: 'center', gap: spacing.sm, minHeight: 90, alignSelf: 'stretch', paddingHorizontal: spacing.md },
});
