// « Potager Fou » screen: the match-3 engine (src/game/garden) drawn in a Skia canvas; a swipe on a vegetable
// towards a neighbour dispatches a swap. Turn-based: the engine settles the swap at once (HUD, score, moves),
// then the screen replays it for the eye (slide, flash of the aligned pieces with the points, pop, fall) from the
// pure replay plan (src/game/garden/replay). Inputs are locked while the replay runs.
import { Canvas, createPicture, Picture, Skia, SkPicture } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { VEGETABLES } from '../../art/sprites';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { Board, Cell, createGarden, GARDEN_COLS, GARDEN_ROWS, reduceGarden, Veg } from '../../game/garden/engine';
import { buildReplay, Phase } from '../../game/garden/replay';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { recordSprite } from '../../ui/PixelSprite';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const SPRITE_PIXELS = 12;
const SWIPE_PX = 18;

function vegPictures(cell: number): Record<Veg, SkPicture> {
  const scale = (cell - 4) / SPRITE_PIXELS;
  const out = {} as Record<Veg, SkPicture>;
  for (const veg of Object.keys(VEGETABLES) as Veg[]) out[veg] = recordSprite(VEGETABLES[veg], scale);
  return out;
}

type Frame = { phase: Phase; progress: number };
type Colors = { grid: string; select: string; flash: string };

const sameCell = (a: Cell, b: Cell) => a.col === b.col && a.row === b.row;
const easeOut = (p: number) => 1 - (1 - p) * (1 - p);

/** The board of the current frame: the settled board, or the phase of the replay at `progress` (0..1). */
function boardPicture(board: Board, cell: number, sprites: Record<Veg, SkPicture>, colors: Colors, selected: Cell | null, frame: Frame | null): SkPicture {
  const width = GARDEN_COLS * cell;
  const height = GARDEN_ROWS * cell;
  return createPicture((canvas) => {
    const grid = Skia.Paint();
    grid.setColor(Skia.Color(colors.grid));
    grid.setStyle(1);
    grid.setStrokeWidth(1);
    for (let c = 1; c < GARDEN_COLS; c++) canvas.drawLine(c * cell, 0, c * cell, height, grid);
    for (let r = 1; r < GARDEN_ROWS; r++) canvas.drawLine(0, r * cell, width, r * cell, grid);
    if (selected && !frame) {
      const paint = Skia.Paint();
      paint.setColor(Skia.Color(colors.select));
      paint.setStyle(1);
      paint.setStrokeWidth(3);
      canvas.drawRect({ x: selected.col * cell + 2, y: selected.row * cell + 2, width: cell - 4, height: cell - 4 }, paint);
    }

    const phase = frame?.phase;
    const p = frame?.progress ?? 0;
    const shown = phase ? phase.board : board;
    const flashing = phase && phase.kind === 'flash';
    if (flashing) {
      // Frame + pulsing glow on the aligned pieces (two pulses over the phase).
      const glow = Skia.Paint();
      glow.setColor(Skia.Color(colors.flash));
      glow.setAlphaf(0.25 + 0.3 * (0.5 + 0.5 * Math.sin(p * Math.PI * 4)));
      const outline = Skia.Paint();
      outline.setColor(Skia.Color(colors.flash));
      outline.setStyle(1);
      outline.setStrokeWidth(3);
      for (const c of phase.cells) {
        canvas.drawRect({ x: c.col * cell, y: c.row * cell, width: cell, height: cell }, glow);
        canvas.drawRect({ x: c.col * cell + 1.5, y: c.row * cell + 1.5, width: cell - 3, height: cell - 3 }, outline);
      }
    }

    shown.forEach((row, r) =>
      row.forEach((veg, c) => {
        let x = c * cell + 2;
        let y = r * cell + 2;
        let scale = 1;
        if (phase) {
          const here = { col: c, row: r };
          if (phase.kind === 'swap' || phase.kind === 'swap_back') {
            // The two pieces trade places (swap: from → to; swap_back: the swapped pieces return).
            const target = sameCell(here, phase.from) ? phase.to : sameCell(here, phase.to) ? phase.from : null;
            if (target) {
              const q = easeOut(p);
              x += (target.col - c) * cell * q;
              y += (target.row - r) * cell * q;
            }
          } else if (phase.kind === 'pop') {
            if (phase.cells.some((cc) => sameCell(cc, here))) scale = 1 - p;
          } else if (phase.kind === 'fall') {
            y -= phase.fallen[r][c] * cell * (1 - easeOut(p));
          }
        }
        if (scale <= 0) return;
        canvas.save();
        canvas.translate(x, y);
        if (scale < 1) {
          const half = (cell - 4) / 2;
          canvas.translate(half, half);
          canvas.scale(scale, scale);
          canvas.translate(-half, -half);
        }
        canvas.drawPicture(sprites[veg]);
        canvas.restore();
      }),
    );
  }, { x: 0, y: 0, width, height });
}

export function GardenGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const cell = Math.floor(Math.min((width - 2 * spacing.md) / GARDEN_COLS, (height - 220) / GARDEN_ROWS));
  const sprites = useMemo(() => vegPictures(cell), [cell]);

  const [state, setState] = useState(() => createGarden(seed, upgradeLevels(save, 'garden')));
  const stateRef = useRef(state);
  const [selected, setSelected] = useState<Cell | null>(null);
  const steps = useMemo(() => [{ key: 'swap', text: t.tutorial.garden.swap }], [t]);
  const frame = useRoundFrame({ game: 'garden', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, advanceTutorial, finish, setCombos } = frame;
  useGameFeedback(state.events);

  // Replay of the last swap: phases and the frame being drawn.
  const replay = useRef<{ phases: Phase[]; index: number; startedAt: number } | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [shownFrame, setShownFrame] = useState<Frame | null>(null);
  const lastFrame = useRef<{ index: number; progress: number } | null>(null);

  const swap = useCallback(
    (from: Cell, to: Cell) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceGarden(previous, { type: 'swap', from, to });
      stateRef.current = next;
      setState(next);
      const phases = buildReplay(previous.board, next);
      if (phases.length > 0) {
        replay.current = { phases, index: 0, startedAt: now() };
        lastFrame.current = { index: 0, progress: 0 };
        setShownFrame({ phase: phases[0], progress: 0 });
        setReplaying(true);
      }
      if (next.events.some((e) => e.kind === 'swap')) advanceTutorial('swap');
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [advanceTutorial, finish, setCombos],
  );

  // Frame loop of the replay: advances through the phases by elapsed time, then shows the settled board.
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
      let elapsed = now() - current.startedAt; // injectable clock: Jest drives the replay deterministically
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
      // Re-render only when the drawing changes (a frozen clock, as in Jest, must not flood React with renders).
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
  const origin = useRef<Cell | null>(null);
  /* eslint-disable react-hooks/refs -- the gesture callbacks run on touch events, never during render */
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .withTestId('garden-pan')
        .runOnJS(true)
        .minDistance(4)
        .onBegin((e) => {
          const col = Math.floor(e.x / cell);
          const row = Math.floor(e.y / cell);
          origin.current = col >= 0 && col < GARDEN_COLS && row >= 0 && row < GARDEN_ROWS ? { col, row } : null;
          setSelected(origin.current);
        })
        .onEnd((e) => {
          const from = origin.current;
          origin.current = null;
          setSelected(null);
          if (inputsLocked || !from) return;
          const dx = e.translationX;
          const dy = e.translationY;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
          const to = Math.abs(dx) > Math.abs(dy) ? { col: from.col + Math.sign(dx), row: from.row } : { col: from.col, row: from.row + Math.sign(dy) };
          if (to.col < 0 || to.col >= GARDEN_COLS || to.row < 0 || to.row >= GARDEN_ROWS) return;
          swap(from, to);
        })
        .onFinalize(() => {
          origin.current = null;
          setSelected(null);
        }),
    [cell, inputsLocked, swap],
  );
  /* eslint-enable react-hooks/refs */

  const paletteColors = useMemo<Colors>(() => ({ grid: colors.border, select: colors.accent, flash: colors.accent }), [colors.border, colors.accent]);
  const picture = useMemo(() => boardPicture(state.board, cell, sprites, paletteColors, selected, shownFrame), [state.board, cell, sprites, paletteColors, selected, shownFrame]);

  // Points popping above the aligned pieces during the flash and pop phases.
  const pop = useMemo(() => {
    const phase = shownFrame?.phase;
    if (!phase || (phase.kind !== 'flash' && phase.kind !== 'pop')) return null;
    const points = phase.kind === 'flash' ? phase.points : null;
    if (points === null) return null;
    const cx = phase.cells.reduce((s, c) => s + c.col + 0.5, 0) / phase.cells.length;
    const top = Math.min(...phase.cells.map((c) => c.row));
    return { text: `+${Math.round(points)}`, left: cx * cell, top: Math.max(0, top * cell - 10) };
  }, [shownFrame, cell]);

  const hud = (
    <View style={styles.hudItem}>
      <PixelText size={8} color="muted">
        {t.hud.moves}
      </PixelText>
      <PixelText testID="hud-moves">{String(state.movesLeft)}</PixelText>
    </View>
  );

  return (
    <GameFrame game="garden" frame={frame} score={state.score} hud={hud} testID="garden-screen">
      <GestureDetector gesture={pan}>
        <View testID="garden-board" style={[styles.board, { width: GARDEN_COLS * cell, height: GARDEN_ROWS * cell, backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Canvas style={StyleSheet.absoluteFill}>
            <Picture picture={picture} />
          </Canvas>
          {/* Invisible cell targets: Maestro swipes from `garden-cell-<col>-<row>` (the gesture reads the touch point). */}
          {state.board.map((row, r) =>
            row.map((_, c) => <View key={`${c}-${r}`} testID={`garden-cell-${c}-${r}`} pointerEvents="none" style={{ position: 'absolute', left: c * cell, top: r * cell, width: cell, height: cell }} />),
          )}
          {pop && (
            <View pointerEvents="none" style={[styles.pop, { left: pop.left - 60, top: pop.top }]}>
              <PixelText testID="garden-points-pop" color="accent" bold style={styles.popText}>
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
