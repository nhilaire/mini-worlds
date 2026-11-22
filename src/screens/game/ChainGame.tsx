// « Chaîne de Nombres » screen: the chain engine (src/game/chain) on a 5 × 6 board of Pressable cells. Each value has
// its own colour and shows its digit big. The chain in progress is drawn over the board: a golden link between two
// cells, a white frame and the rank (1, 2, 3...) on each cell, and a green check on the last one as soon as tapping it
// again validates the chain. A validated chain pops its new number (zoom) while the numbers that fell or were
// refilled slide in from above, inside the engine's 250 ms guard, which is ticked by a requestAnimationFrame loop on
// the injectable clock that never re-renders React. « Mélange » shows only when the upgrade is owned.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, ZoomIn } from 'react-native-reanimated';

import { PALETTE, PaletteColor } from '../../art/palette';
import { UI_SPRITES } from '../../art/sprites';
import { CHAIN_CELLS, CHAIN_COLS, CHAIN_GUARD_MS, CHAIN_MIN, CHAIN_ROWS, ChainAction, ChainState, colOf, createChain, reduceChain, rowOf } from '../../game/chain/engine';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { Button } from '../../ui/Button';
import { PixelSprite } from '../../ui/PixelSprite';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const MAX_DT_MS = 100;
const LINK_MS = 120;
const CHECK_PIXELS = 8;

/** Colour of each value (1 first; the list repeats after 12) and the ink of its digit. */
export const VALUE_COLORS: readonly { fill: PaletteColor; ink: PaletteColor }[] = [
  { fill: 'sky', ink: 'outline' },
  { fill: 'lime', ink: 'outline' },
  { fill: 'yellow', ink: 'outline' },
  { fill: 'orange', ink: 'outline' },
  { fill: 'red', ink: 'white' },
  { fill: 'purple', ink: 'white' },
  { fill: 'blue', ink: 'white' },
  { fill: 'pink', ink: 'outline' },
  { fill: 'darkGreen', ink: 'white' },
  { fill: 'brown', ink: 'white' },
  { fill: 'grey', ink: 'outline' },
  { fill: 'darkBlue', ink: 'white' },
];

export const colorOf = (value: number) => VALUE_COLORS[(value - 1) % VALUE_COLORS.length];

/** Engine events → sound / haptic names of the shared kit (src/feedback/feedback.ts). */
function feedbackOf(events: ChainState['events']): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'start' || e.kind === 'extend') out.push({ kind: 'move' });
    else if (e.kind === 'cancel') out.push({ kind: 'swap_back' });
    else if (e.kind === 'chain') out.push({ kind: 'match' });
    else if (e.kind === 'shuffle' || e.kind === 'redeal') out.push({ kind: 'shuffle' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push({ kind: e.kind });
  }
  return out;
}

/** What the last resolution moved: the new number (`at`, -1 for a shuffle or a new deal) and the cells that slid in. */
type Resolution = { id: number; at: number; changed: ReadonlySet<number>; points: number };

const ALL_CELLS: ReadonlySet<number> = new Set(Array.from({ length: CHAIN_CELLS }, (_, i) => i));

function resolutionOf(events: ChainState['events'], id: number): Resolution | null {
  let out: Resolution | null = null;
  let points = 0;
  for (const e of events) {
    if (e.kind === 'chain') {
      points = e.points;
      out = { id, at: e.at, changed: new Set(e.changed), points };
    }
    // A shuffle or a new deal replaces the whole board.
    else if (e.kind === 'shuffle' || e.kind === 'redeal') out = { id, at: -1, changed: ALL_CELLS, points };
  }
  return out;
}

export function ChainGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const cell = Math.min(68, Math.floor(Math.min((width - 2 * spacing.md) / CHAIN_COLS, (height - 340) / CHAIN_ROWS)));
  const gap = Math.max(2, Math.round(cell * 0.06));
  const line = Math.max(4, Math.round(cell * 0.14));
  const checkScale = Math.max(1, Math.floor(cell / (3 * CHECK_PIXELS)));

  const [state, setState] = useState(() => createChain(seed, upgradeLevels(save, 'chain')));
  const stateRef = useRef(state);
  const [owned] = useState(() => state.shufflesLeft > 0);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const resolutions = useRef(0);
  const steps = useMemo(() => [{ key: 'link', text: t.tutorial.chain.link }], [t]);
  const frame = useRoundFrame({ game: 'chain', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  const dispatch = useCallback(
    (action: ChainAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceChain(previous, action);
      stateRef.current = next;
      // Ticks only count the guard down (nothing drawn changes): no re-render for them.
      if (action.type === 'tick') return;
      setState(next);
      const resolved = resolutionOf(next.events, resolutions.current + 1);
      if (resolved) {
        resolutions.current = resolved.id;
        setResolution(resolved);
      }
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [finish, setCombos],
  );

  // The resolution guard is ticked with the injectable clock; the loop reads dispatch through a ref, so it never
  // restarts when a callback changes identity.
  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);
  const running = !paused && state.status === 'playing';
  useEffect(() => {
    if (!running) return;
    let previous = now();
    let handle = 0;
    const loop = () => {
      const time = now();
      const dt = Math.min(MAX_DT_MS, time - previous);
      previous = time;
      if (dt > 0 && stateRef.current.guardMs > 0) dispatchRef.current({ type: 'tick', dt });
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [running]);

  const onTap = useCallback(
    (cellIndex: number) => {
      if (paused) return;
      advanceTutorial('link');
      dispatch({ type: 'tap', cell: cellIndex });
    },
    [advanceTutorial, dispatch, paused],
  );

  const locked = paused || state.status !== 'playing';
  const { cells, chain } = state;
  const last = chain.length > 0 ? chain[chain.length - 1] : -1;
  const ready = chain.length >= CHAIN_MIN;
  const centre = (c: number) => ({ x: colOf(c) * cell + cell / 2, y: rowOf(c) * cell + cell / 2 });

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.chains}
        </PixelText>
        <PixelText testID="hud-chains">{String(state.chainsLeft)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.best}
        </PixelText>
        <PixelText testID="hud-best">{String(state.best)}</PixelText>
      </View>
    </>
  );

  return (
    <GameFrame game="chain" frame={frame} score={state.score} hud={hud} testID="chain-screen">
      <View style={styles.column}>
        <View testID="chain-board" style={[styles.board, { width: CHAIN_COLS * cell + 4, height: CHAIN_ROWS * cell + 4, backgroundColor: colors.surface, borderColor: colors.border }]}>
          {cells.map((value, i) => {
            const rank = chain.indexOf(i);
            const selected = rank >= 0;
            const { fill, ink } = colorOf(value);
            const popped = resolution !== null && resolution.at === i;
            const moved = resolution !== null && resolution.changed.has(i);
            return (
              <Pressable
                key={i}
                testID={`chain-cell-${colOf(i)}-${rowOf(i)}`}
                accessibilityRole="button"
                accessibilityValue={{ text: String(value) }}
                accessibilityState={{ selected }}
                disabled={locked}
                onPress={() => onTap(i)}
                style={[styles.cell, { left: colOf(i) * cell, top: rowOf(i) * cell, width: cell, height: cell, padding: gap }]}
              >
                <Animated.View
                  key={popped || moved ? `${resolution.id}-${i}` : `still-${i}`}
                  entering={popped ? ZoomIn.duration(CHAIN_GUARD_MS) : moved ? FadeInUp.duration(CHAIN_GUARD_MS) : undefined}
                  style={[styles.tile, { backgroundColor: PALETTE[fill], borderColor: selected ? PALETTE.white : PALETTE.outline, borderWidth: selected ? 4 : 2 }]}
                >
                  <PixelText size={14} bold style={{ color: PALETTE[ink] }}>
                    {String(value)}
                  </PixelText>
                </Animated.View>
              </Pressable>
            );
          })}
          {/* The chain: one link from each cell centre to the next (any of the 8 directions), over the tiles. */}
          {chain.slice(1).map((c, i) => {
            const a = centre(chain[i]);
            const b = centre(c);
            // Half of the way only, in the middle: the link bridges the two tiles and leaves their digits readable.
            const length = Math.hypot(b.x - a.x, b.y - a.y) / 2;
            return (
              <Animated.View
                key={`link-${i}-${c}`}
                testID={`chain-link-${i}`}
                entering={FadeIn.duration(LINK_MS)}
                pointerEvents="none"
                style={[
                  styles.link,
                  {
                    left: (a.x + b.x) / 2 - length / 2,
                    top: (a.y + b.y) / 2 - line / 2,
                    width: length,
                    height: line,
                    borderRadius: line / 2,
                    backgroundColor: PALETTE.yellow,
                    borderColor: PALETTE.outline,
                    transform: [{ rotate: `${Math.atan2(b.y - a.y, b.x - a.x)}rad` }],
                  },
                ]}
              />
            );
          })}
          {/* The rank of each cell of the chain, and the check on the last one: « tap again ». */}
          {chain.map((c, rank) => (
            <View key={`rank-${c}`} testID={`chain-rank-${rank + 1}`} pointerEvents="none" style={[styles.rank, { left: colOf(c) * cell + gap, top: rowOf(c) * cell + gap, backgroundColor: PALETTE.outline }]}>
              <PixelText size={7} style={{ color: PALETTE.white }}>
                {String(rank + 1)}
              </PixelText>
            </View>
          ))}
          {ready && (
            <Animated.View
              key={`again-${last}`}
              testID="chain-again"
              entering={ZoomIn.duration(LINK_MS)}
              pointerEvents="none"
              style={[styles.again, { left: (colOf(last) + 1) * cell - gap - CHECK_PIXELS * checkScale - 6, top: (rowOf(last) + 1) * cell - gap - CHECK_PIXELS * checkScale - 6, backgroundColor: PALETTE.white, borderColor: PALETTE.outline }]}
            >
              <PixelSprite sprite={UI_SPRITES.check} scale={checkScale} />
            </Animated.View>
          )}
        </View>

        <View style={styles.footer}>
          {resolution !== null && resolution.points > 0 && (
            <Animated.View key={`last-${resolution.id}`} entering={FadeInUp.duration(220)}>
              <PixelText testID="chain-last" color="success" bold>
                {`+${resolution.points}`}
              </PixelText>
            </Animated.View>
          )}
          {owned && <Button label={t.play.shuffle(state.shufflesLeft)} onPress={() => dispatch({ type: 'shuffle' })} disabled={locked || state.shufflesLeft <= 0} variant="secondary" compact testID="chain-shuffle" />}
        </View>
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.md },
  board: { borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  cell: { position: 'absolute' },
  tile: { flex: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  link: { position: 'absolute', borderWidth: 1, opacity: 0.9 },
  rank: { position: 'absolute', minWidth: 16, paddingHorizontal: 3, paddingVertical: 1, borderRadius: 4, alignItems: 'center' },
  again: { position: 'absolute', padding: 2, borderRadius: 4, borderWidth: 1 },
  hudItem: { gap: 2 },
  footer: { alignItems: 'center', gap: spacing.sm, minHeight: 90, alignSelf: 'stretch', paddingHorizontal: spacing.md },
});
