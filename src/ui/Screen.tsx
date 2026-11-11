import { ReactNode } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from './ThemeProvider';
import { spacing } from './theme';

type Props = { children: ReactNode; testID?: string; padded?: boolean; bottomInset?: boolean };

// Full-screen container that keeps content clear of the status bar (Android edge-to-edge) and the navigation bar.
export function Screen({ children, testID, padded = true, bottomInset = true }: Props) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      style={[
        styles.screen,
        { backgroundColor: colors.background, paddingTop: insets.top + spacing.md, paddingBottom: bottomInset ? insets.bottom + spacing.md : 0 },
        padded && styles.padded,
      ]}
    >
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: spacing.md },
  padded: { paddingHorizontal: spacing.md },
});
