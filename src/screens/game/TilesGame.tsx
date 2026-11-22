// « Glisse-Fusion » screen: the gem engine (src/game/tiles) on a 4 × 4 board of pixel gems (one shape and colour per
// level, the joker is a star). Turn-based: a swipe anywhere on the board, or one of the four arrow buttons, slides
// every gem; each gem that moved slides in from the cell it came from (150 ms, Animated value, native driver) and the
// new gem fades in. The engine guards the move (150 ms); a frame loop ticks it with the injectable clock only while
// the guard runs (a few renders per move, none between moves). The « Annuler » button (shown when the upgrade is
// owned) takes the last move back.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { GEM_SPRITES, JOKER_SPRITE } from '../../art/games/tiles';
import { PALETTE } from '../../art/palette';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { acceptsInput, bestGem, createTiles, Dir, EMPTY, JOKER, MOVE_MS, movesLeft, reduceTiles, TILES_SIZE, TilesAction, TilesState } from '../../game/tiles/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { Button } from '../../ui/Button';
import { PixelSprite } from '../../ui/PixelSprite';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const MAX_DT_MS = 50;
const SPRITE_PX = 12;
const CELL_INSET = 2;
/** Shortest finger travel read as a swipe (px). */
export const SWIPE_PX = 16;

/** Engine events → sounds / haptics of the shared kit. */
function feedbackOf(events: TilesState['events']): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'move') out.push({ kind: e.merges > 0 ? 'match' : 'move' });
    else if (e.kind === 'blocked') out.push({ kind: 'swap_back' });
    else if (e.kind === 'undo') out.push({ kind: 'button' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push({ kind: e.kind });
  }
  return out;
}

/** Direction of a swipe from its translation; null when too short. */
export function swipeDir(dx: number, dy: number): Dir | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 1 : 3;
  return dy > 0 ? 2 : 0;
}

type GemProps = {
  gem: number;
  index: number;
  cell: number;
  /** Distance the gem comes from (the cell it left), 0 when it did not move. */
  fromX: number;
  fromY: number;
  /** The gem has just appeared: it fades in. */
  appears: boolean;
  label: string;
};

/** A pixel gem that slides in from its previous cell when it mounts (its key changes on every move that moves it). */
function Gem({ gem, index, cell, fromX, fromY, appears, label }: GemProps) {
  const animated = fromX !== 0 || fromY !== 0 || appears;
  const [slide] = useState(() => new Animated.Value(animated ? 0 : 1));
  useEffect(() => {
    if (animated) Animated.timing(slide, { toValue: 1, duration: MOVE_MS, useNativeDriver: true }).start();
  }, [animated, slide]);
  const scale = Math.max(1, Math.floor((cell - 2 * CELL_INSET - 4) / SPRITE_PX));
  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [fromX, 0] });
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [fromY, 0] });
  return (
    <Animated.View
      testID={`tiles-gem-${index}`}
      accessible
      accessibilityLabel={label}
      pointerEvents="none"
      style={[
        styles.gem,
        { left: (index % TILES_SIZE) * cell, top: Math.floor(index / TILES_SIZE) * cell, width: cell, height: cell },
        { opacity: appears ? slide : 1, transform: [{ translateX }, { translateY }] },
      ]}
    >
      <PixelSprite sprite={gem === JOKER ? JOKER_SPRITE : GEM_SPRITES[gem - 1]} scale={scale} />
    </Animated.View>
  );
}

export function TilesGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();

  const [undoOwned] = useState(() => (upgradeLevels(save, 'tiles').undo ?? 0) > 0);
  const [state, setState] = useState(() => createTiles(seed, upgradeLevels(save, 'tiles')));
  const stateRef = useRef(state);
  const steps = useMemo(() => [{ key: 'swipe', text: t.tutorial.tiles.swipe }], [t]);
  const frame = useRoundFrame({ game: 'tiles', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  // The board: what is left of the screen under the HUD and above the arrows and the undo button.
  const boardSide = Math.max(160, Math.floor(Math.min(width - 2 * spacing.md, height - 420)));
  const cell = Math.floor(boardSide / TILES_SIZE);
  const board = cell * TILES_SIZE;

  // The reducer runs inside the state updater (no ref is read, so the swipe gesture can be built during render);
  // what follows a transition (tutorial, combos, end of the round) is done once it is drawn. A tick outside the
  // guard returns the same state: no render.
  const dispatch = useCallback((action: TilesAction) => {
    setState((previous) => (previous.status === 'playing' ? reduceTiles(previous, action) : previous));
  }, []);
  useEffect(() => {
    stateRef.current = state;
    if (state.events.some((e) => e.kind === 'move')) advanceTutorial('swipe');
    if (state.status === 'over') finish(state.score, state.combos);
    else setCombos(state.combos);
  }, [advanceTutorial, finish, setCombos, state]);

  // Frame loop of the move guard (injectable clock): it runs only while a move animates.
  const waiting = active && state.status === 'playing' && !acceptsInput(state);
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

  const onSwipe = useCallback(
    (dir: Dir) => {
      if (paused) return;
      dispatch({ type: 'swipe', dir });
    },
    [dispatch, paused],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .withTestId('tiles-pan')
        .runOnJS(true)
        .minDistance(4)
        .onEnd((e) => {
          const dir = swipeDir(e.translationX, e.translationY);
          if (dir !== null) onSwipe(dir);
        }),
    [onSwipe],
  );

  const locked = paused || state.status !== 'playing';
  const best = bestGem(state.cells);
  const arrow = (dir: Dir, label: string, testID: string) => (
    <View style={styles.arrow}>
      <Button label={label} onPress={() => onSwipe(dir)} disabled={locked} variant="secondary" compact testID={testID} />
    </View>
  );

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.moves}
        </PixelText>
        <PixelText testID="hud-moves">{String(movesLeft(state))}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.best}
        </PixelText>
        <View testID="hud-best" accessible accessibilityLabel={String(best)} style={styles.best}>
          {best > 0 && <PixelSprite sprite={GEM_SPRITES[best - 1]} scale={2} />}
        </View>
      </View>
    </>
  );

  return (
    <GameFrame game="tiles" frame={frame} score={state.score} hud={hud} testID="tiles-screen">
      <View style={styles.column}>
        <GestureDetector gesture={pan}>
          <View testID="tiles-board" style={[styles.board, { width: board + 8, height: board + 8, backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ width: board, height: board }}>
              {state.cells.map((_, i) => (
                <View
                  key={`cell-${i}`}
                  pointerEvents="none"
                  style={[
                    styles.cell,
                    { left: (i % TILES_SIZE) * cell + CELL_INSET, top: Math.floor(i / TILES_SIZE) * cell + CELL_INSET, width: cell - 2 * CELL_INSET, height: cell - 2 * CELL_INSET, backgroundColor: colors.surfaceAlt },
                  ]}
                />
              ))}
              {state.cells.map((gem, i) => {
                if (gem === EMPTY) return null;
                const from = state.origins[i];
                const appears = state.spawned === i;
                const moved = from !== i || appears;
                return (
                  <Gem
                    key={moved ? `m${state.moves}-${i}` : `s${i}-${gem}`}
                    gem={gem}
                    index={i}
                    cell={cell}
                    fromX={((from % TILES_SIZE) - (i % TILES_SIZE)) * cell}
                    fromY={(Math.floor(from / TILES_SIZE) - Math.floor(i / TILES_SIZE)) * cell}
                    appears={appears}
                    label={gem === JOKER ? t.play.joker : String(gem)}
                  />
                );
              })}
            </View>
          </View>
        </GestureDetector>

        <View style={styles.footer}>
          {arrow(0, t.play.up, 'tiles-up')}
          <View style={styles.arrows}>
            {arrow(3, t.play.left, 'tiles-left')}
            {arrow(1, t.play.right, 'tiles-right')}
          </View>
          {arrow(2, t.play.down, 'tiles-down')}
          {undoOwned && (
            <Button
              label={t.play.undo(state.undosLeft)}
              onPress={() => dispatch({ type: 'undo' })}
              disabled={locked || state.undosLeft <= 0 || state.previous === null}
              variant="secondary"
              compact
              testID="tiles-undo"
            />
          )}
        </View>
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.md, alignSelf: 'stretch' },
  board: { borderWidth: 2, borderRadius: 4, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cell: { position: 'absolute', borderRadius: 3, borderWidth: 1, borderColor: PALETTE.darkGrey },
  gem: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  hudItem: { gap: 2 },
  best: { minHeight: 24, minWidth: 24 },
  arrows: { flexDirection: 'row', gap: spacing.md },
  arrow: { width: 120 },
  footer: { alignItems: 'center', gap: spacing.sm, alignSelf: 'stretch', paddingHorizontal: spacing.md },
});
