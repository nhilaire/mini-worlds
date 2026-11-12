// « Pluie de Blocs » screen: the pure engine (src/game/blocks) drives a Skia canvas; gestures and a frame loop
// feed it actions. HUD values are React Native texts (Maestro reads them; the canvas is proven by screenshots).
import { Canvas, createPicture, Picture, Skia, SkPicture } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { PALETTE, TETROMINO_COLORS } from '../../art/palette';
import { BLOCK_TILE } from '../../art/sprites';
import { BLOCKS_COLS, BLOCKS_ROWS, BlocksState, createBlocks, displayLevel, ghostPiece, pieceCells, reduceBlocks, Tetromino, TETROMINOES, visibleQueue } from '../../game/blocks/engine';
import { upgradeLevels } from '../../game/core/upgrades';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { recordSprite } from '../../ui/PixelSprite';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const TILE_PIXELS = 8;
const SWIPE_DOWN_PX = 48;

function darker(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.round(v * 0.6));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f).map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** One picture per tetromino colour, scaled to the cell. */
function tilePictures(cell: number): Record<Tetromino, SkPicture> {
  const scale = cell / TILE_PIXELS;
  const out = {} as Record<Tetromino, SkPicture>;
  for (const type of TETROMINOES) {
    const base = PALETTE[TETROMINO_COLORS[type]];
    out[type] = recordSprite(BLOCK_TILE, scale, { white: base, light: '#FFFFFF', shade: darker(base) });
  }
  return out;
}

function boardPicture(state: BlocksState, cell: number, tiles: Record<Tetromino, SkPicture>, gridColor: string, ghostColor: string): SkPicture {
  const width = BLOCKS_COLS * cell;
  const height = BLOCKS_ROWS * cell;
  return createPicture((canvas) => {
    const grid = Skia.Paint();
    grid.setColor(Skia.Color(gridColor));
    grid.setStrokeWidth(1);
    grid.setStyle(1); // stroke
    for (let c = 1; c < BLOCKS_COLS; c++) canvas.drawLine(c * cell, 0, c * cell, height, grid);
    for (let r = 1; r < BLOCKS_ROWS; r++) canvas.drawLine(0, r * cell, width, r * cell, grid);
    state.board.forEach((row, r) =>
      row.forEach((type, c) => {
        if (!type) return;
        canvas.save();
        canvas.translate(c * cell, r * cell);
        canvas.drawPicture(tiles[type]);
        canvas.restore();
      }),
    );
    // The ghost outline exists for the first pieces of the round only (engine rule); the piece is always drawn.
    const ghost = ghostPiece(state);
    if (ghost) {
      const paint = Skia.Paint();
      paint.setColor(Skia.Color(ghostColor));
      paint.setStyle(1);
      paint.setStrokeWidth(2);
      for (const [c, r] of pieceCells(ghost)) canvas.drawRect({ x: c * cell + 2, y: r * cell + 2, width: cell - 4, height: cell - 4 }, paint);
    }
    if (state.piece) {
      for (const [c, r] of pieceCells(state.piece)) {
        canvas.save();
        canvas.translate(c * cell, r * cell);
        canvas.drawPicture(tiles[state.piece.type]);
        canvas.restore();
      }
    }
  }, { x: 0, y: 0, width, height });
}

function previewPicture(queue: readonly Tetromino[], cell: number, tiles: Record<Tetromino, SkPicture>): SkPicture {
  return createPicture((canvas) => {
    queue.forEach((type, i) => {
      const cells = pieceCells({ type, rotation: 0, x: 0, y: 0 });
      for (const [c, r] of cells) {
        canvas.save();
        canvas.translate(c * cell, (i * 3 + r) * cell);
        canvas.drawPicture(tiles[type]);
        canvas.restore();
      }
    });
  }, { x: 0, y: 0, width: 4 * cell, height: Math.max(1, queue.length) * 3 * cell });
}

const TUTORIAL = [
  { key: 'move', text: 'move' },
  { key: 'rotate', text: 'rotate' },
  { key: 'drop', text: 'drop' },
] as const;

export function BlocksGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const cell = Math.floor(Math.min((width - 2 * spacing.md - 60) / BLOCKS_COLS, (height - 220) / BLOCKS_ROWS));
  const tiles = useMemo(() => tilePictures(cell), [cell]);

  const [state, setState] = useState(() => createBlocks(seed, upgradeLevels(save, 'blocks')));
  const stateRef = useRef(state);
  const steps = useMemo(() => TUTORIAL.map((s) => ({ key: s.key, text: t.tutorial.blocks[s.key] })), [t]);
  const frame = useRoundFrame({ game: 'blocks', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  useGameFeedback(state.events);

  // Every action goes through here: the engine stays the single source of truth.
  const dispatch = useCallback(
    (action: Parameters<typeof reduceBlocks>[1]) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceBlocks(previous, action);
      stateRef.current = next;
      // Re-render only when something visible changed (ticks mostly accumulate time).
      if (next.piece !== previous.piece || next.board !== previous.board || next.status !== previous.status || next.events.length > 0) setState(next);
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [finish, setCombos],
  );

  // Frame loop: ticks the engine with the elapsed time while the round is active, and at the slow tutorial
  // interval while a help bubble is shown (the piece keeps falling gently instead of freezing).
  const tutorial = frame.tutorialStep !== null && !paused;
  useEffect(() => {
    if (!active && !tutorial) return;
    let last = 0;
    let handle = 0;
    const loop = (time: number) => {
      if (last > 0) dispatch({ type: 'tick', dt: Math.min(100, time - last), tutorial });
      last = time;
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [active, tutorial, dispatch]);

  const inputsLocked = paused || state.status !== 'playing';
  const dragCells = useRef(0);
  /* eslint-disable react-hooks/refs -- the gesture callbacks run on touch events, never during render */
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .withTestId('blocks-pan')
        .runOnJS(true)
        .minDistance(8)
        .onStart(() => {
          dragCells.current = 0;
        })
        .onUpdate((e) => {
          if (inputsLocked) return;
          const cells = Math.trunc(e.translationX / cell);
          while (dragCells.current < cells) {
            dispatch({ type: 'move', dx: 1 });
            dragCells.current += 1;
            advanceTutorial('move');
          }
          while (dragCells.current > cells) {
            dispatch({ type: 'move', dx: -1 });
            dragCells.current -= 1;
            advanceTutorial('move');
          }
        })
        .onEnd((e) => {
          if (inputsLocked) return;
          if (e.translationY > SWIPE_DOWN_PX && Math.abs(e.translationY) > Math.abs(e.translationX)) {
            dispatch({ type: 'hardDrop' });
            advanceTutorial('drop');
          }
        }),
    [advanceTutorial, cell, dispatch, inputsLocked],
  );
  const tap = useMemo(
    () =>
      Gesture.Tap()
        .withTestId('blocks-tap')
        .runOnJS(true)
        .onEnd(() => {
          if (inputsLocked) return;
          dispatch({ type: 'rotate' });
          advanceTutorial('rotate');
        }),
    [advanceTutorial, dispatch, inputsLocked],
  );
  /* eslint-enable react-hooks/refs */
  const gesture = useMemo(() => Gesture.Exclusive(pan, tap), [pan, tap]);

  const picture = useMemo(() => boardPicture(state, cell, tiles, colors.border, colors.muted), [state, cell, tiles, colors.border, colors.muted]);
  const queue = visibleQueue(state);
  const preview = useMemo(() => previewPicture(queue, Math.floor(cell / 2), tiles), [queue, cell, tiles]);

  const hud = (
    <View style={styles.hudItem}>
      <PixelText size={8} color="muted">
        {t.hud.lines}
      </PixelText>
      <PixelText testID="hud-lines">{`${state.lines} · ${t.hud.level(displayLevel(state.lines))}`}</PixelText>
    </View>
  );

  return (
    <GameFrame game="blocks" frame={frame} score={state.score} hud={hud} testID="blocks-screen">
      <View style={styles.row}>
        <GestureDetector gesture={gesture}>
          <View testID="blocks-board" style={[styles.board, { width: BLOCKS_COLS * cell, height: BLOCKS_ROWS * cell, backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Canvas style={StyleSheet.absoluteFill}>
              <Picture picture={picture} />
            </Canvas>
          </View>
        </GestureDetector>
        {queue.length > 0 && (
          <View testID="blocks-preview" style={[styles.preview, { width: 4 * Math.floor(cell / 2), height: queue.length * 3 * Math.floor(cell / 2) }]}>
            <Canvas style={StyleSheet.absoluteFill}>
              <Picture picture={preview} />
            </Canvas>
          </View>
        )}
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  board: { borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  preview: {},
  hudItem: { gap: 2 },
});
