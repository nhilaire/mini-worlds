// « Vingt-et-Un » screen: the points-only card engine (src/game/twentyone) with the dealer's row on top, the
// player's row below and the buttons Tirer / Rester / Main suivante. Turn-based: a button dispatches an action and
// the engine settles it at once; every card that appears (deal, hit, dealer reveal and draws) slides in (200 ms).
// After the last hand the outcome stays on screen for a moment (injectable clock) before the round is handed over.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';

import { CARD_BACK, FIGURE_SPRITES, SUIT_SPRITES } from '../../art/games/twentyone';
import { PALETTE } from '../../art/palette';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { createTwentyOne, handTotal, Outcome, PlayingCard, reduceTwentyOne, TwentyOneAction, TwentyOneState } from '../../game/twentyone/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { Button } from '../../ui/Button';
import { PixelSprite } from '../../ui/PixelSprite';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const SLIDE_MS = 200;
const CARD_GAP = 6;
/** The last outcome stays visible this long before the Result screen. */
export const END_DELAY_MS = 1500;

const OUTCOME_FEEDBACK: Readonly<Record<Outcome, string>> = { blackjack: 'match', win: 'match', push: 'move', blackjack_push: 'move', lose: 'drop', bust: 'drop' };

/** Engine events → sounds / haptics of the shared kit. */
function feedbackOf(state: TwentyOneState): { kind: string }[] {
  return state.events.flatMap((e) => {
    if (e.kind === 'deal' || e.kind === 'hit') return [{ kind: 'move' }];
    if (e.kind === 'settle') return [{ kind: OUTCOME_FEEDBACK[e.outcome] }];
    if (e.kind === 'combo' || e.kind === 'over') return [{ kind: e.kind }];
    return [];
  });
}

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

const RED_SUITS = new Set(['hearts', 'diamonds']);

/** A pixel playing card: value in the corner, suit sprite (or figure sprite) in the middle; slides in on mount. */
function CardView({ card, hidden, width, testID }: { card: PlayingCard; hidden: boolean; width: number; testID: string }) {
  const [slide] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(slide, { toValue: 1, duration: SLIDE_MS, useNativeDriver: true }).start();
  }, [slide]);
  const height = Math.round(width * 1.4);
  const scale = Math.max(1, Math.floor((width * 0.6) / 7));
  const motion = { opacity: slide, transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }) }] };
  if (hidden) {
    return (
      <Animated.View testID={testID} style={[styles.card, styles.back, { width, height }, motion]}>
        <PixelSprite sprite={CARD_BACK} scale={scale} />
      </Animated.View>
    );
  }
  const color = RED_SUITS.has(card.suit) ? PALETTE.darkRed : PALETTE.outline;
  const label = card.rank === 1 ? 'A' : card.rank <= 10 ? String(card.rank) : null;
  const figure = card.rank >= 11 ? FIGURE_SPRITES[card.rank as 11 | 12 | 13] : null;
  return (
    <Animated.View testID={testID} style={[styles.card, { width, height }, motion]}>
      <View style={styles.corner}>
        {label !== null ? (
          <PixelText size={8} style={{ color }}>
            {label}
          </PixelText>
        ) : (
          <PixelSprite sprite={SUIT_SPRITES[card.suit]} scale={Math.max(1, Math.floor(scale / 2))} />
        )}
      </View>
      <PixelSprite sprite={figure ?? SUIT_SPRITES[card.suit]} scale={scale} />
    </Animated.View>
  );
}

export function TwentyOneGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { save } = useGameStore();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(72, Math.floor((width - 2 * spacing.md - 5 * CARD_GAP) / 6));

  const [state, setState] = useState<TwentyOneState>(() => createTwentyOne(seed, upgradeLevels(save, 'twentyone')));
  const stateRef = useRef(state);
  const steps = useMemo(() => [{ key: 'play', text: t.tutorial.twentyone.play }], [t]);
  const frame = useRoundFrame({ game: 'twentyone', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state), [state]);
  useGameFeedback(feedback);

  const dispatch = useCallback(
    (action: TwentyOneAction) => {
      const previous = stateRef.current;
      if (paused || previous.status !== 'playing') return;
      const next = reduceTwentyOne(previous, action);
      if (next === previous) return;
      stateRef.current = next;
      setState(next);
      if (action.type !== 'next') advanceTutorial('play');
      setCombos(next.combos);
    },
    [advanceTutorial, paused, setCombos],
  );
  const hit = useCallback(() => dispatch({ type: 'hit' }), [dispatch]);
  const stand = useCallback(() => dispatch({ type: 'stand' }), [dispatch]);
  const next = useCallback(() => dispatch({ type: 'next' }), [dispatch]);
  const handOver = useCallback(() => finish(stateRef.current.score, stateRef.current.combos), [finish]);
  useClockDelay(state.status === 'over' ? 'end' : null, !paused, END_DELAY_MS, handOver);

  const messages: Record<Outcome, string> = { blackjack: t.play.blackjack, blackjack_push: t.play.push, win: t.play.win, push: t.play.push, lose: t.play.lose, bust: t.play.bust };
  const message = state.outcome === null ? t.play.yourTurn : messages[state.outcome];
  const dealerTotal = handTotal(state.holeHidden ? state.dealer.slice(0, 1) : state.dealer);

  const hud = (
    <View style={styles.hudItem}>
      <PixelText size={8} color="muted">
        {t.hud.hand}
      </PixelText>
      <PixelText testID="hud-hand">{t.hud.of(state.hand, state.hands)}</PixelText>
    </View>
  );

  const row = (cards: readonly PlayingCard[], who: 'dealer' | 'player') => (
    <View style={styles.row} testID={`twentyone-${who}-cards`}>
      {cards.map((card, i) => {
        const hidden = who === 'dealer' && i === 1 && state.holeHidden;
        return <CardView key={`${state.hand}-${i}-${hidden ? 'hole' : `${card.rank}${card.suit}`}`} card={card} hidden={hidden} width={cardWidth} testID={`twentyone-${who}-card-${i}`} />;
      })}
    </View>
  );

  return (
    <GameFrame game="twentyone" frame={frame} score={state.score} hud={hud} testID="twentyone-screen">
      <View testID="twentyone-board" style={styles.table}>
        <View style={styles.label}>
          <PixelText size={8} color="muted">
            {t.play.dealer}
          </PixelText>
          <PixelText testID="twentyone-dealer-total">{String(dealerTotal)}</PixelText>
        </View>
        {row(state.dealer, 'dealer')}
        <PixelText testID="twentyone-message" color={state.outcome === null ? 'text' : 'accent'} bold style={styles.message}>
          {message}
        </PixelText>
        {row(state.player, 'player')}
        <View style={styles.label}>
          <PixelText size={8} color="muted">
            {t.play.you}
          </PixelText>
          <PixelText testID="twentyone-player-total">{String(handTotal(state.player))}</PixelText>
        </View>
        <View style={styles.buttons}>
          {state.outcome === null ? (
            <>
              <View style={styles.button}>
                <Button label={t.play.hit} onPress={hit} testID="twentyone-btn-hit" />
              </View>
              <View style={styles.button}>
                <Button label={t.play.stand} onPress={stand} variant="secondary" testID="twentyone-btn-stand" />
              </View>
            </>
          ) : (
            state.status === 'playing' && (
              <View style={styles.button}>
                <Button label={t.play.nextHand} onPress={next} testID="twentyone-btn-next" />
              </View>
            )
          )}
        </View>
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  hudItem: { gap: 2 },
  table: { alignSelf: 'stretch', paddingHorizontal: spacing.md, gap: spacing.md, alignItems: 'center' },
  label: { flexDirection: 'row', gap: spacing.sm, alignItems: 'baseline' },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: CARD_GAP, minHeight: 100 },
  card: { backgroundColor: PALETTE.white, borderColor: PALETTE.outline, borderWidth: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  back: { backgroundColor: PALETTE.blue },
  corner: { position: 'absolute', top: 2, left: 4 },
  message: { textAlign: 'center', minHeight: 28 },
  buttons: { flexDirection: 'row', gap: spacing.md, alignSelf: 'stretch', minHeight: 52 },
  button: { flex: 1 },
});
