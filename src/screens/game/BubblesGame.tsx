// « Bulles en Folie » screen: the shooter engine (src/game/bubbles) drawn in a Skia canvas. Hold to aim (the guide
// line follows the finger, with the bounces allowed by the « Visée » upgrade), release to shoot.
import { Canvas, createPicture, Picture, Skia, SkPicture } from '@shopify/react-native-skia';
import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { BUBBLES } from '../../art/sprites';
import { now } from '../../game/clock';
import { BUBBLE_COLS, BUBBLE_ROWS, BubbleState, cellCenter, Colour, createBubbles, LAUNCHER, Point, reduceBubbles, ROW_HEIGHT, simulateShot } from '../../game/bubbles/engine';
import { upgradeLevels } from '../../game/core/upgrades';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { recordSprite } from '../../ui/PixelSprite';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const SPRITE_PIXELS = 12;
const AIM_HOLD_MS = 500;
/** Height of the field in bubble units: the grid plus the launcher row. */
const FIELD_UNITS = 0.5 + (BUBBLE_ROWS + 1) * ROW_HEIGHT + 0.5;

function bubblePictures(unit: number): Record<Colour, SkPicture> {
  const scale = unit / SPRITE_PIXELS;
  const out = {} as Record<Colour, SkPicture>;
  for (const colour of Object.keys(BUBBLES) as Colour[]) out[colour] = recordSprite(BUBBLES[colour], scale);
  return out;
}

/** Angle (degrees from the horizontal, 90 = up) from the launcher to a touch point in bubble units. */
export function aimAngle(touch: Point): number {
  const angle = (Math.atan2(LAUNCHER.y - touch.y, touch.x - LAUNCHER.x) * 180) / Math.PI;
  return Math.max(10, Math.min(170, angle));
}

function fieldPicture(state: BubbleState, unit: number, sprites: Record<Colour, SkPicture>, guide: readonly Point[] | null, guideColor: string, lineColor: string): SkPicture {
  const width = BUBBLE_COLS * unit;
  const height = FIELD_UNITS * unit;
  const draw = (canvas: Parameters<Parameters<typeof createPicture>[0]>[0], colour: Colour, centre: Point) => {
    canvas.save();
    canvas.translate((centre.x - 0.5) * unit, (centre.y - 0.5) * unit);
    canvas.drawPicture(sprites[colour]);
    canvas.restore();
  };
  return createPicture((canvas) => {
    // Danger line: the bottom row.
    const line = Skia.Paint();
    line.setColor(Skia.Color(lineColor));
    line.setStyle(1);
    line.setStrokeWidth(1);
    const dangerY = (0.5 + (BUBBLE_ROWS - 1) * ROW_HEIGHT + 0.5) * unit;
    canvas.drawLine(0, dangerY, width, dangerY, line);
    state.board.forEach((row, r) =>
      row.forEach((colour, c) => {
        if (colour) draw(canvas, colour, cellCenter(c, r, state.shift));
      }),
    );
    if (guide && guide.length > 1) {
      const paint = Skia.Paint();
      paint.setColor(Skia.Color(guideColor));
      paint.setStyle(1);
      paint.setStrokeWidth(2);
      for (let i = 1; i < guide.length; i++) canvas.drawLine(guide[i - 1].x * unit, guide[i - 1].y * unit, guide[i].x * unit, guide[i].y * unit, paint);
    }
    draw(canvas, state.current, LAUNCHER);
    state.queue.slice(0, state.next).forEach((colour, i) => draw(canvas, colour, { x: LAUNCHER.x + 1.2 + i * 0.9, y: LAUNCHER.y + 0.1 }));
  }, { x: 0, y: 0, width, height });
}

export function BubblesGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const unit = Math.floor(Math.min((width - 2 * spacing.md) / BUBBLE_COLS, (height - 220) / FIELD_UNITS));
  const sprites = useMemo(() => bubblePictures(unit), [unit]);

  const [state, setState] = useState(() => createBubbles(seed, upgradeLevels(save, 'bubbles')));
  const stateRef = useRef(state);
  const [angle, setAngle] = useState<number | null>(null);
  const steps = useMemo(
    () => [
      { key: 'aim', text: t.tutorial.bubbles.aim },
      { key: 'shoot', text: t.tutorial.bubbles.shoot },
    ],
    [t],
  );
  const frame = useRoundFrame({ game: 'bubbles', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, advanceTutorial, finish, setCombos } = frame;
  useGameFeedback(state.events);

  const shoot = useCallback(
    (degrees: number) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceBubbles(previous, { type: 'shoot', angle: degrees });
      stateRef.current = next;
      setState(next);
      if (next.events.some((e) => e.kind === 'shot')) advanceTutorial('shoot');
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [advanceTutorial, finish, setCombos],
  );

  const inputsLocked = paused || state.status !== 'playing';
  const holdStart = useRef(0);
  const aimed = useRef(false);
  /* eslint-disable react-hooks/refs -- the gesture callbacks run on touch events, never during render */
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .withTestId('bubbles-pan')
        .runOnJS(true)
        .minDistance(0)
        .onBegin((e) => {
          holdStart.current = now();
          aimed.current = false;
          setAngle(aimAngle({ x: e.x / unit, y: e.y / unit }));
        })
        .onUpdate((e) => {
          setAngle(aimAngle({ x: e.x / unit, y: e.y / unit }));
          if (!aimed.current && now() - holdStart.current >= AIM_HOLD_MS) {
            aimed.current = true;
            advanceTutorial('aim');
          }
        })
        .onEnd((e) => {
          const degrees = aimAngle({ x: e.x / unit, y: e.y / unit });
          setAngle(null);
          if (inputsLocked) return;
          shoot(degrees);
        })
        .onFinalize(() => setAngle(null)),
    [advanceTutorial, inputsLocked, shoot, unit],
  );
  /* eslint-enable react-hooks/refs */

  const guide = useMemo(() => {
    if (angle === null || inputsLocked) return null;
    const shot = simulateShot(state.board, angle, state.shift);
    return shot.path.slice(0, state.aim + 2);
  }, [angle, inputsLocked, state.board, state.shift, state.aim]);
  const picture = useMemo(() => fieldPicture(state, unit, sprites, guide, colors.accent, colors.danger), [state, unit, sprites, guide, colors.accent, colors.danger]);

  const hud = (
    <View style={styles.hudItem}>
      <PixelText size={8} color="muted">
        {t.hud.nextRow(state.shotsUntilPush)}
      </PixelText>
      <PixelText testID="hud-shots">{String(state.shotsFired)}</PixelText>
    </View>
  );

  return (
    <GameFrame game="bubbles" frame={frame} score={state.score} hud={hud} testID="bubbles-screen">
      <GestureDetector gesture={pan}>
        <View testID="bubbles-board" style={[styles.board, { width: BUBBLE_COLS * unit, height: Math.round(FIELD_UNITS * unit), backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Canvas style={StyleSheet.absoluteFill}>
            <Picture picture={picture} />
          </Canvas>
          {/* Invisible launcher target: Maestro swipes up from it (the gesture reads the touch point). */}
          <View testID="bubbles-launcher" pointerEvents="none" style={{ position: 'absolute', left: (LAUNCHER.x - 0.5) * unit, top: (LAUNCHER.y - 0.5) * unit, width: unit, height: unit }} />
        </View>
      </GestureDetector>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  board: { borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  hudItem: { gap: 2 },
});
