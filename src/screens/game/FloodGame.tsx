// « Raz-de-Couleurs » screen: the flood-it engine (src/game/flood) drawn in one Skia canvas (the five bubble sprites,
// colour and face, with the tide outlined in white) and five colour buttons below it (`flood-colour-<name>`).
// Turn-based: the engine settles a tap at once (HUD, score, next board); the screen then pops the newly absorbed
// cells in (or the whole new board after a win) over POP_MS, driven by the injectable clock. Inputs are never locked
// by the animation. When the moves run out, the last board stays on screen for END_MS before the Result.
import { Canvas, createPicture, Picture, Skia, SkPicture } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { BUBBLES } from '../../art/sprites';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { Board, createFlood, FLOOD_COLOURS, FLOOD_SIZE, FloodColour, FloodState, reduceFlood, tideCells, tideColour } from '../../game/flood/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { PixelSprite, recordSprite } from '../../ui/PixelSprite';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { radius, spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const SPRITE_PIXELS = 12;
export const POP_MS = 220;
/** A won board shows its points this long (the next board pops in over POP_MS meanwhile). */
export const WIN_MS = 700;
/** The last board stays on screen this long before the Result. */
export const END_MS = 700;
/** Vertical room kept for the HUD, the colour buttons and the margins. */
const RESERVED_HEIGHT = 330;

/** Engine events → feedback names of the shared kit (tick per move, refused tap, clear on a won board...). */
const FEEDBACK_OF: Partial<Record<string, string>> = { flood: 'move', refused: 'drop', board_won: 'lines', combo: 'combo', over: 'over' };

/** Animation of the last tap: the cells popping in (indexes `row * 10 + col`), and the points of a won board. */
type Pop = { cells: readonly number[]; startedAt: number; ms: number; points: number | null };

const easeOutBack = (p: number) => {
  const c = 1.7;
  const q = p - 1;
  return 1 + (c + 1) * q * q * q + c * q * q;
};

function bubblePictures(cell: number): Record<FloodColour, SkPicture> {
  const scale = (cell - 2) / SPRITE_PIXELS;
  const out = {} as Record<FloodColour, SkPicture>;
  for (const colour of FLOOD_COLOURS) out[colour] = recordSprite(BUBBLES[colour], scale);
  return out;
}

/** The board at `progress` (0..1) of the pop: popping cells grow from 30 % with a small overshoot. */
function boardPicture(board: Board, cell: number, sprites: Record<FloodColour, SkPicture>, outline: string, popping: ReadonlySet<number>, progress: number): SkPicture {
  const size = FLOOD_SIZE * cell;
  return createPicture((canvas) => {
    const popScale = 0.3 + 0.7 * easeOutBack(progress);
    board.forEach((row, r) =>
      row.forEach((colour, c) => {
        const scale = popping.has(r * FLOOD_SIZE + c) ? popScale : 1;
        canvas.save();
        canvas.translate(c * cell + 1, r * cell + 1);
        if (scale !== 1) {
          const half = (cell - 2) / 2;
          canvas.translate(half, half);
          canvas.scale(scale, scale);
          canvas.translate(-half, -half);
        }
        canvas.drawPicture(sprites[colour]);
        canvas.restore();
      }),
    );
    // The tide's border: a white line on every side of a tide cell that does not touch the tide.
    const tide = new Set(tideCells(board).map((t) => t.row * FLOOD_SIZE + t.col));
    const paint = Skia.Paint();
    paint.setColor(Skia.Color(outline));
    paint.setStyle(1);
    paint.setStrokeWidth(2);
    for (const key of tide) {
      const r = Math.floor(key / FLOOD_SIZE);
      const c = key % FLOOD_SIZE;
      const x = c * cell;
      const y = r * cell;
      if (r === 0 || !tide.has(key - FLOOD_SIZE)) canvas.drawLine(x, y + 1, x + cell, y + 1, paint);
      if (r === FLOOD_SIZE - 1 || !tide.has(key + FLOOD_SIZE)) canvas.drawLine(x, y + cell - 1, x + cell, y + cell - 1, paint);
      if (c === 0 || !tide.has(key - 1)) canvas.drawLine(x + 1, y, x + 1, y + cell, paint);
      if (c === FLOOD_SIZE - 1 || !tide.has(key + 1)) canvas.drawLine(x + cell - 1, y, x + cell - 1, y + cell, paint);
    }
  }, { x: 0, y: 0, width: size, height: size });
}

export function FloodGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const cell = Math.max(16, Math.floor(Math.min((width - 2 * spacing.md) / FLOOD_SIZE, (height - RESERVED_HEIGHT) / FLOOD_SIZE)));
  const sprites = useMemo(() => bubblePictures(cell), [cell]);

  const [state, setState] = useState<FloodState>(() => createFlood(seed, upgradeLevels(save, 'flood')));
  const stateRef = useRef(state);
  const steps = useMemo(() => [{ key: 'colour', text: t.tutorial.flood.colour }], [t]);
  const frame = useRoundFrame({ game: 'flood', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => state.events.flatMap((e) => (FEEDBACK_OF[e.kind] ? [{ kind: FEEDBACK_OF[e.kind] as string }] : [])), [state.events]);
  useGameFeedback(feedback);

  const [pop, setPop] = useState<Pop | null>(null);
  const [progress, setProgress] = useState(1);
  const [endAt, setEndAt] = useState<number | null>(null);

  const tap = useCallback(
    (colour: FloodColour) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceFlood(previous, { type: 'colour', colour });
      stateRef.current = next;
      setState(next);
      const flood = next.events.find((e) => e.kind === 'flood');
      if (!flood) return; // refused: the tide's own colour
      advanceTutorial('colour');
      const won = next.events.find((e) => e.kind === 'board_won');
      if (won && won.kind === 'board_won') {
        setPop({ cells: Array.from({ length: FLOOD_SIZE * FLOOD_SIZE }, (_, i) => i), startedAt: now(), ms: WIN_MS, points: won.points });
      } else if (flood.kind === 'flood' && flood.absorbed.length > 0) {
        setPop({ cells: flood.absorbed.map((c) => c.row * FLOOD_SIZE + c.col), startedAt: now(), ms: POP_MS, points: null });
      }
      setProgress(0);
      if (next.status === 'over') setEndAt(now() + END_MS);
      else setCombos(next.combos);
    },
    [advanceTutorial, setCombos],
  );

  // Frame loop of the pop, by elapsed time on the injectable clock; re-renders only when the progress moves.
  useEffect(() => {
    if (!pop) return;
    let handle = 0;
    let last = 0; // the tap already set the progress to 0
    const loop = () => {
      const elapsed = now() - pop.startedAt;
      const p = Math.min(1, elapsed / POP_MS); // the cells pop over POP_MS; a won board's points stay pop.ms
      if (elapsed >= pop.ms) {
        setProgress(1);
        setPop(null);
        return;
      }
      if (Math.abs(p - last) >= 0.02 || (p === 1 && last !== 1)) {
        last = p;
        setProgress(p);
      }
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [pop]);

  // End of the round: the last board stays END_MS on screen, then the Result.
  useEffect(() => {
    if (endAt === null) return;
    let handle = 0;
    const loop = () => {
      if (now() >= endAt) {
        const s = stateRef.current;
        finish(s.score, s.combos);
        return;
      }
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [endAt, finish]);

  const popping = useMemo(() => new Set(pop ? pop.cells : []), [pop]);
  const picture = useMemo(() => boardPicture(state.board, cell, sprites, '#FFFFFF', popping, pop ? progress : 1), [state.board, cell, sprites, popping, pop, progress]);
  const tide = tideColour(state.board);
  const inputsLocked = paused || state.status !== 'playing';
  const buttonSize = Math.min(64, Math.floor((width - 2 * spacing.md - 4 * spacing.sm) / FLOOD_COLOURS.length));

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.board}
        </PixelText>
        <PixelText testID="hud-board">{String(state.boardNumber)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.moves}
        </PixelText>
        <PixelText testID="hud-moves">{String(state.movesLeft)}</PixelText>
      </View>
    </>
  );

  return (
    <GameFrame game="flood" frame={frame} score={state.score} hud={hud} testID="flood-screen">
      <View style={styles.column}>
        <View testID="flood-board" style={[styles.board, { width: FLOOD_SIZE * cell + 4, height: FLOOD_SIZE * cell + 4, backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Canvas style={StyleSheet.absoluteFill}>
            <Picture picture={picture} />
          </Canvas>
          {pop?.points != null && (
            <View pointerEvents="none" style={styles.pop}>
              <PixelText testID="flood-points-pop" size={18} color="accent" bold style={styles.popText}>
                {`+${pop.points}`}
              </PixelText>
            </View>
          )}
        </View>
        <View style={styles.buttons}>
          {FLOOD_COLOURS.map((colour) => {
            const isTide = colour === tide;
            return (
              <Pressable
                key={colour}
                testID={`flood-colour-${colour}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: isTide || inputsLocked }}
                onPress={() => !inputsLocked && tap(colour)}
                style={({ pressed }) => [
                  styles.button,
                  { width: buttonSize, height: buttonSize, backgroundColor: colors.surfaceAlt, borderColor: isTide ? colors.accent : colors.border },
                  isTide && styles.tideButton,
                  pressed && styles.pressed,
                ]}
              >
                <PixelSprite sprite={BUBBLES[colour]} scale={Math.max(2, Math.floor((buttonSize - 12) / SPRITE_PIXELS))} />
              </Pressable>
            );
          })}
        </View>
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.md },
  board: { borderWidth: 2, borderRadius: 4, overflow: 'hidden', padding: 0 },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  button: { borderWidth: 3, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center' },
  tideButton: { opacity: 0.35 },
  pressed: { transform: [{ scale: 0.92 }] },
  hudItem: { gap: 2 },
  pop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  popText: { textShadowColor: 'rgba(0, 0, 0, 0.6)', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 1 },
});
