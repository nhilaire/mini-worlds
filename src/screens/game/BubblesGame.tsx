// « Bulles en Folie » screen: the shooter engine (src/game/bubbles) drawn in a Skia canvas. Hold to aim (the guide
// line follows the finger, with the bounces allowed by the « Visée » upgrade), release to shoot. The engine settles
// the shot at once (HUD, score); the screen then replays it for the eye from the pure replay plan
// (src/game/bubbles/replay): flight with bounces, glow of the popped group with its points, pop, fall of the
// disconnected bubbles, slide of a pushed row. Inputs are locked while the replay runs.
import { Canvas, createPicture, Picture, Skia, SkPicture } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { BUBBLES } from '../../art/sprites';
import { now } from '../../game/clock';
import { BUBBLE_COLS, BUBBLE_ROWS, BubbleBoard, Cell, cellCenter, Colour, createBubbles, LAUNCHER, Point, reduceBubbles, ROW_HEIGHT, Shift, simulateShot } from '../../game/bubbles/engine';
import { buildReplay, Phase, pointAlong } from '../../game/bubbles/replay';
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

type Frame = { phase: Phase; progress: number };
type Colors = { guide: string; danger: string; flash: string };

const easeOut = (p: number) => 1 - (1 - p) * (1 - p);
const easeIn = (p: number) => p * p;
const sameCell = (a: Cell, b: Cell) => a.col === b.col && a.row === b.row;

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

type FieldView = { board: BubbleBoard; shift: Shift; current: Colour; queue: readonly Colour[]; next: number };

function fieldPicture(view: FieldView, unit: number, sprites: Record<Colour, SkPicture>, guide: readonly Point[] | null, colors: Colors, frame: Frame | null): SkPicture {
  const width = BUBBLE_COLS * unit;
  const height = FIELD_UNITS * unit;
  const draw = (canvas: Parameters<Parameters<typeof createPicture>[0]>[0], colour: Colour, centre: Point, scale = 1) => {
    canvas.save();
    canvas.translate((centre.x - 0.5) * unit, (centre.y - 0.5) * unit);
    if (scale !== 1) {
      canvas.translate(unit / 2, unit / 2);
      canvas.scale(scale, scale);
      canvas.translate(-unit / 2, -unit / 2);
    }
    canvas.drawPicture(sprites[colour]);
    canvas.restore();
  };
  return createPicture((canvas) => {
    // Danger line: the bottom row.
    const line = Skia.Paint();
    line.setColor(Skia.Color(colors.danger));
    line.setStyle(1);
    line.setStrokeWidth(1);
    const dangerY = (0.5 + (BUBBLE_ROWS - 1) * ROW_HEIGHT + 0.5) * unit;
    canvas.drawLine(0, dangerY, width, dangerY, line);

    const phase = frame?.phase;
    const p = frame?.progress ?? 0;
    const board = phase ? phase.board : view.board;
    const shift = phase ? phase.shift : view.shift;
    // A pushed row: the whole stack slides down from one row above.
    const slide = phase && phase.kind === 'push' ? -ROW_HEIGHT * (1 - easeOut(p)) : 0;

    if (phase && phase.kind === 'flash') {
      const glow = Skia.Paint();
      glow.setColor(Skia.Color(colors.flash));
      glow.setAlphaf(0.25 + 0.3 * (0.5 + 0.5 * Math.sin(p * Math.PI * 4)));
      const ring = Skia.Paint();
      ring.setColor(Skia.Color(colors.flash));
      ring.setStyle(1);
      ring.setStrokeWidth(3);
      for (const c of phase.cells) {
        const centre = cellCenter(c.col, c.row, shift);
        canvas.drawCircle(centre.x * unit, centre.y * unit, 0.56 * unit, glow);
        canvas.drawCircle(centre.x * unit, centre.y * unit, 0.5 * unit, ring);
      }
    }

    board.forEach((row, r) =>
      row.forEach((colour, c) => {
        if (!colour) return;
        const centre = cellCenter(c, r, shift);
        let scale = 1;
        if (phase && phase.kind === 'pop' && phase.cells.some((cell) => sameCell(cell, { col: c, row: r }))) scale = 1 - p;
        if (scale <= 0) return;
        draw(canvas, colour, { x: centre.x, y: centre.y + slide }, scale);
      }),
    );

    if (phase && phase.kind === 'fall') {
      // The disconnected bubbles drop out of the field, accelerating.
      const dy = easeIn(p) * FIELD_UNITS;
      phase.cells.forEach((c, i) => {
        const centre = cellCenter(c.col, c.row, shift);
        draw(canvas, phase.colours[i], { x: centre.x, y: centre.y + dy });
      });
    }

    if (phase && phase.kind === 'fly') draw(canvas, phase.colour, pointAlong(phase.path, p));

    if (guide && guide.length > 1 && !phase) {
      const paint = Skia.Paint();
      paint.setColor(Skia.Color(colors.guide));
      paint.setStyle(1);
      paint.setStrokeWidth(2);
      for (let i = 1; i < guide.length; i++) canvas.drawLine(guide[i - 1].x * unit, guide[i - 1].y * unit, guide[i].x * unit, guide[i].y * unit, paint);
    }
    draw(canvas, view.current, LAUNCHER);
    view.queue.slice(0, view.next).forEach((colour, i) => draw(canvas, colour, { x: LAUNCHER.x + 1.2 + i * 0.9, y: LAUNCHER.y + 0.1 }));
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

  // Replay of the last shot: phases and the frame being drawn.
  const replay = useRef<{ phases: Phase[]; index: number; startedAt: number } | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [shownFrame, setShownFrame] = useState<Frame | null>(null);
  const lastFrame = useRef<{ index: number; progress: number } | null>(null);

  const shoot = useCallback(
    (degrees: number) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceBubbles(previous, { type: 'shoot', angle: degrees });
      stateRef.current = next;
      setState(next);
      const phases = buildReplay(previous.board, previous.shift, next);
      if (phases.length > 0) {
        replay.current = { phases, index: 0, startedAt: now() };
        lastFrame.current = { index: 0, progress: 0 };
        setShownFrame({ phase: phases[0], progress: 0 });
        setReplaying(true);
      }
      if (next.events.some((e) => e.kind === 'shot')) advanceTutorial('shoot');
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [advanceTutorial, finish, setCombos],
  );

  // Frame loop of the replay: advances through the phases by elapsed time (injectable clock), then shows the
  // settled field. Re-renders only when the drawing changes.
  useEffect(() => {
    if (!replaying) return;
    let handle = 0;
    const loop = () => {
      const current = replay.current;
      if (!current) {
        setShownFrame(null);
        setReplaying(false);
        return;
      }
      let phase = current.phases[current.index];
      let elapsed = now() - current.startedAt;
      while (elapsed >= phase.ms) {
        current.index += 1;
        current.startedAt += phase.ms;
        elapsed -= phase.ms;
        if (current.index >= current.phases.length) {
          replay.current = null;
          setShownFrame(null);
          setReplaying(false);
          return;
        }
        phase = current.phases[current.index];
      }
      const progress = elapsed / phase.ms;
      const last = lastFrame.current;
      if (!last || last.index !== current.index || Math.abs(last.progress - progress) >= 0.004) {
        lastFrame.current = { index: current.index, progress };
        setShownFrame({ phase, progress });
      }
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [replaying]);

  const inputsLocked = paused || replaying || state.status !== 'playing';
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
  const paletteColors = useMemo<Colors>(() => ({ guide: colors.accent, danger: colors.danger, flash: colors.accent }), [colors.accent, colors.danger]);
  const { board, shift, current: currentColour, queue, next } = state;
  const view = useMemo<FieldView>(() => ({ board, shift, current: currentColour, queue, next }), [board, shift, currentColour, queue, next]);
  const picture = useMemo(() => fieldPicture(view, unit, sprites, guide, paletteColors, shownFrame), [view, unit, sprites, guide, paletteColors, shownFrame]);

  // Points popping above the popped group (flash and pop phases) and above the dropped bubbles (fall phase).
  const pop = useMemo(() => {
    const phase = shownFrame?.phase;
    if (!phase || (phase.kind !== 'flash' && phase.kind !== 'pop' && phase.kind !== 'fall')) return null;
    const points = phase.kind === 'flash' || phase.kind === 'fall' ? phase.points : null;
    if (points === null) return null;
    const centres = phase.cells.map((c) => cellCenter(c.col, c.row, phase.shift));
    const cx = centres.reduce((s, c) => s + c.x, 0) / centres.length;
    const top = Math.min(...centres.map((c) => c.y)) - 0.5;
    return { text: `+${points}`, left: cx * unit, top: Math.max(0, top * unit - 10) };
  }, [shownFrame, unit]);

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
          {pop && (
            <View pointerEvents="none" style={[styles.pop, { left: pop.left - 60, top: pop.top }]}>
              <PixelText testID="bubbles-points-pop" color="accent" bold style={styles.popText}>
                {pop.text}
              </PixelText>
            </View>
          )}
        </View>
      </GestureDetector>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  board: { borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  hudItem: { gap: 2 },
  pop: { position: 'absolute', width: 120, alignItems: 'center' },
  popText: { textShadowColor: 'rgba(0, 0, 0, 0.35)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 1 },
});
