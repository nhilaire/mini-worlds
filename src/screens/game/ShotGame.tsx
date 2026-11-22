// « Tir Parfait » screen: the shot engine (src/game/shot) drawn as a side view of plain React Native views, scaled to
// the screen width: the ground, the catapult on the left (its arm leans at the chosen angle), the target with its 3
// bands (nested widths: 10, 5 and 2 m either side of the flag) and its distance, the wall with its height from the
// 5th target, and the wind as an arrow with its value (the arrow tells the direction, not a colour). Big « - » / « + »
// buttons set the angle and the power, « Tirer » fires. The engine guards the 700 ms flight and keeps a finished
// target shown 900 ms; a frame loop ticks it with the injectable clock only while one of these runs. The ball follows
// the real trajectory: an Animated value set from the engine's flight time every frame is interpolated over points
// sampled on the parabola (no re-render during the flight). The last landing point stays marked with its distance;
// « Viseur » draws the first part of the trajectory as dots.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { PALETTE } from '../../art/palette';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { acceptsInput, createShot, FLIGHT_MS, flightTime, positionAt, reduceShot, resolveShot, SHOT_BANDS, SHOT_TARGETS, ShotAction, ShotState, targetFinished, wallDistance } from '../../game/shot/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { Button } from '../../ui/Button';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { font, radius, spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const MAX_DT_MS = 50;
/** The field shows this stretch of the world (m): a little behind the catapult to past the longest shot. */
const X_MIN = -8;
const X_MAX = 128;
/** Height of the sky above the ground (m): the highest shot (75°, power 10) peaks at 55 m. */
const SKY_M = 58;
const GROUND_PX = 26;
const BALL_PX = 10;
const ARM_PX = 22;
/** Points sampled on the trajectory for the flight of the ball. */
const FLIGHT_SAMPLES = 16;
/** Dots of the « Viseur » guide for a whole trajectory. */
const SIGHT_DOTS = 36;
/** Band strips of the target, the widest first: half-width (m), height (px), colour. */
const BAND_STRIPS = [
  { within: SHOT_BANDS[2].within, height: 5, color: PALETTE.white },
  { within: SHOT_BANDS[1].within, height: 9, color: PALETTE.yellow },
  { within: SHOT_BANDS[0].within, height: 13, color: PALETTE.red },
] as const;

/** Engine events → sounds / haptics of the shared kit. */
function feedbackOf(events: ShotState['events']): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'aim') out.push({ kind: 'move' });
    else if (e.kind === 'fire') out.push({ kind: 'drop' });
    else if (e.kind === 'landed') out.push({ kind: e.points > 0 ? 'reward' : 'swap_back' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push({ kind: e.kind });
  }
  return out;
}

/** The wind as an arrow: it points where the wind pushes (right = towards the target); no arrow without wind. */
function WindArrow({ wind, color, size = 10 }: { wind: number; color: string; size?: number }) {
  if (wind === 0) return null;
  const head = { borderTopWidth: size / 2, borderBottomWidth: size / 2, borderTopColor: 'transparent', borderBottomColor: 'transparent' };
  const shaft = <View style={{ width: size * (1 + Math.abs(wind) / 2), height: Math.max(2, Math.round(size / 3)), backgroundColor: color }} />;
  return (
    <View style={styles.arrow}>
      {wind < 0 && <View style={[head, { borderRightWidth: size, borderRightColor: color }]} />}
      {shaft}
      {wind > 0 && <View style={[head, { borderLeftWidth: size, borderLeftColor: color }]} />}
    </View>
  );
}

type StepperProps = { name: string; label: string; value: string; less: string; more: string; disabled: boolean; onStep: (step: 1 | -1) => void };

/** A setting: big « - » and « + » buttons around its current value. */
function Stepper({ name, label, value, less, more, disabled, onStep }: StepperProps) {
  const { colors } = useTheme();
  const button = [styles.step, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }];
  return (
    <View style={styles.setting}>
      <Pressable testID={`shot-${name}-minus`} accessibilityRole="button" accessibilityLabel={`${label}, ${less}`} disabled={disabled} onPress={() => onStep(-1)} style={button}>
        <PixelText size={font.pixelBig} bold>
          -
        </PixelText>
      </Pressable>
      <View style={styles.value}>
        <PixelText size={8} color="muted">
          {label}
        </PixelText>
        <PixelText testID={`shot-${name}`} size={font.pixelBig} bold>
          {value}
        </PixelText>
      </View>
      <Pressable testID={`shot-${name}-plus`} accessibilityRole="button" accessibilityLabel={`${label}, ${more}`} disabled={disabled} onPress={() => onStep(1)} style={button}>
        <PixelText size={font.pixelBig} bold>
          +
        </PixelText>
      </Pressable>
    </View>
  );
}

type TargetResult = { target: number; points: number };

export function ShotGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  // Pixels per metre: the field takes the screen width, less on a short screen.
  const scale = Math.max(1, Math.min((width - 2 * spacing.md) / (X_MAX - X_MIN), (height - 430) / SKY_M));
  const fieldWidth = Math.round((X_MAX - X_MIN) * scale);
  const fieldHeight = Math.round(SKY_M * scale) + GROUND_PX;
  const px = useCallback((x: number) => (Math.max(X_MIN, Math.min(X_MAX, x)) - X_MIN) * scale, [scale]);

  const [state, setState] = useState(() => createShot(seed, upgradeLevels(save, 'shot')));
  const stateRef = useRef(state);
  const [last, setLast] = useState<TargetResult | null>(null);
  const [progress] = useState(() => new Animated.Value(0));
  const steps = useMemo(() => [{ key: 'aim', text: t.tutorial.shot.aim }], [t]);
  const frame = useRoundFrame({ game: 'shot', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  const dispatch = useCallback(
    (action: ShotAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceShot(previous, action);
      stateRef.current = next;
      // The ball follows the engine's flight time (no re-render during the flight).
      if (next.flight !== null) progress.setValue(1 - next.flightMs / FLIGHT_MS);
      // A tick only re-renders when the ball lands, inputs are taken again, the target changes or the round ends.
      const redraw = action.type !== 'tick' || next.flight !== previous.flight || acceptsInput(next) !== acceptsInput(previous) || next.target !== previous.target || next.status !== previous.status;
      if (redraw) setState(next);
      for (const e of next.events) {
        if (e.kind === 'done') setLast({ target: e.target, points: e.points });
        else if (e.kind === 'target') setLast(null);
      }
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [finish, progress, setCombos],
  );

  // Frame loop of the flight and the finished target (injectable clock); dispatch is read through a ref so that a new
  // callback identity never restarts it.
  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);
  const waiting = active && state.status === 'playing' && !acceptsInput(state);
  useEffect(() => {
    if (!waiting) return;
    let lastTime = now();
    let handle = 0;
    const loop = () => {
      const time = now();
      const dt = Math.min(MAX_DT_MS, time - lastTime);
      lastTime = time;
      if (dt > 0) dispatchRef.current({ type: 'tick', dt });
      if (stateRef.current.status === 'playing' && !acceptsInput(stateRef.current)) handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [waiting]);

  const onInput = useCallback(
    (action: ShotAction) => {
      if (paused) return;
      dispatch(action);
      advanceTutorial('aim');
    },
    [advanceTutorial, dispatch, paused],
  );
  const onAngle = useCallback((step: 1 | -1) => onInput({ type: 'angle', step }), [onInput]);
  const onPower = useCallback((step: 1 | -1) => onInput({ type: 'power', step }), [onInput]);
  const onFire = useCallback(() => onInput({ type: 'fire' }), [onInput]);

  const locked = paused || state.status !== 'playing';
  const ready = acceptsInput(state);
  const finished = targetFinished(state);
  const { flight, angle, power, wind, wall, distance, sight } = state;

  // The ball along the real trajectory of the shot in the air: positions sampled at equal times.
  const ball = useMemo(() => {
    if (flight === null) return null;
    const input: number[] = [];
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i <= FLIGHT_SAMPLES; i++) {
      const at = positionAt(flight.angle, flight.power, wind, (flight.airTime * i) / FLIGHT_SAMPLES);
      input.push(i / FLIGHT_SAMPLES);
      xs.push(px(at.x) - BALL_PX / 2);
      ys.push(-Math.max(0, at.y) * scale);
    }
    return { translateX: progress.interpolate({ inputRange: input, outputRange: xs }), translateY: progress.interpolate({ inputRange: input, outputRange: ys }) };
  }, [flight, wind, px, scale, progress]);

  // « Viseur »: the first part of the trajectory of the current setting, as dots (up to the wall when it stops it).
  const dots = useMemo(() => {
    if (sight <= 0 || !ready) return [];
    const until = Math.min(sight * flightTime(angle, power), resolveShot({ distance, wind, wall }, angle, power).airTime);
    const step = flightTime(angle, power) / SIGHT_DOTS;
    const out: { left: number; bottom: number }[] = [];
    for (let time = step; time <= until + 1e-9; time += step) {
      const at = positionAt(angle, power, wind, time);
      out.push({ left: px(at.x) - 1.5, bottom: GROUND_PX + at.y * scale - 1.5 });
    }
    return out;
  }, [sight, ready, angle, power, distance, wind, wall, px, scale]);

  const armAngle = (angle * Math.PI) / 180;
  const marked = state.last;

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.target}
        </PixelText>
        <PixelText testID="hud-target">{t.hud.of(state.target, SHOT_TARGETS)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.shots}
        </PixelText>
        <PixelText testID="hud-shots">{String(state.shotsLeft)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.wind}
        </PixelText>
        <View style={styles.wind}>
          <WindArrow wind={wind} color={colors.text} size={8} />
          <PixelText testID="hud-wind" accessibilityValue={{ text: String(wind) }}>
            {String(Math.abs(wind))}
          </PixelText>
        </View>
      </View>
    </>
  );

  return (
    <GameFrame game="shot" frame={frame} score={state.score} hud={hud} testID="shot-screen">
      <View style={styles.column}>
        <View key={`target-${state.target}`} testID="shot-field" style={[styles.field, { width: fieldWidth, height: fieldHeight, backgroundColor: PALETTE.sky, borderColor: colors.border }]}>
          <View style={[styles.ground, { height: GROUND_PX, backgroundColor: PALETTE.darkGreen }]} />

          {/* The wind, big, in the sky: arrow and value. */}
          <View testID="shot-wind" accessibilityValue={{ text: String(wind) }} style={styles.windSign}>
            <PixelText size={8} style={styles.onSky}>
              {t.hud.wind}
            </PixelText>
            <WindArrow wind={wind} color={PALETTE.outline} size={12} />
            <PixelText bold style={styles.onSky}>
              {String(Math.abs(wind))}
            </PixelText>
          </View>

          {/* Target: three nested bands on the ground, a flag on its centre, its distance below. */}
          {BAND_STRIPS.map((band) => (
            <View
              key={band.within}
              testID={`shot-band-${band.within}`}
              style={[styles.band, { left: px(distance - band.within), width: 2 * band.within * scale, height: band.height, bottom: GROUND_PX - 4, backgroundColor: band.color }]}
            />
          ))}
          <View style={[styles.pole, { left: px(distance) - 1, bottom: GROUND_PX + 9 }]} />
          <View style={[styles.flag, { left: px(distance) + 1, bottom: GROUND_PX + 17 }]} />
          <View style={[styles.label, { left: px(distance) - 40, bottom: 1 }]}>
            <PixelText testID="shot-distance" size={8} style={styles.onGround}>{`${distance} m`}</PixelText>
          </View>

          {wall !== null && (
            <>
              <View testID="shot-wall" accessibilityValue={{ text: String(wall) }} style={[styles.wall, { left: px(wallDistance(state)) - 3, height: Math.round(wall * scale), bottom: GROUND_PX }]} />
              <View style={[styles.label, { left: px(wallDistance(state)) - 40, bottom: GROUND_PX + Math.round(wall * scale) + 2 }]}>
                <PixelText size={8} style={styles.onSky}>{`${wall} m`}</PixelText>
              </View>
            </>
          )}

          {/* Catapult: a base and an arm that leans at the chosen angle. */}
          <View style={[styles.base, { left: px(0) - 8, bottom: GROUND_PX }]} />
          <View
            testID="shot-catapult"
            style={[
              styles.arm,
              { left: px(0) + (Math.cos(armAngle) * ARM_PX) / 2 - ARM_PX / 2, bottom: GROUND_PX + 4 + (Math.sin(armAngle) * ARM_PX) / 2, transform: [{ rotate: `${-angle}deg` }] },
            ]}
          />

          {dots.length > 0 && (
            <View testID="shot-sight" accessibilityValue={{ text: String(dots.length) }} pointerEvents="none" style={StyleSheet.absoluteFill}>
              {dots.map((dot, i) => (
                <View key={i} style={[styles.dot, dot]} />
              ))}
            </View>
          )}

          {/* The last landing point stays marked, with its distance. */}
          {marked && (
            <>
              <View testID="shot-landing" accessibilityValue={{ text: String(Math.round(marked.landing)) }} pointerEvents="none" style={[styles.mark, { left: px(marked.landing) - 5, bottom: GROUND_PX - 5 }]} />
              <View pointerEvents="none" style={[styles.label, { left: px(marked.landing) - 40, bottom: GROUND_PX + 26 }]}>
                <PixelText size={8} bold style={styles.onSky}>{`${Math.round(marked.landing)} m`}</PixelText>
              </View>
            </>
          )}

          {ball && <Animated.View testID="shot-ball" pointerEvents="none" style={[styles.ball, { bottom: GROUND_PX - BALL_PX / 2, transform: [{ translateX: ball.translateX }, { translateY: ball.translateY }] }]} />}
        </View>

        <View style={styles.message}>
          {last && finished && (
            <PixelText key={`last-${last.target}`} testID="shot-last" color={last.points > 0 ? 'success' : 'danger'} bold>
              {last.points > 0 ? `+${last.points}` : '0'}
            </PixelText>
          )}
        </View>

        <View style={styles.controls}>
          <Stepper name="angle" label={t.play.angle} value={`${angle}°`} less={t.play.less} more={t.play.more} disabled={locked} onStep={onAngle} />
          <Stepper name="power" label={t.play.power} value={String(power)} less={t.play.less} more={t.play.more} disabled={locked} onStep={onPower} />
          <Button label={t.play.shoot} onPress={onFire} disabled={locked} testID="shot-fire" />
        </View>
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.sm },
  field: { borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  ground: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  windSign: { position: 'absolute', left: spacing.sm, top: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wind: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  arrow: { flexDirection: 'row', alignItems: 'center' },
  onSky: { color: PALETTE.outline },
  onGround: { color: PALETTE.white },
  band: { position: 'absolute', borderWidth: 1, borderColor: PALETTE.outline },
  pole: { position: 'absolute', width: 2, height: 18, backgroundColor: PALETTE.outline },
  flag: { position: 'absolute', width: 9, height: 7, backgroundColor: PALETTE.red, borderWidth: 1, borderColor: PALETTE.outline },
  label: { position: 'absolute', width: 80, alignItems: 'center' },
  wall: { position: 'absolute', width: 6, backgroundColor: PALETTE.brown, borderWidth: 1, borderColor: PALETTE.outline },
  base: { position: 'absolute', width: 16, height: 8, backgroundColor: PALETTE.darkBrown, borderWidth: 1, borderColor: PALETTE.outline },
  arm: { position: 'absolute', width: ARM_PX, height: 4, backgroundColor: PALETTE.brown, borderWidth: 1, borderColor: PALETTE.outline },
  dot: { position: 'absolute', width: 3, height: 3, borderRadius: 1.5, backgroundColor: PALETTE.outline },
  mark: { position: 'absolute', width: 10, height: 10, backgroundColor: PALETTE.orange, borderWidth: 2, borderColor: PALETTE.outline, transform: [{ rotate: '45deg' }] },
  ball: { position: 'absolute', left: 0, width: BALL_PX, height: BALL_PX, borderRadius: BALL_PX / 2, backgroundColor: PALETTE.shade, borderWidth: 1, borderColor: PALETTE.outline },
  message: { minHeight: 24, alignItems: 'center', justifyContent: 'center' },
  controls: { alignSelf: 'stretch', gap: spacing.sm, paddingHorizontal: spacing.md },
  setting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  step: { width: 64, height: 52, borderRadius: radius.button, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 110, alignItems: 'center', gap: 2 },
  hudItem: { gap: 2 },
});
