import { ReactNode } from 'react';
import { StyleSheet, Text, TextProps } from 'react-native';

import { useTheme } from './ThemeProvider';
import { font, PIXEL_FONT } from './theme';

type Props = TextProps & { children: ReactNode; color?: 'text' | 'muted' | 'accent' | 'danger' | 'success'; size?: number };

/** Pixel-font text for titles, HUD values and labels (short strings, digits, names). */
export function PixelText({ children, color = 'text', size = font.hud, style, ...rest }: Props) {
  const { colors } = useTheme();
  return (
    <Text {...rest} style={[styles.pixel, { color: colors[color], fontSize: size, lineHeight: Math.round(size * 1.5) }, style]}>
      {children}
    </Text>
  );
}

/** System-font text for sentences (accents, long copy). */
export function BodyText({ children, color = 'text', size = font.body, style, ...rest }: Props) {
  const { colors } = useTheme();
  return (
    <Text {...rest} style={[styles.body, { color: colors[color], fontSize: size, lineHeight: Math.round(size * 1.45) }, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  pixel: { fontFamily: PIXEL_FONT },
  body: {},
});
