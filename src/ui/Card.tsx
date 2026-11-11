import { ReactNode } from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';

import { useTheme } from './ThemeProvider';
import { radius, spacing } from './theme';

type Props = { children: ReactNode; onPress?: () => void; testID?: string; style?: ViewStyle; accent?: string; accessibilityLabel?: string };

/** Rounded pixel-framed card; tappable when onPress is given. */
export function Card({ children, onPress, testID, style, accent, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const base = [styles.card, { backgroundColor: colors.surface, borderColor: accent ?? colors.border }, style];
  if (!onPress) {
    return (
      <View testID={testID} style={base}>
        {children}
      </View>
    );
  }
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [base, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, borderWidth: 2, padding: spacing.md, gap: spacing.sm },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
