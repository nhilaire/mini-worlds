// « Réussite Express » screen: the patience engine (src/game/patience) with the 5 columns of overlapping pixel cards
// on top (the cards of Vingt-et-Un: rank in the corner, suit or figure sprite), the stock and the pile below, and
// the « Joker » button when the upgrade is owned. Turn-based: a tap on the bottom card of a column, on the stock or
// on the joker dispatches an action; the card that reaches the pile slides in from where it came (150 ms, Animated
// value, native driver). Playable cards are not highlighted: finding them is the game; a card that cannot be played
// shakes. The engine guards the move (150 ms) and keeps a finished deal shown 900 ms; a frame loop ticks it with the
// injectable clock only while one of these runs, and React re-renders only when taps become accepted again, the deal
// changes or the round ends.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { CARD_BACK, FIGURE_SPRITES, SUIT_SPRITES } from '../../art/games/twentyone';
import { PALETTE } from '../../art/palette';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { acceptsInput, createPatience, MOVE_MS, PATIENCE_DEALS, PatienceAction, PatienceMove, PatienceState, reducePatience } from '../../game/patience/engine';
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
const MAX_CARD_WIDTH = 60;
const MAX_DT_MS = 50;
/** Visible strip of a covered card (its rank and suit). */
const OVERLAP = 24;
/** Cards a column is laid out for (a column never grows). */
const COLUMN_ROOM = 4;
/** A card that cannot be played shakes: offsets (px) of 40 ms each. */
const SHAKE_STEPS = [5, -5, 3, 0];
const SHAKE_STEP_MS = 40;

const RED_SUITS = new Set<Suit>(['hearts', 'diamonds']);
const SUIT_SYMBOLS: Readonly<Record<Suit, string>> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const RANK_LABELS: Readonly<Record<number, string>> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

/** Accessibility label of a card: rank then suit, the same in every language (« 7♥ », « A♠ », « K♦ »). */
export function cardLabel(card: PlayingCard): string {
  return `${RANK_LABELS[card.rank] ?? String(card.rank)}${SUIT_SYMBOLS[card.suit]}`;
}

/** Engine events → sounds / haptics of the shared kit. */
function feedbackOf(events: PatienceState['events']): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'play') out.push({ kind: 'move' });
    else if (e.kind === 'draw') out.push({ kind: 'swap' });
    else if (e.kind === 'refused') out.push({ kind: 'swap_back' });
    else if (e.kind === 'wild') out.push({ kind: 'button' });
    else if (e.kind === 'cleared') out.push({ kind: 'match' });
    else if (e.kind === 'stuck') out.push({ kind: 'drop' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push({ kind: e.kind });
  }
  return out;
}

/**
 * A pixel playing card: rank (or figure sprite) and suit in the top strip, which stays visible when the card is
 * covered, and the suit (or figure) sprite in the middle.
 */
function CardFace({ card, width }: { card: PlayingCard; width: number }) {
  const height = Math.round(width * 1.4);
  const scale = Math.max(1, Math.floor((width * 0.5) / 7));
  const color = RED_SUITS.has(card.suit) ? PALETTE.darkRed : PALETTE.outline;
  const label = card.rank === 1 ? 'A' : card.rank <= 10 ? String(card.rank) : null;
  const figure = card.rank >= 11 ? FIGURE_SPRITES[card.rank as 11 | 12 | 13] : null;
  return (
    <View style={[styles.card, { width, height }]}>
      <View style={styles.strip}>
        {label !== null ? (
          <PixelText size={9} bold style={{ color }}>
            {label}
          </PixelText>
        ) : (
          figure && <PixelSprite sprite={figure} scale={2} />
        )}
        <PixelSprite sprite={SUIT_SPRITES[card.suit]} scale={2} />
      </View>
      <View style={styles.middle}>
        <PixelSprite sprite={figure ?? SUIT_SPRITES[card.suit]} scale={scale} />
      </View>
    </View>
  );
}

type BottomProps = {
  card: PlayingCard;
  column: number;
  width: number;
  top: number;
  /** Grows each time this card was refused: the card shakes again. */
  shakes: number;
  disabled: boolean;
  onPress: (column: number) => void;
};

/** The bottom card of a column: the only one that can be tapped. */
function BottomCard({ card, column, width, top, shakes, disabled, onPress }: BottomProps) {
  const [shake] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (shakes === 0) return;
    Animated.sequence(SHAKE_STEPS.map((toValue) => Animated.timing(shake, { toValue, duration: SHAKE_STEP_MS, useNativeDriver: true }))).start();
  }, [shakes, shake]);
  return (
    <Pressable
      testID={`patience-column-${column}`}
      accessibilityRole="button"
      accessibilityLabel={cardLabel(card)}
      disabled={disabled}
      onPress={() => onPress(column)}
      style={[styles.stacked, { top }]}
    >
      <Animated.View style={{ transform: [{ translateX: shake }] }}>
        <CardFace card={card} width={width} />
      </Animated.View>
    </Pressable>
  );
}

/** The pile's card; it slides in from (dx, dy) when it mounts (its key changes on every move). */
function PileCard({ card, width, dx, dy }: { card: PlayingCard; width: number; dx: number; dy: number }) {
  const moved = dx !== 0 || dy !== 0;
  const [slide] = useState(() => new Animated.Value(moved ? 0 : 1));
  useEffect(() => {
    if (moved) Animated.timing(slide, { toValue: 1, duration: MOVE_MS, useNativeDriver: true }).start();
  }, [moved, slide]);
  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [dx, 0] });
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] });
  return (
    <Animated.View testID="patience-pile" accessible accessibilityLabel={cardLabel(card)} style={{ transform: [{ translateX }, { translateY }] }}>
      <CardFace card={card} width={width} />
    </Animated.View>
  );
}

type Last = { key: number; text: string; good: boolean };

export function PatienceGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width } = useWindowDimensions();

  const [jokers] = useState(() => upgradeLevels(save, 'patience').wild ?? 0);
  const [state, setState] = useState(() => createPatience(seed, { wild: jokers }));
  const stateRef = useRef(state);
  const [last, setLast] = useState<Last | null>(null);
  /** Moves drawn so far: the key of the pile's card changes so that its slide replays. */
  const [moveCount, setMoveCount] = useState(0);
  const [shake, setShake] = useState<{ column: number; count: number }>({ column: -1, count: 0 });
  const steps = useMemo(() => [{ key: 'play', text: t.tutorial.patience.play }], [t]);
  const frame = useRoundFrame({ game: 'patience', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  // The table: side margins, then 5 cards and their gaps.
  const cardWidth = Math.min(MAX_CARD_WIDTH, Math.floor((width - 2 * spacing.md - (state.columns.length - 1) * CARD_GAP) / state.columns.length));
  const cardHeight = Math.round(cardWidth * 1.4);
  const columnHeight = cardHeight + (COLUMN_ROOM - 1) * OVERLAP;
  const step = cardWidth + CARD_GAP;

  const dispatch = useCallback(
    (action: PatienceAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reducePatience(previous, action);
      stateRef.current = next;
      // A tick only re-renders when taps are taken again, the deal changes or the round ends.
      const redraw = action.type !== 'tick' || acceptsInput(next) !== acceptsInput(previous) || next.deal !== previous.deal || next.status !== previous.status;
      if (redraw) setState(next);
      for (const e of next.events) {
        if (e.kind === 'play' || e.kind === 'draw') {
          setMoveCount((c) => c + 1);
          advanceTutorial('play');
          if (e.kind === 'play') {
            setLast((l) => ({ key: (l?.key ?? 0) + 1, text: `+${e.points}`, good: true }));
            // The card under it becomes the bottom card: it must not inherit the shake of the one that left.
            setShake((s) => ({ column: -1, count: s.count }));
          }
        } else if (e.kind === 'refused') setShake((s) => ({ column: e.column, count: s.count + 1 }));
        else if (e.kind === 'cleared') setLast((l) => ({ key: (l?.key ?? 0) + 1, text: `${t.play.boardWon} +${e.bonus}`, good: true }));
        else if (e.kind === 'stuck') setLast((l) => ({ key: (l?.key ?? 0) + 1, text: t.play.lost, good: false }));
        else if (e.kind === 'deal') setLast(null);
      }
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [advanceTutorial, finish, setCombos, t],
  );

  // Frame loop of the move guard and the finished deal (injectable clock); dispatch is read through a ref so that a
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

  const onColumn = useCallback(
    (column: number) => {
      if (paused) return;
      dispatch({ type: 'tapColumn', column });
    },
    [dispatch, paused],
  );
  const onStock = useCallback(() => {
    if (paused) return;
    dispatch({ type: 'draw' });
  }, [dispatch, paused]);
  const onWild = useCallback(() => {
    if (paused) return;
    dispatch({ type: 'wild' });
  }, [dispatch, paused]);

  const locked = paused || state.status !== 'playing';

  // Where the pile's card comes from, relative to the pile (the stock is on its left, the columns above).
  const origin = (move: PatienceMove | null): { dx: number; dy: number } => {
    if (move === null) return { dx: 0, dy: 0 };
    if (move.from === 'stock') return { dx: -step, dy: 0 };
    return { dx: (move.column - state.columns.length / 2) * step, dy: -(cardHeight + spacing.lg) };
  };
  const from = origin(state.lastMove);

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.deal}
        </PixelText>
        <PixelText testID="hud-deal">{t.hud.of(state.deal, PATIENCE_DEALS)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.stock}
        </PixelText>
        <PixelText testID="hud-stock">{String(state.stock.length)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.streak}
        </PixelText>
        <PixelText testID="hud-streak">{String(state.streak)}</PixelText>
      </View>
    </>
  );

  return (
    <GameFrame game="patience" frame={frame} score={state.score} hud={hud} testID="patience-screen">
      <View style={styles.table}>
        <View testID="patience-columns" style={styles.columns}>
          {state.columns.map((cards, c) => (
            <View key={c} testID={`patience-cards-${c}`} style={[styles.column, { width: cardWidth, height: columnHeight, borderColor: colors.border }, cards.length === 0 && styles.emptyColumn]}>
              {cards.map((card, i) =>
                i < cards.length - 1 ? (
                  <View key={`${state.deal}-${i}`} testID={`patience-card-${c}-${i}`} accessible accessibilityLabel={cardLabel(card)} style={[styles.stacked, { top: i * OVERLAP }]}>
                    <CardFace card={card} width={cardWidth} />
                  </View>
                ) : (
                  <BottomCard
                    key={`${state.deal}-${i}`}
                    card={card}
                    column={c}
                    width={cardWidth}
                    top={i * OVERLAP}
                    shakes={shake.column === c ? shake.count : 0}
                    disabled={locked}
                    onPress={onColumn}
                  />
                ),
              )}
            </View>
          ))}
        </View>

        <View style={styles.piles}>
          <Pressable
            testID="patience-stock"
            accessibilityRole="button"
            accessibilityLabel={`${t.hud.stock} ${state.stock.length}`}
            disabled={locked}
            onPress={onStock}
            style={[styles.card, styles.stock, { width: cardWidth, height: cardHeight }, state.stock.length === 0 && [styles.emptyStock, { borderColor: colors.border }]]}
          >
            {state.stock.length > 0 && <PixelSprite sprite={CARD_BACK} scale={Math.max(1, Math.floor((cardWidth * 0.5) / 7))} />}
            <View style={[styles.count, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <PixelText testID="patience-stock-count" size={9} bold>
                {String(state.stock.length)}
              </PixelText>
            </View>
          </Pressable>
          <PileCard key={`${state.deal}-${moveCount}`} card={state.pile} width={cardWidth} dx={from.dx} dy={from.dy} />
        </View>

        <View style={styles.footer}>
          <View style={styles.result}>
            {last && (
              <PixelText key={`last-${last.key}`} testID="patience-last" color={last.good ? 'success' : 'danger'} bold>
                {last.text}
              </PixelText>
            )}
          </View>
          {jokers > 0 && (
            <Button
              label={t.play.wild(state.wildsLeft)}
              onPress={onWild}
              disabled={locked || state.wildsLeft <= 0}
              variant={state.wildArmed ? 'primary' : 'secondary'}
              compact
              testID="patience-wild"
            />
          )}
        </View>
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  table: { alignItems: 'center', gap: spacing.lg, alignSelf: 'stretch', paddingHorizontal: spacing.md },
  columns: { flexDirection: 'row', gap: CARD_GAP },
  column: { borderRadius: 6 },
  emptyColumn: { borderWidth: 2, borderStyle: 'dashed', opacity: 0.4 },
  stacked: { position: 'absolute', left: 0 },
  piles: { flexDirection: 'row', gap: CARD_GAP },
  card: { backgroundColor: PALETTE.white, borderColor: PALETTE.outline, borderWidth: 2, borderRadius: 6, overflow: 'hidden' },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 3, height: OVERLAP - 4, paddingHorizontal: 3 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stock: { backgroundColor: PALETTE.blue, alignItems: 'center', justifyContent: 'center' },
  emptyStock: { backgroundColor: 'transparent', borderStyle: 'dashed' },
  count: { position: 'absolute', right: 2, bottom: 2, minWidth: 22, paddingHorizontal: 3, borderWidth: 1, borderRadius: 4, alignItems: 'center' },
  hudItem: { gap: 2 },
  result: { minHeight: 28, justifyContent: 'center' },
  footer: { alignItems: 'center', gap: spacing.sm, minHeight: 90, alignSelf: 'stretch' },
});
