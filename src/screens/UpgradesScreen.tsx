import { ScrollView, StyleSheet, View } from 'react-native';

import { UI_SPRITES } from '../art/sprites';
import { GameId, gameById, UPGRADE_MAX_LEVEL } from '../game/core/content';
import { upgradeLevel } from '../game/core/save';
import { canBuyUpgrade, nextUpgradeCost } from '../game/core/upgrades';
import { useI18n } from '../i18n/I18nProvider';
import { useGameStore } from '../state/GameStore';
import { Button } from '../ui/Button';
import { Card, Row } from '../ui/Card';
import { PixelSprite } from '../ui/PixelSprite';
import { Screen } from '../ui/Screen';
import { BodyText, PixelText } from '../ui/Typography';
import { useGameNames } from '../ui/names';
import { font, spacing } from '../ui/theme';

export function UpgradesScreen({ game, onBack }: { game: GameId; onBack: () => void }) {
  const { t } = useI18n();
  const { save, buy } = useGameStore();
  const names = useGameNames();

  return (
    <Screen testID="upgrades-screen">
      <Row style={styles.between}>
        <View>
          <PixelText size={font.heading} accessibilityRole="header">
            {t.upgrades.title}
          </PixelText>
          <PixelText size={8} color="muted">
            {names[game]}
          </PixelText>
        </View>
        <Row>
          <PixelSprite sprite={UI_SPRITES.coin} scale={2} />
          <PixelText color="accent" testID="upgrades-coins">
            {String(save.profile.coins)}
          </PixelText>
        </Row>
      </Row>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {gameById(game).upgrades.map((upgrade) => {
          const level = upgradeLevel(save, game, upgrade.id);
          const cost = nextUpgradeCost(save, game, upgrade.id);
          const affordable = canBuyUpgrade(save, game, upgrade.id);
          const maxed = level >= UPGRADE_MAX_LEVEL;
          return (
            <Card key={upgrade.id} testID={`upgrade-${upgrade.id}`}>
              <Row style={styles.between}>
                <PixelText>{t.upgrade[upgrade.id].name}</PixelText>
                <PixelText size={8} color="muted" testID={`upgrade-${upgrade.id}-level`}>
                  {t.upgrades.level(level)}
                </PixelText>
              </Row>
              <BodyText size={font.small}>{t.upgrade[upgrade.id].desc(Math.max(level, 1))}</BodyText>
              {!maxed && (
                <BodyText size={font.small} color="muted">
                  {t.upgrades.next}: {t.upgrade[upgrade.id].desc(level + 1)}
                </BodyText>
              )}
              <Row style={styles.between}>
                <PixelText size={10} color={affordable ? 'accent' : 'muted'} testID={`upgrade-${upgrade.id}-cost`}>
                  {maxed ? t.upgrades.max : t.upgrades.cost(cost ?? 0)}
                </PixelText>
                <View style={styles.buy}>
                  <Button label={maxed ? t.upgrades.max : t.upgrades.buy} compact disabled={!affordable} onPress={() => buy(game, upgrade.id)} testID={`upgrade-${upgrade.id}-buy`} />
                </View>
              </Row>
            </Card>
          );
        })}
      </ScrollView>
      <Button label={t.upgrades.back} onPress={onBack} variant="secondary" testID="upgrades-back" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  list: { gap: spacing.sm, paddingBottom: spacing.md },
  buy: { minWidth: 120 },
});
