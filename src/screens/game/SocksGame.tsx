// « Chaussettes Perdues » screen: the memory engine (src/game/socks) drawn as a 4-column grid of Pressable cards.
// Turn-based: a tap dispatches `flip` and the engine settles it at once; each card that changes face plays a short
// flip (scaleX 0 → 1, 180 ms). Two timers read the injectable clock and only run while the round is not paused:
// a miss is hidden after 700 ms (`hide`), the « Coup d'œil » peek ends after its duration (`endPeek`).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { CARD_BACK, SOCKS } from '../../art/games/socks';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { createSocks, MAX_MISSES, MISS_HIDE_MS, reduceSocks, SOCKS_COLS, SocksAction, SocksState } from '../../game/socks/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { PixelSprite } from '../../ui/PixelSprite';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { radius, spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const FLIP_MS = 180;
const GAP = 8;
/** Largest board: 12 pairs in 4 columns. Cards keep the same size on every board. */
const MAX_ROWS = 6;
const SPRITE_PIXELS = 12;

/** Engine event → sound / haptic of the shared kit. */
const FEEDBACK_OF: Readonly<Record<string, string>> = { flip: 'move', pair: 'match', miss: 'drop', board: 'lines', combo: 'combo', over: 'over' };

/**
 * Calls `onDone` once `ms` of unpaused time have passed since `key` became non-null (time read from the injectable
 * clock, so Jest drives it). Time spent while `running` is false does not count.
 */
function useClockDelay(key: string | null, running: boolean, ms: number, onDone: () => void) {
  const spent = useRef<{ key: string | null; ms: number }>({ key: null, ms: 0 });
  useEffect(() => {
    if (key === null || !running) return;
    if (spent.current.key !== key) spent.current = { key, ms: 0 };
    let last = now();
    let handle = 0;
    const loop = () => {
      const t = now();
      spent.current.ms += t - last;
      last = t;
      if (spent.current.ms >= ms) {
        onDone();
        return;
      }
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [key, running, ms, onDone]);
}

type CardProps = { col: number; row: number; sock: number; faceUp: boolean; found: boolean; size: number; onPress: (index: number) => void; index: number };

function SockCard({ col, row, sock, faceUp, found, size, onPress, index }: CardProps) {
  const { colors } = useTheme();
  const [turn] = useState(() => new Animated.Value(0));
  // Every change of face (and the deal) plays a flip: the card grows back from its edge with its new face.
  useEffect(() => {
    turn.setValue(0);
    Animated.timing(turn, { toValue: 1, duration: FLIP_MS, useNativeDriver: true }).start();
  }, [faceUp, turn]);
  const scale = Math.max(1, Math.floor((size - 8) / SPRITE_PIXELS));
  const press = useCallback(() => onPress(index), [onPress, index]);
  return (
    <Pressable testID={`socks-cell-${col}-${row}`} accessibilityRole="button" onPress={press} style={{ width: size, height: size }}>
      <Animated.View
        style={[
          styles.card,
          { width: size, height: size, backgroundColor: faceUp ? colors.surface : colors.surfaceAlt, borderColor: found ? colors.accent : colors.border },
          { opacity: found ? 0.6 : 1, transform: [{ scaleX: turn }] },
        ]}
      >
        {faceUp ? (
          <PixelSprite sprite={SOCKS[sock]} scale={scale} testID={`socks-face-${col}-${row}`} />
        ) : (
          <PixelSprite sprite={CARD_BACK} scale={scale} testID={`socks-back-${col}-${row}`} />
        )}
      </Animated.View>
    </Pressable>
  );
}

export function SocksGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const size = Math.floor(Math.min((width - 2 * spacing.md - (SOCKS_COLS - 1) * GAP) / SOCKS_COLS, (height - 280 - (MAX_ROWS - 1) * GAP) / MAX_ROWS));

  const [state, setState] = useState<SocksState>(() => createSocks(seed, upgradeLevels(save, 'socks')));
  const stateRef = useRef(state);
  const steps = useMemo(() => [{ key: 'flip', text: t.tutorial.socks.flip }], [t]);
  const frame = useRoundFrame({ game: 'socks', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => state.events.flatMap((e) => (FEEDBACK_OF[e.kind] ? [{ kind: FEEDBACK_OF[e.kind] }] : [])), [state.events]);
  useGameFeedback(feedback);

  const dispatch = useCallback(
    (action: SocksAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceSocks(previous, action);
      if (next === previous) return;
      stateRef.current = next;
      setState(next);
      if (next.events.some((e) => e.kind === 'flip')) advanceTutorial('flip');
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [advanceTutorial, finish, setCombos],
  );
  const flip = useCallback(
    (index: number) => {
      if (!paused) dispatch({ type: 'flip', index });
    },
    [dispatch, paused],
  );
  const hide = useCallback(() => dispatch({ type: 'hide' }), [dispatch]);
  const endPeek = useCallback(() => dispatch({ type: 'endPeek' }), [dispatch]);

  const playing = state.status === 'playing';
  useClockDelay(playing && state.missPending ? `miss-${state.misses}` : null, !paused, MISS_HIDE_MS, hide);
  useClockDelay(playing && state.peeking ? `peek-${state.board}` : null, !paused, state.peekMs, endPeek);

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.board}
        </PixelText>
        <PixelText testID="hud-board">{String(state.board)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.misses}
        </PixelText>
        <PixelText testID="hud-misses">{String(MAX_MISSES - state.misses)}</PixelText>
      </View>
    </>
  );

  return (
    <GameFrame game="socks" frame={frame} score={state.score} hud={hud} testID="socks-screen">
      <View style={styles.status}>
        {state.peeking && (
          <PixelText testID="socks-watch" color="accent">
            {t.play.watch}
          </PixelText>
        )}
      </View>
      <View testID="socks-board" style={[styles.grid, { width: SOCKS_COLS * size + (SOCKS_COLS - 1) * GAP }]}>
        {state.cards.map((card, i) => {
          const col = i % SOCKS_COLS;
          const row = Math.floor(i / SOCKS_COLS);
          return (
            <SockCard
              key={`${state.board}-${i}`}
              index={i}
              col={col}
              row={row}
              sock={card.sock}
              faceUp={state.peeking || card.state !== 'down'}
              found={card.state === 'found'}
              size={size}
              onPress={flip}
            />
          );
        })}
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  hudItem: { gap: 2 },
  status: { height: 28, justifyContent: 'center', marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  card: { borderWidth: 2, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center' },
});
