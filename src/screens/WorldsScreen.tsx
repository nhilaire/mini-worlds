import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { PALETTE, WORLD_COLORS } from '../art/palette';
import { UI_SPRITES, WORLD_ICONS } from '../art/sprites';
import { SLOTS_PER_WORLD, STARS_PER_GAME, UnlockCondition, World, WorldId, WORLDS } from '../game/core/content';
import { Save, starsInWorld } from '../game/core/save';
import { conditionProgress, isWorldUnlocked } from '../game/core/unlocks';
import { Strings } from '../i18n';
import { useI18n } from '../i18n/I18nProvider';
import { useGameStore } from '../state/GameStore';
import { Button } from '../ui/Button';
import { Card, Row } from '../ui/Card';
import { PixelSprite } from '../ui/PixelSprite';
import { Screen } from '../ui/Screen';
import { useTheme } from '../ui/ThemeProvider';
import { BodyText, PixelText } from '../ui/Typography';
import { font, radius, spacing } from '../ui/theme';

export function conditionLabel(t: Strings, condition: UnlockCondition): string {
  switch (condition.kind) {
    case 'starsIn':
      return t.worlds.conditionStarsIn(condition.n, t.world[condition.world]);
    case 'starsTotal':
      return t.worlds.conditionStarsTotal(condition.n);
    case 'level':
      return t.worlds.conditionLevel(condition.n);
  }
}

function Conditions({ world, save }: { world: World; save: Save }) {
  const { t } = useI18n();
  return (
    <View style={styles.conditions}>
      {world.conditions.map((condition, i) => {
        const p = conditionProgress(save, condition);
        const label = conditionLabel(t, condition);
        return (
          <Row key={i} style={styles.between}>
            <BodyText size={font.small} style={styles.flex}>
              {world.comingSoon ? t.worlds.conditionSoon(label) : label}
            </BodyText>
            {!world.comingSoon && (
              <PixelText size={10} color={p.met ? 'success' : 'text'}>
                {t.worlds.progress(Math.min(p.current, condition.n), condition.n)}
              </PixelText>
            )}
          </Row>
        );
      })}
    </View>
  );
}

export function WorldsScreen({ onWorld }: { onWorld: (world: WorldId) => void }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const [locked, setLocked] = useState<World | null>(null);

  return (
    <Screen testID="worlds-screen" bottomInset={false}>
      <PixelText size={font.heading} accessibilityRole="header">
        {t.worlds.title}
      </PixelText>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {WORLDS.map((world) => {
          const unlocked = isWorldUnlocked(save, world.id);
          const state = unlocked ? t.worlds.open : world.comingSoon ? t.worlds.soon : t.worlds.locked;
          const stars = starsInWorld(save, world.games);
          return (
            <Card
              key={world.id}
              testID={`world-${world.id}`}
              accent={unlocked ? PALETTE[WORLD_COLORS[world.id]] : undefined}
              onPress={() => (unlocked ? onWorld(world.id) : setLocked(world))}
              accessibilityLabel={`${t.world[world.id]} - ${state}`}
            >
              <Row>
                <View style={[styles.icon, { backgroundColor: colors.surfaceAlt }]}>
                  <PixelSprite sprite={unlocked ? WORLD_ICONS[world.id] : UI_SPRITES.lock} scale={unlocked ? 3 : 4} />
                </View>
                <View style={styles.flex}>
                  <PixelText>{t.world[world.id]}</PixelText>
                  <PixelText size={8} color={unlocked ? 'success' : 'muted'} testID={`world-${world.id}-state`}>
                    {state}
                  </PixelText>
                </View>
                <View style={styles.counts}>
                  <PixelText size={8} color="muted">
                    {t.worlds.stars(stars, world.games.length * STARS_PER_GAME)}
                  </PixelText>
                  <PixelText size={8} color="muted">
                    {t.worlds.games(world.games.length, SLOTS_PER_WORLD)}
                  </PixelText>
                </View>
              </Row>
              {!unlocked && <Conditions world={world} save={save} />}
            </Card>
          );
        })}
      </ScrollView>

      <Modal visible={locked !== null} transparent animationType="fade" onRequestClose={() => setLocked(null)}>
        <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
          {locked && (
            <View style={[styles.dialog, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="world-locked-sheet">
              <Row>
                <PixelSprite sprite={WORLD_ICONS[locked.id]} scale={3} />
                <PixelText>{t.world[locked.id]}</PixelText>
              </Row>
              <PixelText size={8} color="muted">
                {locked.comingSoon ? t.worlds.soon : t.worlds.locked}
              </PixelText>
              <Conditions world={locked} save={save} />
              <Button label={t.worlds.back} variant="secondary" onPress={() => setLocked(null)} testID="world-locked-close" />
            </View>
          )}
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm, paddingBottom: spacing.lg },
  between: { justifyContent: 'space-between' },
  flex: { flex: 1 },
  icon: { width: 48, height: 48, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center' },
  counts: { alignItems: 'flex-end', gap: 2 },
  conditions: { gap: spacing.xs },
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  dialog: { borderRadius: radius.card, borderWidth: 2, padding: spacing.lg, gap: spacing.md },
});
