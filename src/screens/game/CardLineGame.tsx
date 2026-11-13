// « Suite de Cartes » screen: the card engine (src/game/cardline) on one row of 5 to 9 pixel cards (white card, value
// in the corner and in the middle, one heart pip: the look of Vingt-et-Un). Turn-based: a tap selects a card (it
// rises), a tap on another card swaps them; both cards slide to their new place (200 ms, Animated value, native
// driver). The engine guards the swap (200 ms) and keeps a finished row shown 600 ms; a frame loop ticks it with the
// injectable clock only while one of these runs, and React re-renders only when taps become accepted again or the row
// changes. The « Indice » button outlines the two cards of a swap that puts one card at its place.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { SUIT_SPRITES } from '../../art/games/twentyone';
import { PALETTE } from '../../art/palette';
import { acceptsInput, CARDLINE_ROWS, CardlineAction, CardlineState, createCardline, reduceCardline, SWAP_MS } from '../../game/cardline/engine';
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

const CARD_GAP = 4;
const MAX_DT_MS = 50;
const LIFT = 10;

/** Engine events → sounds / haptics of the shared kit. */
function feedbackOf(events: CardlineState['events']): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'select' || e.kind === 'unselect') out.push({ kind: 'move' });
    else if (e.kind === 'swap') out.push({ kind: 'swap' });
    else if (e.kind === 'sorted') out.push({ kind: 'match' });
    else if (e.kind === 'failed') out.push({ kind: 'drop' });
    else if (e.kind === 'hint') out.push({ kind: 'button' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push({ kind: e.kind });
  }
  return out;
}

type CardProps = {
  value: number;
  index: number;
  width: number;
  /** Horizontal distance the card comes from (its place before the swap), 0 when it did not move. */
  from: number;
  selected: boolean;
  hinted: boolean;
  placed: boolean;
  disabled: boolean;
  onPress: (index: number) => void;
};

/** A pixel playing card that slides in from `from` when it mounts (its key changes on every swap that moves it). */
function Card({ value, index, width, from, selected, hinted, placed, disabled, onPress }: CardProps) {
  const { colors } = useTheme();
  const [slide] = useState(() => new Animated.Value(from === 0 ? 1 : 0));
  useEffect(() => {
    if (from !== 0) Animated.timing(slide, { toValue: 1, duration: SWAP_MS, useNativeDriver: true }).start();
  }, [from, slide]);
  const height = Math.round(width * 1.45);
  const scale = Math.max(1, Math.floor((width * 0.45) / 7));
  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [from, 0] });
  const border = hinted ? colors.accent : selected ? PALETTE.blue : PALETTE.outline;
  return (
    <Pressable
      testID={`cardline-card-${index}`}
      accessibilityRole="button"
      accessibilityLabel={String(value)}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={() => onPress(index)}
    >
      <Animated.View
        testID={`cardline-face-${index}`}
        style={[
          styles.card,
          { width, height, borderColor: border, borderWidth: hinted || selected ? 3 : 2, backgroundColor: placed ? PALETTE.light : PALETTE.white },
          { transform: [{ translateX }, { translateY: selected ? -LIFT : 0 }] },
        ]}
      >
        <View style={styles.corner}>
          <PixelText size={7} style={{ color: PALETTE.darkRed }}>
            {String(value)}
          </PixelText>
        </View>
        <PixelText testID={`cardline-value-${index}`} size={Math.max(9, Math.round(width / 4))} bold style={{ color: PALETTE.outline }}>
          {String(value)}
        </PixelText>
        <PixelSprite sprite={SUIT_SPRITES.hearts} scale={scale} />
      </Animated.View>
    </Pressable>
  );
}

type RowResult = { row: number; points: number };

export function CardLineGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width } = useWindowDimensions();

  const [state, setState] = useState(() => createCardline(seed, upgradeLevels(save, 'cardline')));
  const stateRef = useRef(state);
  const [last, setLast] = useState<RowResult | null>(null);
  /** Swaps drawn so far: the key of a moved card changes so that its slide replays. */
  const [swapCount, setSwapCount] = useState(0);
  const steps = useMemo(() => [{ key: 'swap', text: t.tutorial.cardline.swap }], [t]);
  const frame = useRoundFrame({ game: 'cardline', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  const n = state.cards.length;
  // The table: side margins, 2 px borders, inner padding, then n cards and their gaps.
  const cardWidth = Math.min(64, Math.floor((width - 4 * spacing.sm - 4 - (n - 1) * CARD_GAP) / n));

  const dispatch = useCallback(
    (action: CardlineAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceCardline(previous, action);
      stateRef.current = next;
      // A tick only re-renders when taps are taken again, the row changes or the round ends.
      const redraw = action.type !== 'tick' || acceptsInput(next) !== acceptsInput(previous) || next.row !== previous.row || next.status !== previous.status;
      if (redraw) setState(next);
      for (const e of next.events) {
        if (e.kind === 'swap') {
          setSwapCount((c) => c + 1);
          advanceTutorial('swap');
        } else if (e.kind === 'sorted') setLast({ row: e.row, points: e.points });
        else if (e.kind === 'failed') setLast({ row: e.row, points: 0 });
      }
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [advanceTutorial, finish, setCombos],
  );

  // Frame loop of the swap guard and the finished row (injectable clock); dispatch is read through a ref so that a
  // new callback identity never restarts it.
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

  const onCard = useCallback((index: number) => {
    if (paused) return;
    dispatch({ type: 'tap', index });
  }, [dispatch, paused]);

  const locked = paused || state.status !== 'playing';
  const step = cardWidth + CARD_GAP;
  const swap = state.lastSwap;

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.row}
        </PixelText>
        <PixelText testID="hud-row">{t.hud.of(state.row, CARDLINE_ROWS)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.moves}
        </PixelText>
        <PixelText testID="hud-swaps">{String(state.swaps)}</PixelText>
      </View>
    </>
  );

  return (
    <GameFrame game="cardline" frame={frame} score={state.score} hud={hud} testID="cardline-screen">
      <View style={styles.column}>
        <View testID="cardline-row" style={[styles.table, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.row}>
            {state.cards.map((value, i) => {
              const moved = swap !== null && (swap[0] === i || swap[1] === i);
              const other = moved && swap ? (swap[0] === i ? swap[1] : swap[0]) : i;
              return (
                <Card
                  key={moved ? `${state.row}-${value}-${swapCount}` : `${state.row}-${value}`}
                  value={value}
                  index={i}
                  width={cardWidth}
                  from={(other - i) * step}
                  selected={state.selected === i}
                  hinted={state.hint !== null && (state.hint[0] === i || state.hint[1] === i)}
                  placed={value === i + 1}
                  disabled={locked}
                  onPress={onCard}
                />
              );
            })}
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.result}>
            {last && (
              <PixelText key={`last-${last.row}`} testID="cardline-last" color={last.points > 0 ? 'success' : 'danger'} bold>
                {last.points > 0 ? `+${last.points}` : '0'}
              </PixelText>
            )}
          </View>
          <Button
            label={t.play.hint(state.hintsLeft)}
            onPress={() => dispatch({ type: 'hint' })}
            disabled={locked || state.hintsLeft <= 0 || state.hint !== null}
            variant="secondary"
            compact
            testID="cardline-btn-hint"
          />
        </View>
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.lg, alignSelf: 'stretch' },
  table: { alignSelf: 'stretch', marginHorizontal: spacing.sm, borderWidth: 2, borderRadius: 4, paddingVertical: spacing.lg + LIFT, paddingHorizontal: spacing.sm, alignItems: 'center' },
  row: { flexDirection: 'row', gap: CARD_GAP },
  card: { borderRadius: 5, alignItems: 'center', justifyContent: 'center', gap: 4, overflow: 'hidden' },
  corner: { position: 'absolute', top: 2, left: 3 },
  hudItem: { gap: 2 },
  result: { minHeight: 28, justifyContent: 'center' },
  footer: { alignItems: 'center', gap: spacing.sm, minHeight: 90, alignSelf: 'stretch', paddingHorizontal: spacing.md },
});
