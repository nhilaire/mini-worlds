import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import type { ThemeSetting } from '../game/core/save';
import { LANGUAGE_NAMES, LANGUAGES, LanguageSetting } from '../i18n';
import { useI18n } from '../i18n/I18nProvider';
import { useGameStore } from '../state/GameStore';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { useTheme } from '../ui/ThemeProvider';
import { BodyText, PixelText } from '../ui/Typography';
import { font, radius, spacing } from '../ui/theme';

type Props = { telemetryEnabled: boolean; onToggleTelemetry: (granted: boolean) => void; onBack: () => void };

function Choices<V extends string>({ label, value, choices, onChange, prefix }: { label: string; value: V; choices: { value: V; label: string }[]; onChange: (v: V) => void; prefix: string }) {
  const { colors } = useTheme();
  return (
    <Card>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.group}>
        <PixelText size={10} color="muted">
          {label}
        </PixelText>
        {choices.map((choice) => {
          const selected = choice.value === value;
          return (
            <Pressable
              key={choice.value}
              testID={`${prefix}-${choice.value}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={choice.label}
              onPress={() => onChange(choice.value)}
              style={[styles.choice, { borderColor: selected ? colors.accent : colors.border }]}
            >
              <BodyText color={selected ? 'text' : 'muted'}>{choice.label}</BodyText>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

function Toggle({ label, help, value, onChange, testID }: { label: string; help?: string; value: boolean; onChange: (v: boolean) => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <Card>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <BodyText>{label}</BodyText>
          {help && (
            <BodyText color="muted" size={font.small}>
              {help}
            </BodyText>
          )}
        </View>
        <Switch value={value} onValueChange={onChange} accessibilityLabel={label} testID={testID} trackColor={{ true: colors.accent, false: colors.surfaceAlt }} />
      </View>
    </Card>
  );
}

export function SettingsScreen({ telemetryEnabled, onToggleTelemetry, onBack }: Props) {
  const { t, setting, setSetting } = useI18n();
  const { save, setSettings, reset } = useGameStore();
  const [confirming, setConfirming] = useState(false);
  const { colors } = useTheme();

  const languageChoices: { value: LanguageSetting; label: string }[] = [
    { value: 'auto', label: t.settings.languageAuto },
    ...LANGUAGES.map((language) => ({ value: language, label: LANGUAGE_NAMES[language] })),
  ];
  const themeChoices: { value: ThemeSetting; label: string }[] = [
    { value: 'auto', label: t.settings.themeAuto },
    { value: 'light', label: t.settings.themeLight },
    { value: 'dark', label: t.settings.themeDark },
  ];

  return (
    <Screen testID="settings-screen">
      <PixelText size={font.heading} accessibilityRole="header">
        {t.settings.title}
      </PixelText>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Toggle label={t.settings.sound} value={save.settings.sound} onChange={(sound) => setSettings({ sound })} testID="settings-sound" />
        <Toggle label={t.settings.vibrations} value={save.settings.vibrations} onChange={(vibrations) => setSettings({ vibrations })} testID="settings-vibrations" />
        <Choices label={t.settings.theme} value={save.settings.theme} choices={themeChoices} onChange={(theme) => setSettings({ theme })} prefix="settings-theme" />
        <Choices label={t.settings.language} value={setting} choices={languageChoices} onChange={setSetting} prefix="settings-language" />
        <Toggle label={t.settings.telemetry} help={t.settings.telemetryHelp} value={telemetryEnabled} onChange={onToggleTelemetry} testID="settings-telemetry" />
        <Button label={t.settings.reset} onPress={() => setConfirming(true)} variant="danger" testID="settings-reset" />
      </ScrollView>
      <Button label={t.settings.back} onPress={onBack} variant="secondary" testID="settings-back" />

      <Modal visible={confirming} transparent animationType="fade" onRequestClose={() => setConfirming(false)}>
        <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.dialog, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="settings-reset-dialog">
            <BodyText>{t.settings.resetConfirm}</BodyText>
            <Button
              label={t.settings.resetYes}
              variant="danger"
              testID="settings-reset-confirm"
              onPress={() => {
                setConfirming(false);
                void reset();
              }}
            />
            <Button label={t.settings.resetNo} variant="secondary" testID="settings-reset-cancel" onPress={() => setConfirming(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, gap: spacing.xs },
  group: { gap: spacing.sm },
  choice: { minHeight: 44, borderRadius: radius.chip, paddingHorizontal: spacing.md, justifyContent: 'center', borderWidth: 2 },
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  dialog: { borderRadius: radius.card, borderWidth: 2, padding: spacing.lg, gap: spacing.md },
});
