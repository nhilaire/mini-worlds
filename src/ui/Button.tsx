import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from './ThemeProvider';
import { font, PIXEL_FONT, radius, spacing } from './theme';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  compact?: boolean;
  testID?: string;
};

export function Button({ label, onPress, variant = 'primary', disabled = false, compact = false, testID }: Props) {
  const { colors } = useTheme();
  const background = variant === 'primary' ? colors.accent : variant === 'danger' ? colors.danger : colors.surfaceAlt;
  const color = variant === 'secondary' ? colors.text : colors.accentText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.base, compact && styles.compact, { backgroundColor: background, borderColor: colors.border }, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={[styles.label, compact && styles.compactLabel, { color }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 52, borderRadius: radius.button, borderWidth: 2, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  compact: { minHeight: 40, paddingHorizontal: spacing.md },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
  label: { fontSize: font.hud, fontFamily: PIXEL_FONT, textAlign: 'center', lineHeight: 18 },
  compactLabel: { fontSize: 10 },
});
