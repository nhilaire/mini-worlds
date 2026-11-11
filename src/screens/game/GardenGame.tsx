// « Potager Fou » screen: the match-3 engine (src/game/garden) drawn in a Skia canvas; a swipe on a vegetable
// towards a neighbour dispatches a swap. Turn-based: no frame loop.
import { Canvas, createPicture, Picture, Skia, SkPicture } from '@shopify/react-native-skia';
import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { VEGETABLES } from '../../art/sprites';
import { upgradeLevels } from '../../game/core/upgrades';
import { Cell, createGarden, GARDEN_COLS, GARDEN_ROWS, GardenState, reduceGarden, Veg } from '../../game/garden/engine';
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

function boardPicture(state: GardenState, cell: number, sprites: Record<Veg, SkPicture>, gridColor: string, highlight: Cell | null, highlightColor: string): SkPicture {
  const width = GARDEN_COLS * cell;
  const height = GARDEN_ROWS * cell;
  return createPicture((canvas) => {
    const grid = Skia.Paint();
    grid.setColor(Skia.Color(gridColor));
    grid.setStyle(1);
    grid.setStrokeWidth(1);
    for (let c = 1; c < GARDEN_COLS; c++) canvas.drawLine(c * cell, 0, c * cell, height, grid);
    for (let r = 1; r < GARDEN_ROWS; r++) canvas.drawLine(0, r * cell, width, r * cell, grid);
    if (highlight) {
      const paint = Skia.Paint();
      paint.setColor(Skia.Color(highlightColor));
      paint.setStyle(1);
      paint.setStrokeWidth(3);
      canvas.drawRect({ x: highlight.col * cell + 2, y: highlight.row * cell + 2, width: cell - 4, height: cell - 4 }, paint);
    }
    state.board.forEach((row, r) =>
      row.forEach((veg, c) => {
        canvas.save();
        canvas.translate(c * cell + 2, r * cell + 2);
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

  const swap = useCallback(
    (from: Cell, to: Cell) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceGarden(previous, { type: 'swap', from, to });
      stateRef.current = next;
      setState(next);
      if (next.events.some((e) => e.kind === 'swap')) advanceTutorial('swap');
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [advanceTutorial, finish, setCombos],
  );

  const inputsLocked = paused || state.status !== 'playing';
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

  const picture = useMemo(() => boardPicture(state, cell, sprites, colors.border, selected, colors.accent), [state, cell, sprites, colors.border, selected, colors.accent]);

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
        </View>
      </GestureDetector>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  board: { borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  hudItem: { gap: 2 },
});
