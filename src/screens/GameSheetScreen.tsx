import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GameId, gameById } from '../game/core/content';
import { gameSave } from '../game/core/save';
import { affordableUpgrades, upgradeLevels } from '../game/core/upgrades';
import { isGameUnlocked } from '../game/core/unlocks';
import { BASE_MOVES } from '../game/garden/engine';
import { useI18n } from '../i18n/I18nProvider';
import { useGameStore } from '../state/GameStore';
import { Button } from '../ui/Button';
import { Card, Row } from '../ui/Card';
import { GameIcon } from '../ui/GameIcon';
import { Screen } from '../ui/Screen';
import { Stars } from '../ui/Stars';
import { BodyText, PixelText } from '../ui/Typography';
import { useGameNames } from '../ui/names';
import { font, spacing } from '../ui/theme';

type Props = { game: GameId; onPlay: () => void; onUpgrades: () => void; onBack: () => void };

export function GameSheetScreen({ game, onPlay, onUpgrades, onBack }: Props) {
  const { t } = useI18n();
  const { save, resetTutorial } = useGameStore();
  const names = useGameNames();
  const [tutorialReset, setTutorialReset] = useState(false);
  const def = gameById(game);
  const data = gameSave(save, game);
  const affordable = affordableUpgrades(save, game);
  const levels = upgradeLevels(save, game);
  const description = game === 'garden' ? t.game.garden.desc(BASE_MOVES + (levels.extra_move ?? 0)) : t.game[game].desc;

  return (
    <Screen testID="game-sheet-screen">
      <View style={styles.hero}>
        <GameIcon game={game} scale={6} testID="sheet-icon" />
        <PixelText size={font.heading} accessibilityRole="header" testID="sheet-name">
          {names[game]}
        </PixelText>
        <BodyText color="muted" size={font.small} style={styles.center}>
          {description}
        </BodyText>
      </View>

      <Button label={t.sheet.play} onPress={onPlay} disabled={!isGameUnlocked(save, game)} testID="sheet-play" />

      <Card>
        <Row style={styles.between}>
          <PixelText size={10} color="muted">
            {t.sheet.best}
          </PixelText>
          <PixelText testID="sheet-best">{String(data.bestScore)}</PixelText>
        </Row>
        <Row style={styles.between}>
          <PixelText size={10} color="muted">
            {t.sheet.stars}
          </PixelText>
          <Stars count={data.stars} testID="sheet-stars" />
        </Row>
        <PixelText size={8} color="muted" testID="sheet-thresholds">
          {t.sheet.thresholds(def.stars[0], def.stars[1], def.stars[2])}
        </PixelText>
      </Card>

      <Button label={affordable > 0 ? `${t.sheet.upgrades} (${t.sheet.affordable(affordable)})` : t.sheet.upgrades} onPress={onUpgrades} variant="secondary" testID="sheet-upgrades" />
      {data.tutorialDone && !tutorialReset && (
        <Button
          label={t.sheet.tutorial}
          variant="secondary"
          compact
          testID="sheet-tutorial"
          onPress={() => {
            resetTutorial(game);
            setTutorialReset(true);
          }}
        />
      )}
      {tutorialReset && (
        <BodyText color="muted" size={font.small} style={styles.center} testID="sheet-tutorial-reset">
          {t.sheet.tutorialReset}
        </BodyText>
      )}
      <View style={styles.flex} />
      <Button label={t.sheet.back} onPress={onBack} variant="secondary" testID="sheet-back" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.sm },
  center: { textAlign: 'center' },
  between: { justifyContent: 'space-between' },
  flex: { flex: 1 },
});
