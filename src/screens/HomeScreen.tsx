import { ScrollView, StyleSheet, View } from 'react-native';

import { UI_SPRITES, WORLD_ICONS } from '../art/sprites';
import { appName } from '../config/app';
import { challengeProgress } from '../game/core/challenges';
import { GameId, xpToNextLevel } from '../game/core/content';
import { canCollectDaily } from '../game/core/daily';
import { dailyGameFor } from '../game/core/dailyGame';
import { today } from '../game/clock';
import { conditionProgress, nextUnlock } from '../game/core/unlocks';
import { useI18n } from '../i18n/I18nProvider';
import { useGameStore } from '../state/GameStore';
import { Button } from '../ui/Button';
import { Card, Row } from '../ui/Card';
import { GameIcon } from '../ui/GameIcon';
import { PixelSprite } from '../ui/PixelSprite';
import { Screen } from '../ui/Screen';
import { useTheme } from '../ui/ThemeProvider';
import { BodyText, PixelText } from '../ui/Typography';
import { useGameNames } from '../ui/names';
import { font, spacing } from '../ui/theme';

type Props = {
  onPlay: (game: GameId) => void;
  onDaily: () => void;
  onGame: (game: GameId) => void;
  onWorlds: () => void;
};

const DEFAULT_GAME: GameId = 'blocks';

export function HomeScreen({ onPlay, onDaily, onGame, onWorlds }: Props) {
  const { t, language } = useI18n();
  const { colors } = useTheme();
  const { save, sessionSeed } = useGameStore();
  const names = useGameNames();
  const { profile } = save;
  const next = xpToNextLevel(profile.level);
  const xpRatio = Math.min(1, profile.xp / next);
  const dailyReady = canCollectDaily(save.dailyReward, today());
  const playGame = profile.lastPlayedGame ?? DEFAULT_GAME;
  const unlock = nextUnlock(save);
  const dailyGame = dailyGameFor(save, today(), sessionSeed ?? undefined);

  return (
    <Screen testID="home-screen" bottomInset={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PixelText size={font.pixelBig} color="accent" accessibilityRole="header">
          {appName(language)}
        </PixelText>
        <BodyText color="muted" size={font.small}>
          {t.app.pitch}
        </BodyText>

        <Card testID="home-profile">
          <Row style={styles.between}>
            <PixelText testID="home-level">{t.home.level(profile.level)}</PixelText>
            <Row>
              <PixelSprite sprite={UI_SPRITES.coin} scale={2} />
              <PixelText testID="home-coins" color="accent">
                {t.home.coins(profile.coins)}
              </PixelText>
            </Row>
          </Row>
          <View style={[styles.bar, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="progressbar">
            <View style={[styles.fill, { width: `${Math.round(xpRatio * 100)}%`, backgroundColor: colors.accent }]} />
          </View>
          <PixelText size={8} color="muted" testID="home-xp">
            {t.home.xp(profile.xp, next)}
          </PixelText>
        </Card>

        {dailyReady && (
          <Card testID="home-daily" onPress={onDaily} accent={colors.accent} accessibilityLabel={t.home.dailyReady}>
            <Row>
              <PixelSprite sprite={UI_SPRITES.chest} scale={3} />
              <BodyText style={styles.flex}>{t.home.dailyReady}</BodyText>
            </Row>
          </Card>
        )}

        <Card testID="home-daily-game" accent={colors.accent} accessibilityLabel={t.home.dailyGame}>
          <Row>
            <GameIcon game={dailyGame} scale={3} />
            <View style={styles.flex}>
              <PixelText size={10} color="muted">
                {t.home.dailyGame}
              </PixelText>
              <PixelText testID="home-daily-game-name">{names[dailyGame]}</PixelText>
              <PixelText size={8} color="accent" testID="home-daily-game-boost">
                {t.home.dailyGameBoost}
              </PixelText>
            </View>
          </Row>
          <Button label={t.home.play} onPress={() => onPlay(dailyGame)} variant="secondary" testID="home-daily-game-play" />
        </Card>

        <Button label={t.home.play} onPress={() => onPlay(playGame)} testID="home-play" />

        <Card testID="home-challenges">
          <PixelText size={10} color="muted">
            {t.home.challenges}
          </PixelText>
          {save.challenges.ids.map((id) => {
            const p = challengeProgress(save, id);
            return (
              <Row key={id} style={styles.between}>
                <Row style={styles.flex}>
                  <PixelSprite sprite={p.completed ? UI_SPRITES.check : UI_SPRITES.starEmpty} scale={2} />
                  <BodyText size={font.small} style={styles.flex} testID={`challenge-${id}`}>
                    {t.challenge[id]}
                  </BodyText>
                </Row>
                <PixelText size={10} color={p.completed ? 'success' : 'text'} testID={`challenge-${id}-progress`}>
                  {t.challenge.progress(p.done, p.target)}
                </PixelText>
              </Row>
            );
          })}
        </Card>

        <Card testID="home-next-unlock" onPress={onWorlds} accessibilityLabel={t.home.nextUnlock}>
          <PixelText size={10} color="muted">
            {t.home.nextUnlock}
          </PixelText>
          {unlock ? (
            <>
              <Row>
                <PixelSprite sprite={WORLD_ICONS[unlock.id]} scale={2} />
                <PixelText>{t.world[unlock.id]}</PixelText>
              </Row>
              {unlock.conditions.map((condition, i) => {
                const p = conditionProgress(save, condition);
                const label =
                  condition.kind === 'starsIn'
                    ? t.worlds.conditionStarsIn(condition.n, t.world[condition.world])
                    : condition.kind === 'starsTotal'
                      ? t.worlds.conditionStarsTotal(condition.n)
                      : t.worlds.conditionLevel(condition.n);
                return (
                  <Row key={i} style={styles.between}>
                    <BodyText size={font.small} style={styles.flex}>
                      {label}
                    </BodyText>
                    <PixelText size={10} color={p.met ? 'success' : 'text'}>
                      {t.worlds.progress(Math.min(p.current, condition.n), condition.n)}
                    </PixelText>
                  </Row>
                );
              })}
            </>
          ) : (
            <BodyText size={font.small}>{t.home.allUnlocked}</BodyText>
          )}
        </Card>

        {profile.recentGames.length > 0 && (
          <View style={styles.recent}>
            <PixelText size={10} color="muted">
              {t.home.recent}
            </PixelText>
            <Row>
              {profile.recentGames.map((game) => (
                <Card key={game} testID={`recent-${game}`} onPress={() => onGame(game)} style={styles.chip} accessibilityLabel={names[game]}>
                  <PixelText size={8}>{names[game]}</PixelText>
                </Card>
              ))}
            </Row>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.lg },
  between: { justifyContent: 'space-between' },
  flex: { flex: 1 },
  bar: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%' },
  recent: { gap: spacing.sm },
  chip: { flex: 1, padding: spacing.sm, alignItems: 'center' },
});
