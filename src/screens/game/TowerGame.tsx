// « Tour Bancale » screen: the pure engine (src/game/tower) drives plain React Native views. The sliding block is an
// Animated value set every frame (no re-render); the stack re-renders only when a floor is placed. The view scrolls
// up with the tower so that the top floors and the block stay visible; a cut-off overhang falls away (250 ms) and a
// perfect drop flashes the new floor.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { PALETTE, PaletteColor } from '../../art/palette';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { createTower, Floor, floorsPlaced, reduceTower, TOWER_FIELD, TowerAction, TowerEvent } from '../../game/tower/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const MAX_DT_MS = 50;
const MOVE_MS = 250;
const SCROLL_MS = 200;
/** Floors kept visible above the block (the view scrolls when the tower grows). */
const HEADROOM_FLOORS = 3;
const FLOOR_COLORS: readonly PaletteColor[] = ['red', 'orange', 'yellow', 'green', 'sky', 'purple'];

function floorColor(index: number): string {
  return index === 0 ? PALETTE.brown : PALETTE[FLOOR_COLORS[(index - 1) % FLOOR_COLORS.length]];
}

/** Engine events → existing feedback kinds: tick for a placed floor, combo for a perfect one, drop for a miss. */
function feedbackOf(events: readonly TowerEvent[]): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'place' && !e.perfect) out.push({ kind: 'move' });
    else if (e.kind === 'miss') out.push({ kind: 'drop' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push(e);
  }
  return out;
}

/** The overhang cut off by an imperfect drop falls and fades away. */
function FallingPiece({ piece, bottom, unit, height, color }: { piece: Floor; bottom: number; unit: number; height: number; color: string }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: MOVE_MS, easing: Easing.in(Easing.quad), useNativeDriver: false }).start();
  }, [progress]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, height * 4] });
  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return (
    <Animated.View
      testID="tower-cut"
      pointerEvents="none"
      style={[styles.floor, { left: piece.x * unit, bottom, width: piece.width * unit, height, backgroundColor: color, opacity, transform: [{ translateY }] }]}
    />
  );
}

/** A perfect drop: the new floor flashes white. */
function Flash({ floor, bottom, unit, height }: { floor: Floor; bottom: number; unit: number; height: number }) {
  const [opacity] = useState(() => new Animated.Value(0.9));
  useEffect(() => {
    Animated.timing(opacity, { toValue: 0, duration: MOVE_MS, useNativeDriver: false }).start();
  }, [opacity]);
  return <Animated.View testID="tower-perfect" pointerEvents="none" style={[styles.flash, { left: floor.x * unit, bottom, width: floor.width * unit, height, opacity }]} />;
}

const TUTORIAL = [{ key: 'drop' }] as const;

export function TowerGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const unit = Math.max(8, Math.floor((width - 2 * spacing.md) / TOWER_FIELD));
  const floorHeight = Math.max(10, Math.round(unit * 0.6));
  const boardWidth = TOWER_FIELD * unit;
  const boardHeight = Math.max(8 * floorHeight, Math.min(height - 240, Math.round(boardWidth * 1.5)));

  const [state, setState] = useState(() => createTower(seed, upgradeLevels(save, 'tower')));
  const stateRef = useRef(state);
  const [blockX] = useState(() => new Animated.Value(0));
  const [camera] = useState(() => new Animated.Value(0));
  const steps = useMemo(() => TUTORIAL.map((s) => ({ key: s.key, text: t.tutorial.tower[s.key] })), [t]);
  const frame = useRoundFrame({ game: 'tower', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  // Every action goes through here: the engine stays the single source of truth.
  const dispatch = useCallback(
    (action: TowerAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceTower(previous, action);
      stateRef.current = next;
      if (next.block !== previous.block) blockX.setValue(next.block.x * unit);
      // Ticks only slide the block (Animated value above): re-render when a floor lands or the round ends.
      if (next.floors !== previous.floors || next.status !== previous.status) setState(next);
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [blockX, finish, setCombos, unit],
  );

  // The block position follows the cell size (rotation of the phone, first layout).
  useEffect(() => {
    blockX.setValue(stateRef.current.block.x * unit);
  }, [blockX, unit]);

  // Frame loop: ticks the engine with the injectable clock while the round is active (not during the bubble).
  useEffect(() => {
    if (!active) return;
    let last = now();
    let handle = 0;
    const loop = () => {
      const time = now();
      const dt = Math.min(MAX_DT_MS, time - last);
      last = time;
      if (dt > 0) dispatch({ type: 'tick', dt });
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [active, dispatch]);

  // The view scrolls up so that the block keeps HEADROOM_FLOORS floors of space above it.
  const placed = state.floors.length;
  const scroll = Math.max(0, (placed + HEADROOM_FLOORS) * floorHeight - boardHeight);
  useEffect(() => {
    Animated.timing(camera, { toValue: scroll, duration: SCROLL_MS, useNativeDriver: false }).start();
  }, [camera, scroll]);

  const onDrop = useCallback(() => {
    if (paused || stateRef.current.status !== 'playing') return;
    dispatch({ type: 'drop' });
    advanceTutorial('drop');
  }, [advanceTutorial, dispatch, paused]);

  // Only the floors that can be on screen (the bottom of a tall tower is scrolled away).
  const firstVisible = Math.max(0, Math.floor(scroll / floorHeight) - 1);
  const place = state.events.find((e): e is Extract<TowerEvent, { kind: 'place' }> => e.kind === 'place');
  const top = state.floors[state.floors.length - 1];

  const hud = (
    <View style={styles.hudItem}>
      <PixelText size={8} color="muted">
        {t.hud.floors}
      </PixelText>
      <PixelText testID="hud-floors">{String(floorsPlaced(state))}</PixelText>
    </View>
  );

  return (
    <GameFrame game="tower" frame={frame} score={state.score} hud={hud} testID="tower-screen">
      <Pressable
        testID="tower-btn-drop"
        accessibilityRole="button"
        accessibilityLabel={t.tutorial.tower.drop}
        onPress={onDrop}
        style={[styles.board, { width: boardWidth, height: boardHeight, backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: camera }] }]} pointerEvents="none">
          {state.floors.slice(firstVisible).map((floor, k) => {
            const i = firstVisible + k;
            return (
              <View
                key={i}
                testID={`tower-floor-${i}`}
                style={[styles.floor, { left: floor.x * unit, bottom: i * floorHeight, width: floor.width * unit, height: floorHeight, backgroundColor: floorColor(i) }]}
              />
            );
          })}
          {place?.cut && <FallingPiece key={`cut-${place.floor}`} piece={place.cut} bottom={place.floor * floorHeight} unit={unit} height={floorHeight} color={floorColor(place.floor)} />}
          {place?.perfect && <Flash key={`flash-${place.floor}`} floor={top} bottom={place.floor * floorHeight} unit={unit} height={floorHeight} />}
          {state.status === 'playing' && (
            <Animated.View
              testID="tower-block"
              style={[styles.floor, { left: 0, bottom: placed * floorHeight, width: state.block.width * unit, height: floorHeight, backgroundColor: floorColor(placed), transform: [{ translateX: blockX }] }]}
            />
          )}
        </Animated.View>
      </Pressable>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  board: { borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  floor: { position: 'absolute', borderWidth: 2, borderColor: PALETTE.outline },
  flash: { position: 'absolute', backgroundColor: PALETTE.white },
  hudItem: { gap: 2 },
});
