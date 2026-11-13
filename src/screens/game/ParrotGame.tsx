// « Perroquet Copieur » screen: four pads of distinct colour and shape (red circle, blue square, yellow triangle,
// green diamond) under the parrot. The engine (src/game/parrot) says what to show; this screen plays the pure show
// schedule with the injectable clock (each light plays the pad's tone), then dispatches `shown` and the player
// repeats. A pad pulses (scale, 200 ms) when it lights up or is tapped. A pause stops the show; on resume the
// sequence is shown again from its start (simplest fair reading for a memory game).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { ICON as PARROT } from '../../art/icons/parrot';
import { PALETTE } from '../../art/palette';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { createParrot, lightAt, Pad, ParrotAction, ParrotEvent, PADS, reduceParrot, showSchedule } from '../../game/parrot/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { PixelSprite } from '../../ui/PixelSprite';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

/** Tone of each pad: four distinct sounds of the kit (shoot, pop, coin, tick). */
const PAD_TONES: Record<Pad, string> = { 0: 'shot', 1: 'pop', 2: 'coin', 3: 'move' };
const PAD_COLORS: Record<Pad, string> = { 0: PALETTE.red, 1: PALETTE.blue, 2: PALETTE.yellow, 3: PALETTE.green };

/** Engine events → feedback kinds: the pad tone on a right pad, drop on a mistake, clear on a repeated sequence. */
function feedbackOf(events: readonly ParrotEvent[]): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'pad') out.push({ kind: PAD_TONES[e.pad] });
    else if (e.kind === 'wrong') out.push({ kind: 'drop' });
    else if (e.kind === 'repeated') out.push({ kind: 'match' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push({ kind: e.kind });
  }
  return out;
}

function PadShape({ pad, size }: { pad: Pad; size: number }) {
  const color = PAD_COLORS[pad];
  switch (pad) {
    case 0:
      return <View style={[styles.outlined, { width: size * 0.78, height: size * 0.78, borderRadius: size * 0.39, backgroundColor: color }]} />;
    case 1:
      return <View style={[styles.outlined, { width: size * 0.7, height: size * 0.7, borderRadius: 4, backgroundColor: color }]} />;
    case 2:
      return (
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: size * 0.42,
            borderRightWidth: size * 0.42,
            borderBottomWidth: size * 0.74,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: color,
          }}
        />
      );
    case 3:
      return <View style={[styles.outlined, { width: size * 0.56, height: size * 0.56, backgroundColor: color, transform: [{ rotate: '45deg' }] }]} />;
  }
}

type PadProps = { pad: Pad; size: number; lit: boolean; onPress: (pad: Pad) => boolean };

function PadButton({ pad, size, lit, onPress }: PadProps) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const pulse = useCallback(() => {
    scale.set(withSequence(withTiming(1.12, { duration: 90 }), withTiming(1, { duration: 110 })));
  }, [scale]);
  // A light coming on pulses the pad (the show's animation).
  useEffect(() => {
    if (lit) pulse();
  }, [lit, pulse]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Pressable
      testID={`parrot-pad-${pad}`}
      accessibilityRole="button"
      accessibilityState={{ selected: lit }}
      onPress={() => {
        if (onPress(pad)) pulse();
      }}
    >
      <Animated.View
        style={[
          styles.pad,
          { width: size, height: size, backgroundColor: lit ? colors.surface : colors.surfaceAlt, borderColor: lit ? colors.accent : colors.border },
          animated,
        ]}
      >
        <View style={{ opacity: lit ? 1 : 0.45 }}>
          <PadShape pad={pad} size={size} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

export function ParrotGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const padSize = Math.floor(Math.min((width - 2 * spacing.md - spacing.md) / 2, (height - 380) / 2, 170));

  const [state, setState] = useState(() => createParrot(seed, upgradeLevels(save, 'parrot')));
  const stateRef = useRef(state);
  const steps = useMemo(() => [{ key: 'repeat', text: t.tutorial.parrot.repeat }], [t]);
  const frame = useRoundFrame({ game: 'parrot', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);
  // Tones of the show (one feedback event per light that comes on).
  const [tone, setTone] = useState<{ kind: string }[]>([]);
  useGameFeedback(tone);

  const dispatch = useCallback(
    (action: ParrotAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return previous;
      const next = reduceParrot(previous, action);
      stateRef.current = next;
      setState(next);
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
      return next;
    },
    [finish, setCombos],
  );

  // The show: the pure schedule played against the injectable clock; `lit` remembers which show it belongs to.
  const [lit, setLit] = useState<{ showId: number; pad: Pad; index: number } | null>(null);
  const showing = state.status === 'playing' && state.phase === 'show' && !paused;
  const { showId, sequence } = state;
  useEffect(() => {
    if (!showing) return;
    const schedule = showSchedule(sequence);
    const startedAt = now();
    let lastIndex = -1;
    let handle = 0;
    const loop = () => {
      const elapsed = now() - startedAt;
      if (elapsed >= schedule.totalMs) {
        setLit(null);
        dispatch({ type: 'shown' });
        return;
      }
      const light = lightAt(schedule, elapsed);
      const index = light ? light.index : -1;
      if (index !== lastIndex) {
        lastIndex = index;
        setLit(light ? { showId, ...light } : null);
        if (light) setTone([{ kind: PAD_TONES[light.pad] }]);
      }
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [showing, showId, sequence, dispatch]);

  const litPad = showing && lit && lit.showId === showId ? lit.pad : null;

  /** Returns true when the tap was taken (input phase), so that the pad pulses. */
  const tap = useCallback(
    (pad: Pad) => {
      if (paused) return false;
      const before = stateRef.current;
      if (before.status !== 'playing') return false;
      const next = dispatch({ type: 'tap', pad });
      const taken = before.phase === 'input' && !next.events.some((e) => e.kind === 'ignored');
      if (taken) advanceTutorial('repeat');
      return taken;
    },
    [advanceTutorial, dispatch, paused],
  );

  const hud = (
    <View style={styles.hudItem}>
      <PixelText size={8} color="muted">
        {t.hud.length}
      </PixelText>
      <PixelText testID="hud-length">{String(state.sequence.length)}</PixelText>
    </View>
  );

  return (
    <GameFrame game="parrot" frame={frame} score={state.score} hud={hud} testID="parrot-screen">
      <View style={styles.column}>
        <PixelSprite sprite={PARROT} scale={6} testID="parrot-bird" />
        <PixelText testID="parrot-status" color={state.phase === 'input' ? 'accent' : 'muted'}>
          {state.phase === 'input' ? t.play.yourTurn : t.play.watch}
        </PixelText>
        <View style={[styles.grid, { width: padSize * 2 + spacing.md }]}>
          {PADS.map((pad) => (
            <PadButton key={pad} pad={pad} size={padSize} lit={litPad === pad} onPress={tap} />
          ))}
        </View>
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  pad: { borderWidth: 3, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  outlined: { borderWidth: 3, borderColor: PALETTE.outline },
  hudItem: { gap: 2 },
});
