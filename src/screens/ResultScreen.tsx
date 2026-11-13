import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

import { UI_SPRITES } from '../art/sprites';
import { GameId } from '../game/core/content';
import type { RoundResult } from '../game/core/engine';
import { playFeedback } from '../feedback/feedback';
import { useI18n } from '../i18n/I18nProvider';
import { useGameStore } from '../state/GameStore';
import { Button } from '../ui/Button';
import { Card, Row } from '../ui/Card';
import { PixelSprite } from '../ui/PixelSprite';
import { Screen } from '../ui/Screen';
import { Stars } from '../ui/Stars';
import { BodyText, PixelText } from '../ui/Typography';
import { useGameNames } from '../ui/names';
import { font, spacing } from '../ui/theme';

type Props = { game: GameId; result: RoundResult; onReplay: () => void; onUpgrade: () => void; onBack: () => void };

const COUNT_UP_MS = 700;

/** Counts from 0 to `target` over COUNT_UP_MS (bounded timer, finite for the test runner). */
function useCountUp(target: number): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target <= 0) return;
    const start = Date.now();
    const id = setInterval(() => {
      const ratio = Math.min(1, (Date.now() - start) / COUNT_UP_MS);
      setValue(Math.round(target * ratio));
      if (ratio >= 1) clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, [target]);
  return value;
}

export function ResultScreen({ game, result, onReplay, onUpgrade, onBack }: Props) {
  const { t } = useI18n();
  const names = useGameNames();
  const { save } = useGameStore();
  const shown = useCountUp(result.score);

  // One sound for the round's best moment: level-up > new star > coins; plus the unlock jingle.
  useEffect(() => {
    if (result.short) return;
    const settings = save.settings;
    playFeedback(result.levelUps.length > 0 ? 'level_up' : result.newStars > 0 ? 'star' : 'coin', settings);
    if (result.worldsUnlocked.length > 0 || result.gamesUnlocked.length > 0) playFeedback('reward', settings);
  }, [result, save.settings]);

  return (
    <Screen testID="result-screen">
      <PixelText size={font.heading} accessibilityRole="header">
        {t.result.title}
      </PixelText>
      <PixelText size={8} color="muted">
        {names[game]}
      </PixelText>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(300)}>
          <Card style={styles.center}>
            <PixelText size={10} color="muted">
              {t.result.score}
            </PixelText>
            <PixelText size={28} testID="result-score" accessibilityLabel={String(result.score)}>
              {String(shown)}
            </PixelText>
            {result.newBest && (
              <PixelText size={10} color="accent" testID="result-new-best">
                {t.result.newBest}
              </PixelText>
            )}
            {result.short && (
              <BodyText color="danger" size={font.small} testID="result-short" style={styles.centerText}>
                {t.result.short}
              </BodyText>
            )}
          </Card>
        </Animated.View>

        {!result.short && (
          <Animated.View entering={FadeInUp.delay(300).duration(300)}>
            <Card>
              <Row style={styles.between}>
                <PixelText size={10} color="muted">
                  {t.result.stars}
                </PixelText>
                <Stars count={result.starsAfter} highlight={result.newStars} testID="result-stars" />
              </Row>
              <Row style={styles.between}>
                <Row>
                  <PixelSprite sprite={UI_SPRITES.coin} scale={2} />
                  <PixelText testID="result-coins">{t.result.coins(result.coins)}</PixelText>
                </Row>
                <PixelText testID="result-xp">{t.result.xp(result.xp)}</PixelText>
              </Row>
              {result.levelUps.map((up) => (
                <PixelText key={up.level} size={10} color="accent" testID={`result-level-${up.level}`}>
                  {t.result.levelUp(up.level, up.coins)}
                </PixelText>
              ))}
              {result.worldsUnlocked.map((world) => (
                <PixelText key={world} size={10} color="success" testID={`result-unlock-${world}`}>
                  {t.result.unlock(t.world[world])}
                </PixelText>
              ))}
              {result.gamesUnlocked.map((game) => (
                <PixelText key={game} size={10} color="success" testID={`result-new-game-${game}`}>
                  {t.result.newGame(t.game[game].name)}
                </PixelText>
              ))}
              {result.challengesCompleted.map((id) => (
                <BodyText key={id} size={font.small} color="success" testID={`result-challenge-${id}`}>
                  {t.result.challengeDone(t.challenge[id])}
                </BodyText>
              ))}
              {result.allChallengesBonus && (
                <BodyText size={font.small} color="success">
                  {t.challenge.allDone}
                </BodyText>
              )}
            </Card>
          </Animated.View>
        )}
      </ScrollView>
      <View style={styles.actions}>
        <Button label={t.result.replay} onPress={onReplay} testID="result-replay" />
        <Row>
          <View style={styles.flex}>
            <Button label={t.result.upgrade} onPress={onUpgrade} variant="secondary" testID="result-upgrade" />
          </View>
          <View style={styles.flex}>
            <Button label={t.result.back} onPress={onBack} variant="secondary" testID="result-back" />
          </View>
        </Row>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.md },
  center: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  between: { justifyContent: 'space-between' },
  actions: { gap: spacing.sm },
  flex: { flex: 1 },
});
