// « Saute-Lapin » screen: the pure runner engine (src/game/hop) drawn with plain views (side view, 12 units wide).
// A frame loop reads the injectable clock and ticks the engine while the round is active (not during the tutorial
// bubble or the pause); a tap anywhere on the field jumps. The jump arc is the move animation; a hit makes the bunny
// blink for 250 ms.
//
// Performance (phone test: the round lagged on an Android 11 phone): the frame loop never re-renders React. The bunny
// height and the fence positions are Animated values set on every tick; React re-renders only when something else
// changes (a fence spawns or leaves, an event such as a pass or a hit, the end of the round).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { BUNNY } from '../../art/games/hop';
import { PALETTE } from '../../art/palette';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { BUNNY_SIZE, BUNNY_X, createHop, FIELD_WIDTH, HIT_BLINK_MS, HopAction, HopEvent, HopState, OBSTACLE_WIDTH, reduceHop } from '../../game/hop/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { PixelSprite } from '../../ui/PixelSprite';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

/** Sky height in units (apex of a jump: 2.53 + 0.8) and ground band below it. */
const SKY_UNITS = 4;
const GROUND_UNITS = 0.6;
/** Longest tick fed to the engine (a dropped frame must not teleport the fences). */
const MAX_DT_MS = 50;
/** Fences on screen at once never exceed 3 (12 units, gaps of 5+); the pool keeps a margin. */
const FENCE_SLOTS = 6;

/** Engine events → feedback kinds of the sound kit (tick: move, pop: success, drop: failure, combo, over). */
const FEEDBACK_KIND: Partial<Record<HopEvent['kind'], string>> = { jump: 'move', pass: 'pop', hit: 'drop', combo: 'combo', over: 'over' };

/** React must re-render only when what it draws changes: fences spawned or removed, an event, the end, the shields. */
export function needsRender(previous: HopState, next: HopState): boolean {
  if (next.events.length > 0 || next.status !== previous.status || next.shields !== previous.shields) return true;
  if (next.obstacles.length !== previous.obstacles.length) return true;
  return next.obstacles.some((o, i) => o.id !== previous.obstacles[i].id);
}

export function HopGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const unit = Math.floor(Math.min((width - 2 * spacing.md) / FIELD_WIDTH, (height - 260) / (SKY_UNITS + GROUND_UNITS)));

  const [state, setState] = useState(() => createHop(seed, upgradeLevels(save, 'hop')));
  const stateRef = useRef(state);
  // Positions in engine units, set on every tick without re-rendering.
  const [bunnyY] = useState(() => new Animated.Value(0));
  const [fenceX] = useState(() => Array.from({ length: FENCE_SLOTS }, () => new Animated.Value(FIELD_WIDTH)));
  const [blink] = useState(() => new Animated.Value(1));
  const steps = useMemo(() => [{ key: 'jump', text: t.tutorial.hop.jump }], [t]);
  const frame = useRoundFrame({ game: 'hop', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => state.events.flatMap((e) => (FEEDBACK_KIND[e.kind] ? [{ kind: FEEDBACK_KIND[e.kind] as string }] : [])), [state.events]);
  useGameFeedback(feedback);

  const dispatch = useCallback(
    (action: HopAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceHop(previous, action);
      stateRef.current = next;
      bunnyY.setValue(next.y);
      next.obstacles.forEach((o, i) => {
        if (i < FENCE_SLOTS) fenceX[i].setValue(o.x);
      });
      if (next.events.some((e) => e.kind === 'hit')) {
        const step = HIT_BLINK_MS / 4;
        Animated.sequence([0.25, 1, 0.25, 1].map((toValue) => Animated.timing(blink, { toValue, duration: step, useNativeDriver: false }))).start();
      }
      if (needsRender(previous, next)) setState(next);
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [blink, bunnyY, fenceX, finish, setCombos],
  );

  // Frame loop: elapsed time from the injectable clock, clamped, only while the round is active.
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

  const inputsLocked = paused || state.status !== 'playing';
  const jump = useCallback(() => {
    if (inputsLocked) return;
    dispatch({ type: 'jump' });
    advanceTutorial('jump');
  }, [advanceTutorial, dispatch, inputsLocked]);

  const fieldW = FIELD_WIDTH * unit;
  const ground = GROUND_UNITS * unit;
  const bunnyScale = (BUNNY_SIZE * unit) / 8;

  const hud = (
    <View style={styles.hudItem}>
      <PixelText size={8} color="muted">
        {t.hud.shields}
      </PixelText>
      <PixelText testID="hud-shields">{String(state.shields)}</PixelText>
    </View>
  );

  return (
    <GameFrame game="hop" frame={frame} score={state.score} hud={hud} testID="hop-screen">
      <Pressable
        testID="hop-btn-jump"
        accessibilityRole="button"
        accessibilityLabel={t.tutorial.hop.jump}
        onPressIn={jump}
        style={[styles.field, { width: fieldW, height: (SKY_UNITS + GROUND_UNITS) * unit, backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={[styles.ground, { height: ground }]} />
        {state.obstacles.slice(0, FENCE_SLOTS).map((o, i) => (
          <Animated.View
            key={o.id}
            testID={`hop-fence-${o.id}`}
            pointerEvents="none"
            style={[styles.fence, { left: 0, bottom: ground, width: OBSTACLE_WIDTH * unit, height: o.height * unit, transform: [{ translateX: Animated.multiply(fenceX[i], unit) }] }]}
          >
            <View style={[styles.post, { left: 0, width: unit * 0.22 }]} />
            <View style={[styles.post, { right: 0, width: unit * 0.22 }]} />
            <View style={[styles.rail, { top: unit * 0.15, height: unit * 0.18 }]} />
            <View style={[styles.rail, { top: o.height * unit * 0.55, height: unit * 0.18 }]} />
          </Animated.View>
        ))}
        <Animated.View
          testID="hop-bunny"
          pointerEvents="none"
          style={{ position: 'absolute', left: BUNNY_X * unit, bottom: ground, opacity: blink, transform: [{ translateY: Animated.multiply(bunnyY, -unit) }] }}
        >
          <PixelSprite sprite={BUNNY} scale={bunnyScale} />
        </Animated.View>
      </Pressable>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  field: { borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  ground: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: PALETTE.green, borderTopWidth: 2, borderColor: PALETTE.darkGreen },
  fence: { position: 'absolute' },
  post: { position: 'absolute', top: 0, bottom: 0, backgroundColor: PALETTE.brown, borderWidth: 1, borderColor: PALETTE.outline },
  rail: { position: 'absolute', left: 0, right: 0, backgroundColor: PALETTE.darkBrown, borderWidth: 1, borderColor: PALETTE.outline },
  hudItem: { gap: 2 },
});
