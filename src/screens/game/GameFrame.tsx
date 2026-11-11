// Common chrome and lifecycle of a round: HUD, pause overlay, background pause, Android back, tutorial bubbles,
// active-time clock and the hand-over of the final score. Each mini-game screen renders its board inside it.
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Modal, Pressable, StyleSheet, View } from 'react-native';

import { UI_SPRITES } from '../../art/sprites';
import { GameId, gameById } from '../../game/core/content';
import { useI18n } from '../../i18n/I18nProvider';
import { Round, useGameStore } from '../../state/GameStore';
import { Button } from '../../ui/Button';
import { PixelSprite } from '../../ui/PixelSprite';
import { Screen } from '../../ui/Screen';
import { useTheme } from '../../ui/ThemeProvider';
import { BodyText, PixelText } from '../../ui/Typography';
import { font, radius, spacing } from '../../ui/theme';
import { useRoundClock } from './useRoundClock';

export type TutorialStep = { key: string; text: string };

export type FinishNext = 'result' | 'restart';
export type OnFinish = (round: Round, next: FinishNext) => void;

export type RoundFrame = {
  /** The pause overlay is open. */
  paused: boolean;
  /** The engine may advance (not paused, no tutorial bubble, not over). */
  active: boolean;
  pause: () => void;
  resume: () => void;
  restart: () => void;
  quit: () => void;
  tutorialStep: TutorialStep | null;
  /** The player performed the action of a tutorial step (ignored when it is not the current one). */
  advanceTutorial: (key: string) => void;
  /** The engine reported the end of the round. */
  finish: (score: number, combos: number) => void;
  /** Combos so far (the game updates it from its events). */
  setCombos: (combos: number) => void;
};

type Params = { game: GameId; tutorialSteps: readonly TutorialStep[]; onFinish: OnFinish; score: () => number };

export function useRoundFrame({ game, tutorialSteps, onFinish, score }: Params): RoundFrame {
  const { save, completeTutorial } = useGameStore();
  const clock = useRoundClock();
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(false);
  const [stepIndex, setStepIndex] = useState(() => (save.games[game]?.tutorialDone ? tutorialSteps.length : 0));
  const combos = useRef(0);
  const finished = useRef(false);
  const tutorialStep = stepIndex < tutorialSteps.length ? tutorialSteps[stepIndex] : null;
  const active = !paused && !over && tutorialStep === null;

  // The clock runs exactly when the engine is active.
  useEffect(() => {
    if (active) clock.resume();
    else clock.pause();
  }, [active, clock]);

  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);

  const handOver = useCallback(
    (outcome: Round['outcome'], next: FinishNext) => {
      if (finished.current) return;
      finished.current = true;
      clock.pause();
      setOver(true);
      onFinish({ game, score: score(), durationS: clock.elapsedS(), combos: combos.current, outcome }, next);
    },
    [clock, game, onFinish, score],
  );

  const quit = useCallback(() => handOver('quit', 'result'), [handOver]);
  const restart = useCallback(() => handOver('quit', 'restart'), [handOver]);
  const finish = useCallback(
    (finalScore: number, finalCombos: number) => {
      combos.current = finalCombos;
      if (finished.current) return;
      finished.current = true;
      clock.pause();
      setOver(true);
      onFinish({ game, score: finalScore, durationS: clock.elapsedS(), combos: finalCombos, outcome: 'ended' }, 'result');
    },
    [clock, game, onFinish],
  );
  const setCombos = useCallback((value: number) => {
    combos.current = value;
  }, []);

  const advanceTutorial = useCallback(
    (key: string) => {
      setStepIndex((index) => {
        if (index >= tutorialSteps.length || tutorialSteps[index].key !== key) return index;
        if (index + 1 >= tutorialSteps.length) completeTutorial(game);
        return index + 1;
      });
    },
    [completeTutorial, game, tutorialSteps],
  );

  // Background → pause overlay; Android back → pause (or resume when already paused).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setPaused(true);
    });
    return () => sub?.remove();
  }, []);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setPaused((p) => !p);
      return true;
    });
    return () => sub.remove();
  }, []);

  return { paused, active, pause, resume, restart, quit, tutorialStep, advanceTutorial, finish, setCombos };
}

type FrameProps = {
  game: GameId;
  frame: RoundFrame;
  score: number;
  /** Game-specific HUD items (lines, moves, next row...). */
  hud: ReactNode;
  children: ReactNode;
  testID: string;
};

export function GameFrame({ game, frame, score, hud, children, testID }: FrameProps) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const thresholds = gameById(game).stars;
  const nextStar = thresholds.find((s) => s > score) ?? null;
  const stars = save.games[game]?.stars ?? 0;

  return (
    <Screen testID={testID} padded={false}>
      <View style={styles.hud}>
        <View style={styles.hudItem}>
          <PixelText size={8} color="muted">
            {t.hud.score}
          </PixelText>
          <PixelText testID="hud-score" accessibilityLabel={String(score)}>
            {String(score)}
          </PixelText>
        </View>
        {hud}
        <View style={styles.hudItem}>
          <PixelText size={8} color="muted">
            {nextStar === null ? t.hud.allStars : t.hud.nextStar(nextStar)}
          </PixelText>
          <View style={styles.stars}>
            {[0, 1, 2].map((i) => (
              <PixelSprite key={i} sprite={i < stars || thresholds[i] <= score ? UI_SPRITES.star : UI_SPRITES.starEmpty} scale={2} />
            ))}
          </View>
        </View>
        <Pressable testID="game-pause" accessibilityRole="button" accessibilityLabel={t.hud.pause} onPress={frame.pause} style={[styles.pauseButton, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <PixelText size={8}>II</PixelText>
        </Pressable>
      </View>

      <View style={styles.board}>{children}</View>

      {frame.tutorialStep && (
        <View style={[styles.bubble, { backgroundColor: colors.accent }]} pointerEvents="none" testID="tutorial-bubble">
          <BodyText size={font.small} style={{ color: colors.accentText, textAlign: 'center' }} testID={`tutorial-${frame.tutorialStep.key}`}>
            {frame.tutorialStep.text}
          </BodyText>
        </View>
      )}

      <Modal visible={frame.paused} transparent animationType="fade" onRequestClose={frame.resume}>
        <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.dialog, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="pause-overlay">
            <PixelText size={font.heading}>{t.pause.title}</PixelText>
            <Button label={t.pause.resume} onPress={frame.resume} testID="pause-resume" />
            <Button label={t.pause.restart} onPress={frame.restart} variant="secondary" testID="pause-restart" />
            <Button label={t.pause.quit} onPress={frame.quit} variant="secondary" testID="pause-quit" />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hud: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, gap: spacing.sm },
  hudItem: { gap: 2 },
  stars: { flexDirection: 'row', gap: 2 },
  pauseButton: { width: 40, height: 40, borderRadius: radius.chip, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  board: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bubble: { position: 'absolute', top: 100, left: spacing.lg, right: spacing.lg, padding: spacing.md, borderRadius: radius.card },
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  dialog: { borderRadius: radius.card, borderWidth: 2, padding: spacing.lg, gap: spacing.md, alignItems: 'stretch' },
});
