// « Champ de Taupes » screen: the minesweeper engine (src/game/moles) on an 8 × 8 grid of Pressable cells
// (`moles-cell-<col>-<row>`): grass when covered, a flag sprite when flagged, soil with a coloured number when
// revealed. Below the grid: the « Drapeau » toggle (`moles-flag`, a tap then flags or unflags) and the radar
// (`moles-radar`, uses left in its label). Turn-based: the engine settles a tap at once; each newly revealed cell
// zooms in (Reanimated layout animation, 180 ms). A cleared board stays on screen with a green check, « Gagné ! »
// and its points while the engine counts CLEARED_SHOW_MS down (frame loop on the injectable clock, AC-93), then the
// next board comes. A mole ends the round: every mole pops up and stays END_MS on screen before the Result.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { FLAG, MOLE } from '../../art/games/moles';
import { PALETTE, PaletteColor } from '../../art/palette';
import { UI_SPRITES } from '../../art/sprites';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { CLEAR_POINTS, count, createMoles, MOLES_CELLS, MOLES_SIZE, molesLeftToFlag, MolesState, reduceMoles, type Cell } from '../../game/moles/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { Button } from '../../ui/Button';
import { PixelSprite } from '../../ui/PixelSprite';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

export const REVEAL_MS = 180;
/** The moles stay on screen this long after the fatal dig, before the Result. */
export const END_MS = 900;
const MAX_DT_MS = 50;
/** Vertical room kept for the HUD, the buttons and the margins. */
const RESERVED_HEIGHT = 340;

/** Colour of each count (1..8) on the soil: distinct hues and lightness. */
const NUMBER_COLOURS: readonly PaletteColor[] = ['blue', 'darkGreen', 'red', 'darkPurple', 'darkOrange', 'shade', 'darkGrey', 'grey'];

/** Engine events → feedback names of the shared kit. */
const FEEDBACK_OF: Partial<Record<string, string>> = { dig: 'move', flag: 'move', radar: 'pop', cleared: 'lines', combo: 'combo', refused: 'drop', over: 'over' };

export function MolesGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const cell = Math.max(24, Math.floor(Math.min((width - 2 * spacing.md) / MOLES_SIZE, (height - RESERVED_HEIGHT) / MOLES_SIZE)));
  const spriteScale = Math.max(2, Math.floor((cell - 8) / 8));

  const [state, setState] = useState<MolesState>(() => createMoles(seed, upgradeLevels(save, 'moles')));
  const stateRef = useRef(state);
  const [flagMode, setFlagMode] = useState(false);
  const [endAt, setEndAt] = useState<number | null>(null);
  const steps = useMemo(() => [{ key: 'dig', text: t.tutorial.moles.dig }], [t]);
  const frame = useRoundFrame({ game: 'moles', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => state.events.flatMap((e) => (FEEDBACK_OF[e.kind] ? [{ kind: FEEDBACK_OF[e.kind] as string }] : [])), [state.events]);
  useGameFeedback(feedback);

  const won = state.clearedMs > 0;
  const inputsLocked = paused || state.status !== 'playing' || won;

  const dispatch = useCallback(
    (action: Parameters<typeof reduceMoles>[1]) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceMoles(previous, action);
      stateRef.current = next;
      // Ticks only count the cleared board down: React re-renders when the next board is dealt.
      if (action.type !== 'tick' || next.boardNumber !== previous.boardNumber) setState(next);
      if (next.events.some((e) => e.kind === 'dig' || e.kind === 'mole')) advanceTutorial('dig');
      if (next.status === 'over') setEndAt(now() + END_MS);
      else setCombos(next.combos);
    },
    [advanceTutorial, setCombos],
  );

  // The cleared board on show: the engine counts it down on the injectable clock while the round is active.
  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);
  useEffect(() => {
    if (!won || !active) return;
    let last = now();
    let handle = 0;
    const loop = () => {
      const time = now();
      const dt = Math.min(MAX_DT_MS, time - last);
      last = time;
      if (dt > 0) dispatchRef.current({ type: 'tick', dt });
      if (stateRef.current.clearedMs > 0) handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [won, active]);

  const tapCell = useCallback((c: Cell) => dispatch(flagMode ? { type: 'flag', cell: c } : { type: 'dig', cell: c }), [dispatch, flagMode]);

  // End of the round: the moles stay END_MS on screen, then the Result.
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

  // The moles shown at the end, and the fatal one.
  const { shownMoles, fatal } = useMemo(() => {
    const mole = state.events.find((e) => e.kind === 'mole');
    if (!mole || mole.kind !== 'mole') return { shownMoles: new Set<number>(), fatal: -1 };
    return { shownMoles: new Set(mole.moles.map((m) => m.row * MOLES_SIZE + m.col)), fatal: mole.cell.row * MOLES_SIZE + mole.cell.col };
  }, [state.events]);

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
          {t.hud.moles}
        </PixelText>
        <PixelText testID="hud-moles">{String(molesLeftToFlag(state))}</PixelText>
      </View>
    </>
  );

  const cells = [];
  for (let i = 0; i < MOLES_CELLS; i++) {
    const col = i % MOLES_SIZE;
    const row = Math.floor(i / MOLES_SIZE);
    const revealed = state.revealed[i];
    const isMole = shownMoles.has(i);
    const n = revealed ? count(state, i) : 0;
    const background = i === fatal ? PALETTE.red : revealed || isMole ? PALETTE.light : PALETTE.green;
    const border = revealed || isMole ? PALETTE.grey : PALETTE.darkGreen;
    cells.push(
      <Pressable
        key={`${state.boardNumber}-${i}`}
        testID={`moles-cell-${col}-${row}`}
        accessibilityRole="button"
        onPress={() => !inputsLocked && tapCell({ col, row })}
        style={[styles.cell, { width: cell - 2, height: cell - 2, backgroundColor: background, borderColor: border }]}
      >
        {revealed && (
          <Animated.View entering={ZoomIn.duration(REVEAL_MS)} style={styles.center}>
            {n > 0 && (
              <PixelText testID={`moles-count-${col}-${row}`} size={Math.max(10, Math.round(cell / 4))} bold style={{ color: PALETTE[NUMBER_COLOURS[n - 1]] }}>
                {String(n)}
              </PixelText>
            )}
          </Animated.View>
        )}
        {!revealed && isMole && (
          <Animated.View entering={ZoomIn.duration(REVEAL_MS)} testID={`moles-mole-${col}-${row}`}>
            <PixelSprite sprite={MOLE} scale={spriteScale} />
          </Animated.View>
        )}
        {!revealed && !isMole && state.flagged[i] && (
          <Animated.View entering={ZoomIn.duration(REVEAL_MS)} testID={`moles-flag-${col}-${row}`}>
            <PixelSprite sprite={FLAG} scale={spriteScale} />
          </Animated.View>
        )}
      </Pressable>,
    );
  }

  return (
    <GameFrame game="moles" frame={frame} score={state.score} hud={hud} testID="moles-screen">
      <View style={styles.column}>
        <View testID="moles-board" style={[styles.board, { width: MOLES_SIZE * cell, height: MOLES_SIZE * cell }]}>
          {cells}
          {won && (
            <Animated.View entering={ZoomIn.duration(REVEAL_MS)} style={styles.won} pointerEvents="none" testID="moles-won">
              <View style={styles.wonCard}>
                <PixelSprite sprite={UI_SPRITES.check} scale={8} />
                <PixelText size={28} bold style={{ color: PALETTE.darkGreen }} testID="moles-won-text">
                  {t.play.boardWon}
                </PixelText>
                <PixelText bold style={{ color: PALETTE.shade }}>{`+${CLEAR_POINTS}`}</PixelText>
              </View>
            </Animated.View>
          )}
        </View>
        <View style={[styles.buttons, { width: MOLES_SIZE * cell }]}>
          <View style={styles.flex}>
            <Button compact label={t.play.flag} variant={flagMode ? 'primary' : 'secondary'} onPress={() => setFlagMode((on) => !on)} testID="moles-flag" />
          </View>
          <View style={styles.flex}>
            <Button compact label={t.play.radar(state.radarLeft)} variant="secondary" disabled={state.radarLeft <= 0 || inputsLocked} onPress={() => dispatch({ type: 'radar' })} testID="moles-radar" />
          </View>
        </View>
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.md },
  board: { flexDirection: 'row', flexWrap: 'wrap' },
  won: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  wonCard: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: 8, borderWidth: 3, borderColor: PALETTE.darkGreen, backgroundColor: PALETTE.light },
  cell: { margin: 1, borderWidth: 2, borderRadius: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  hudItem: { gap: 2 },
});
