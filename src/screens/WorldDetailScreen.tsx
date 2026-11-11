import { StyleSheet, View } from 'react-native';

import { PALETTE, WORLD_COLORS } from '../art/palette';
import { UI_SPRITES, WORLD_ICONS } from '../art/sprites';
import { GameId, SLOTS_PER_WORLD, WorldId, worldById } from '../game/core/content';
import { gameSave } from '../game/core/save';
import { affordableUpgrades } from '../game/core/upgrades';
import { useI18n } from '../i18n/I18nProvider';
import { useGameStore } from '../state/GameStore';
import { Button } from '../ui/Button';
import { Card, Row } from '../ui/Card';
import { GameIcon } from '../ui/GameIcon';
import { PixelSprite } from '../ui/PixelSprite';
import { Screen } from '../ui/Screen';
import { Stars } from '../ui/Stars';
import { useTheme } from '../ui/ThemeProvider';
import { PixelText } from '../ui/Typography';
import { useGameNames } from '../ui/names';
import { font, radius, spacing } from '../ui/theme';

export function WorldDetailScreen({ world, onGame, onBack }: { world: WorldId; onGame: (game: GameId) => void; onBack: () => void }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const names = useGameNames();
  const def = worldById(world);
  const accent = PALETTE[WORLD_COLORS[world]];
  const slots = Array.from({ length: SLOTS_PER_WORLD }, (_, i) => def.games[i] ?? null);

  return (
    <Screen testID="world-detail-screen">
      <Row>
        <PixelSprite sprite={WORLD_ICONS[world]} scale={3} />
        <PixelText size={font.heading} accessibilityRole="header" style={{ color: accent }}>
          {t.world[world]}
        </PixelText>
      </Row>
      <View style={styles.slots}>
        {slots.map((game, i) => {
          if (!game) {
            return (
              <Card key={i} testID={`slot-soon-${i}`} style={styles.soon}>
                <Row>
                  <PixelSprite sprite={UI_SPRITES.lock} scale={2} />
                  <PixelText size={8} color="muted">
                    {t.worlds.soon}
                  </PixelText>
                </Row>
              </Card>
            );
          }
          const data = gameSave(save, game);
          const affordable = affordableUpgrades(save, game);
          return (
            <Card key={game} testID={`game-${game}`} onPress={() => onGame(game)} accent={accent} accessibilityLabel={names[game]}>
              <Row>
                <GameIcon game={game} scale={3} />
                <View style={styles.flex}>
                  <PixelText>{names[game]}</PixelText>
                  <PixelText size={8} color="muted" testID={`game-${game}-best`}>
                    {t.sheet.best}: {data.bestScore}
                  </PixelText>
                  <Stars count={data.stars} scale={2} />
                </View>
                {affordable > 0 && (
                  <View style={[styles.badge, { backgroundColor: colors.accent }]} testID={`game-${game}-upgrade-badge`}>
                    <PixelText size={8} style={{ color: colors.accentText }}>
                      {affordable}
                    </PixelText>
                  </View>
                )}
              </Row>
            </Card>
          );
        })}
      </View>
      <View style={styles.flex} />
      <Button label={t.worlds.back} onPress={onBack} variant="secondary" testID="world-back" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  slots: { gap: spacing.sm },
  soon: { opacity: 0.6, paddingVertical: spacing.sm },
  flex: { flex: 1 },
  badge: { width: 28, height: 28, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center' },
});
