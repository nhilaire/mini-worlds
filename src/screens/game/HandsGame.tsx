// « Mains de Cartes » screen: the card engine (src/game/hands) on one row of five pixel cards (the look of
// Vingt-et-Un: white card, value in the corner, suit or figure sprite in the middle). Turn-based: a tap keeps a card
// (it rises and gets a thick blue border), a second tap releases it; « Échanger » replaces the other cards, which
// slide in (300 ms, Animated value, native driver); « Garder » scores the hand as it is; « Seconde donne » shows
// instead of « Échanger » when a second exchange is available. The name of the combination held is always shown.
// The engine guards the exchange (300 ms) and keeps the scored hand shown 900 ms; a frame loop ticks it with the
// injectable clock only while one of these runs, and React re-renders only when the phase, the hand or the status
// changes.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { FIGURE_SPRITES, SUIT_SPRITES } from '../../art/games/twentyone';
import { PALETTE } from '../../art/palette';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { acceptsInput, canRedraw, createHands, evaluateHand, EXCHANGE_MS, HandsAction, HandsState, reduceHands } from '../../game/hands/engine';
import type { PlayingCard, Suit } from '../../game/twentyone/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { Button } from '../../ui/Button';
import { PixelSprite } from '../../ui/PixelSprite';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const CARD_GAP = 6;
const MAX_DT_MS = 50;
const LIFT = 12;

const RED_SUITS = new Set<Suit>(['hearts', 'diamonds']);
const SUIT_SYMBOLS: Readonly<Record<Suit, string>> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const RANK_LETTERS: Readonly<Record<number, string>> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

/** Rank and suit of a card for screen readers and tests, the same in every language: « A ♥ », « 10 ♠ », « K ♣ ». */
export function cardLabel(card: PlayingCard): string {
  return `${RANK_LETTERS[card.rank] ?? String(card.rank)} ${SUIT_SYMBOLS[card.suit]}`;
}

/** Engine events → sounds / haptics of the shared kit. */
function feedbackOf(events: HandsState['events']): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'deal' || e.kind === 'toggle') out.push({ kind: 'move' });
    else if (e.kind === 'exchange') out.push({ kind: 'swap' });
    else if (e.kind === 'settle') out.push({ kind: e.points > 0 ? 'match' : 'drop' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push({ kind: e.kind });
  }
  return out;
}

type CardProps = {
  card: PlayingCard;
  index: number;
  width: number;
  kept: boolean;
  disabled: boolean;
  onPress: (index: number) => void;
};

/** A pixel playing card that slides in from above when it mounts (its key changes when the card is replaced). */
function HandCard({ card, index, width, kept, disabled, onPress }: CardProps) {
  const [slide] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(slide, { toValue: 1, duration: EXCHANGE_MS, useNativeDriver: true }).start();
  }, [slide]);
  const height = Math.round(width * 1.4);
  const scale = Math.max(1, Math.floor((width * 0.6) / 7));
  const color = RED_SUITS.has(card.suit) ? PALETTE.darkRed : PALETTE.outline;
  const value = card.rank === 1 ? 'A' : card.rank <= 10 ? String(card.rank) : null;
  const figure = card.rank >= 11 ? FIGURE_SPRITES[card.rank as 11 | 12 | 13] : null;
  const motion = { opacity: slide, transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-height / 2, 0] }) }] };
  return (
    <Pressable
      testID={`hands-card-${index}`}
      accessibilityRole="button"
      accessibilityLabel={cardLabel(card)}
      accessibilityState={{ selected: kept, disabled }}
      disabled={disabled}
      onPress={() => onPress(index)}
      style={{ transform: [{ translateY: kept ? -LIFT : 0 }] }}
    >
      <Animated.View
        testID={`hands-face-${index}`}
        style={[styles.card, { width, height, borderColor: kept ? PALETTE.blue : PALETTE.outline, borderWidth: kept ? 4 : 2, backgroundColor: kept ? PALETTE.light : PALETTE.white }, motion]}
      >
        <View style={styles.corner}>
          {value !== null ? (
            <PixelText size={8} style={{ color }}>
              {value}
            </PixelText>
          ) : (
            <PixelSprite sprite={SUIT_SPRITES[card.suit]} scale={Math.max(1, Math.floor(scale / 2))} />
          )}
        </View>
        <PixelSprite sprite={figure ?? SUIT_SPRITES[card.suit]} scale={scale} />
      </Animated.View>
    </Pressable>
  );
}

export function HandsGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width } = useWindowDimensions();

  const [state, setState] = useState<HandsState>(() => createHands(seed, upgradeLevels(save, 'hands')));
  const stateRef = useRef(state);
  const steps = useMemo(() => [{ key: 'keep', text: t.tutorial.hands.keep }], [t]);
  const frame = useRoundFrame({ game: 'hands', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  // The table: side margins, 2 px borders, inner padding, then five cards and their gaps.
  const count = state.cards.length;
  const cardWidth = Math.min(72, Math.floor((width - 4 * spacing.sm - 4 - (count - 1) * CARD_GAP) / count));

  const dispatch = useCallback(
    (action: HandsAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceHands(previous, action);
      stateRef.current = next;
      // A tick only re-renders when the phase or the hand changes or the round ends.
      const redraw = action.type !== 'tick' || next.phase !== previous.phase || next.hand !== previous.hand || next.status !== previous.status;
      if (redraw) setState(next);
      // The first card kept or button played dismisses the bubble (an ignored or refused input does not).
      if (action.type !== 'tick' && next.events.some((e) => e.kind !== 'ignored')) advanceTutorial('keep');
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [advanceTutorial, finish, setCombos],
  );

  // Frame loop of the exchange guard and the result on show (injectable clock); dispatch is read through a ref so
  // that a new callback identity never restarts it.
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

  const onCard = useCallback(
    (index: number) => {
      if (paused) return;
      dispatch({ type: 'toggle', index });
    },
    [dispatch, paused],
  );
  const press = useCallback(
    (type: 'swap' | 'keep' | 'redraw') => {
      if (paused) return;
      dispatch({ type });
    },
    [dispatch, paused],
  );

  const locked = paused || state.status !== 'playing';
  const busy = locked || !acceptsInput(state);
  const allKept = state.kept.every((k) => k);
  // « Seconde donne » takes the place of « Échanger » once the first exchange is made and a second one is left.
  const second = state.phase !== 'result' && state.exchanges === 1 && state.redrawsLeft > 0;
  const held = evaluateHand(state.cards);

  const hud = (
    <View style={styles.hudItem}>
      <PixelText size={8} color="muted">
        {t.hud.hand}
      </PixelText>
      <PixelText testID="hud-hand">{t.hud.of(state.hand, state.hands)}</PixelText>
    </View>
  );

  return (
    <GameFrame game="hands" frame={frame} score={state.score} hud={hud} testID="hands-screen">
      <View style={styles.column}>
        <View testID="hands-board" style={[styles.table, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.row}>
            {state.cards.map((card, i) => (
              <HandCard key={`${state.hand}-${i}-${card.rank}${card.suit}`} card={card} index={i} width={cardWidth} kept={state.kept[i]} disabled={locked} onPress={onCard} />
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.result}>
            <PixelText testID="hands-combination" color={held.points > 0 ? 'accent' : 'muted'} bold>
              {t.play[held.combination]}
            </PixelText>
            {state.result !== null && (
              <PixelText key={`result-${state.hand}`} testID="hands-result" color={state.result.points > 0 ? 'success' : 'danger'} bold>
                {state.result.points > 0 ? `+${state.result.points}` : '0'}
              </PixelText>
            )}
          </View>
          <View style={styles.buttons}>
            <View style={styles.button}>
              {second ? (
                <Button label={t.play.redraw(state.redrawsLeft)} onPress={() => press('redraw')} disabled={busy || allKept || !canRedraw(state)} testID="hands-redraw" />
              ) : (
                <Button label={t.play.swap} onPress={() => press('swap')} disabled={busy || allKept || state.exchanges > 0} testID="hands-swap" />
              )}
            </View>
            <View style={styles.button}>
              <Button label={t.play.keep} onPress={() => press('keep')} disabled={busy} variant="secondary" testID="hands-keep" />
            </View>
          </View>
        </View>
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.lg, alignSelf: 'stretch' },
  table: { alignSelf: 'stretch', marginHorizontal: spacing.sm, borderWidth: 2, borderRadius: 4, paddingVertical: spacing.lg + LIFT, paddingHorizontal: spacing.sm, alignItems: 'center' },
  row: { flexDirection: 'row', gap: CARD_GAP },
  card: { borderRadius: 6, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  corner: { position: 'absolute', top: 2, left: 4 },
  hudItem: { gap: 2 },
  result: { flexDirection: 'row', gap: spacing.md, minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  footer: { alignItems: 'center', gap: spacing.md, alignSelf: 'stretch', paddingHorizontal: spacing.md },
  buttons: { flexDirection: 'row', gap: spacing.md, alignSelf: 'stretch', minHeight: 52 },
  button: { flex: 1 },
});
