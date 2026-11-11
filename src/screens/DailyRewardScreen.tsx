import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { UI_SPRITES } from '../art/sprites';
import { today } from '../game/clock';
import { DAILY_REWARDS } from '../game/core/content';
import { CALENDAR_DAYS, canCollectDaily, nextCalendarDay } from '../game/core/daily';
import type { CollectResult } from '../game/core/engine';
import { useI18n } from '../i18n/I18nProvider';
import { useGameStore } from '../state/GameStore';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PixelSprite } from '../ui/PixelSprite';
import { Screen } from '../ui/Screen';
import { useTheme } from '../ui/ThemeProvider';
import { BodyText, PixelText } from '../ui/Typography';
import { font, radius, spacing } from '../ui/theme';

export function DailyRewardScreen({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save, collectDaily } = useGameStore();
  const [collected, setCollected] = useState<CollectResult | null>(null);
  const collectable = canCollectDaily(save.dailyReward, today());
  // The day highlighted: the one to collect now, or the one just collected.
  const day = collected ? collected.reward.day : collectable ? nextCalendarDay(save.dailyReward, today()) : save.dailyReward.calendarDay;
  const nextDay = (day % CALENDAR_DAYS) + 1;

  return (
    <Screen testID="daily-screen">
      <PixelText size={font.heading} accessibilityRole="header">
        {t.daily.title}
      </PixelText>
      <View style={styles.grid}>
        {DAILY_REWARDS.map((reward, i) => {
          const n = i + 1;
          const isToday = n === day;
          const past = collected || !collectable ? n < day : n < day;
          const done = past || (isToday && !collectable);
          return (
            <View
              key={n}
              testID={`daily-day-${n}`}
              style={[styles.cell, { backgroundColor: isToday ? colors.accent : colors.surface, borderColor: isToday ? colors.accent : colors.border }, n === CALENDAR_DAYS && styles.wide]}
            >
              <PixelText size={8} style={{ color: isToday ? colors.accentText : colors.muted }}>
                {t.daily.day(n)}
              </PixelText>
              <PixelSprite sprite={done ? UI_SPRITES.check : n === CALENDAR_DAYS ? UI_SPRITES.chest : UI_SPRITES.coin} scale={2} />
              <PixelText size={8} style={{ color: isToday ? colors.accentText : colors.text }}>
                {reward.xp > 0 ? t.daily.coinsXp(reward.coins, reward.xp) : t.daily.coins(reward.coins)}
              </PixelText>
            </View>
          );
        })}
      </View>
      {collected && (
        <Card testID="daily-collected">
          <PixelText color="accent">{collected.reward.xp > 0 ? t.daily.coinsXp(collected.reward.coins, collected.reward.xp) : t.daily.coins(collected.reward.coins)}</PixelText>
          {collected.levelUps.map((up) => (
            <PixelText key={up.level} size={10} color="accent" testID={`daily-level-${up.level}`}>
              {t.result.levelUp(up.level, up.coins)}
            </PixelText>
          ))}
          {collected.worldsUnlocked.map((world) => (
            <PixelText key={world} size={10} color="success" testID={`daily-unlock-${world}`}>
              {t.result.unlock(t.world[world])}
            </PixelText>
          ))}
          <BodyText color="muted" size={font.small}>
            {t.daily.tomorrow(nextDay)}
          </BodyText>
        </Card>
      )}
      <View style={styles.flex} />
      {collectable ? (
        <Button label={t.daily.collect} onPress={() => setCollected(collectDaily())} testID="daily-collect" />
      ) : (
        <Button label={t.daily.collected} onPress={() => {}} disabled testID="daily-collected-button" />
      )}
      <Button label={t.daily.back} onPress={onBack} variant="secondary" testID="daily-back" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: { width: '30%', flexGrow: 1, borderRadius: radius.card, borderWidth: 2, padding: spacing.sm, alignItems: 'center', gap: spacing.xs },
  wide: { width: '100%' },
  flex: { flex: 1 },
});
