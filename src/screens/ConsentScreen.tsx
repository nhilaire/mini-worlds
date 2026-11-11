import { StyleSheet, View } from 'react-native';

import { useI18n } from '../i18n/I18nProvider';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { BodyText, PixelText } from '../ui/Typography';
import { font, spacing } from '../ui/theme';

// First-launch consent (GDPR/CNIL): both choices are equally easy, nothing is sent before a choice.
export function ConsentScreen({ onDecision }: { onDecision: (granted: boolean) => void }) {
  const { t } = useI18n();
  return (
    <Screen testID="consent-screen">
      <View style={styles.content}>
        <PixelText size={font.heading} accessibilityRole="header">
          {t.consent.title}
        </PixelText>
        <BodyText>{t.consent.body}</BodyText>
      </View>
      <Button label={t.consent.accept} onPress={() => onDecision(true)} testID="consent-accept" />
      <Button label={t.consent.refuse} onPress={() => onDecision(false)} testID="consent-refuse" variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'center', gap: spacing.lg },
});
