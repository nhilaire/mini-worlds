import { ScrollView, StyleSheet, View } from 'react-native';

import { UI_SPRITES, VEGETABLES } from '../art/sprites';
import { ACHIEVEMENTS, GAME_IDS, GAMES, STARS_PER_GAME } from '../game/core/content';
import { gameSave, totalStars } from '../game/core/save';
import { useI18n } from '../i18n/I18nProvider';
import { useGameStore } from '../state/GameStore';
import { Button } from '../ui/Button';
import { Card, Row } from '../ui/Card';
import { PixelSprite } from '../ui/PixelSprite';
import { Screen } from '../ui/Screen';
import { useTheme } from '../ui/ThemeProvider';
import { BodyText, PixelText } from '../ui/Typography';
import { font, radius, spacing } from '../ui/theme';

export function ProfileScreen({ onSettings, onAbout }: { onSettings: () => void; onAbout: () => void }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { profile } = save;
  const discovered = GAME_IDS.filter((id) => gameSave(save, id).rounds > 0).length;
  const stats: { key: string; label: string; value: string }[] = [
    { key: 'rounds', label: t.profile.rounds, value: String(profile.roundsPlayed) },
    { key: 'games', label: t.profile.games, value: `${discovered} / ${GAMES.length}` },
    { key: 'stars', label: t.profile.stars, value: `${totalStars(save)} / ${GAMES.length * STARS_PER_GAME}` },
    { key: 'coins', label: t.profile.coinsTotal, value: String(profile.lifetimeCoins) },
    { key: 'days', label: t.profile.days, value: String(profile.daysPlayed) },
  ];

  return (
    <Screen testID="profile-screen" bottomInset={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Row>
          <View style={[styles.avatar, { backgroundColor: colors.surfaceAlt, borderColor: colors.accent }]}>
            <PixelSprite sprite={VEGETABLES.tomato} scale={4} />
          </View>
          <View style={styles.flex}>
            <PixelText size={font.heading} accessibilityRole="header">
              {t.profile.title}
            </PixelText>
            <PixelText size={10} color="accent" testID="profile-level">
              {t.home.level(profile.level)}
            </PixelText>
          </View>
        </Row>

        <Card>
          {stats.map((s) => (
            <Row key={s.key} style={styles.between}>
              <BodyText size={font.small}>{s.label}</BodyText>
              <PixelText size={10} testID={`profile-${s.key}`}>
                {s.value}
              </PixelText>
            </Row>
          ))}
        </Card>

        <PixelText size={10} color="muted">
          {t.profile.achievements}
        </PixelText>
        <View style={styles.grid}>
          {ACHIEVEMENTS.map((a) => {
            const unlocked = save.achievements.includes(a.id);
            return (
              <View
                key={a.id}
                testID={`achievement-${a.id}${unlocked ? '-unlocked' : ''}`}
                style={[styles.badge, { backgroundColor: colors.surface, borderColor: unlocked ? colors.accent : colors.border, opacity: unlocked ? 1 : 0.55 }]}
              >
                <PixelSprite sprite={unlocked ? UI_SPRITES.star : UI_SPRITES.lock} scale={2} />
                <PixelText size={7} style={styles.center}>
                  {t.achievement[a.id]}
                </PixelText>
                <BodyText size={11} color="muted" style={styles.center}>
                  {t.achievementHint[a.id]}
                </BodyText>
              </View>
            );
          })}
        </View>

        <Button label={t.profile.settings} onPress={onSettings} variant="secondary" testID="profile-settings" />
        <Button label={t.profile.about} onPress={onAbout} variant="secondary" testID="profile-about" />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.lg },
  avatar: { width: 64, height: 64, borderRadius: radius.card, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  between: { justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: { width: '30%', flexGrow: 1, borderRadius: radius.chip, borderWidth: 2, padding: spacing.sm, alignItems: 'center', gap: spacing.xs },
  center: { textAlign: 'center' },
});
