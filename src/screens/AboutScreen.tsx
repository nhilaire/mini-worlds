import { ScrollView, StyleSheet, View } from 'react-native';

import { appName, APP_VERSION } from '../config/app';
import { useI18n } from '../i18n/I18nProvider';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { BodyText, PixelText } from '../ui/Typography';
import { font, spacing } from '../ui/theme';

// « À propos »: why this game exists (story from the discovery brief), a word from the author (a passionate
// developer, free time, bugs are possible), the player's data, the version.
function Section({ title, paragraphs }: { title: string; paragraphs: readonly string[] }) {
  return (
    <View style={styles.section}>
      <PixelText size={10} color="accent">
        {title}
      </PixelText>
      {paragraphs.map((p) => (
        <BodyText key={p}>{p}</BodyText>
      ))}
    </View>
  );
}

export function AboutScreen({ onBack }: { onBack: () => void }) {
  const { t, language } = useI18n();
  return (
    <Screen testID="about-screen">
      <PixelText size={font.heading} accessibilityRole="header">
        {t.about.title}
      </PixelText>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <PixelText size={font.hud} color="accent">
          {appName(language)}
        </PixelText>
        <Section title={t.about.storyTitle} paragraphs={t.about.story} />
        <Section title={t.about.authorTitle} paragraphs={t.about.author} />
        <Section title={t.about.dataTitle} paragraphs={t.about.data} />
        <BodyText color="muted" size={font.small} style={styles.version}>
          {t.about.version(APP_VERSION)}
        </BodyText>
      </ScrollView>
      <Button label={t.about.back} onPress={onBack} variant="secondary" testID="about-back" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg, paddingBottom: spacing.md },
  section: { gap: spacing.sm },
  version: { textAlign: 'center' },
});
