import { ReactNode } from 'react';
import { StyleSheet, Text, TextProps } from 'react-native';

import { useTheme } from './ThemeProvider';
import { font, PIXEL_FONT, PIXEL_FONT_BOLD, PIXEL_SCALE } from './theme';

type Props = TextProps & { children: ReactNode; color?: 'text' | 'muted' | 'accent' | 'danger' | 'success'; size?: number; bold?: boolean };

/** Pixel-font text for titles, HUD values and labels (short strings, digits, names). `size` is in Press Start 2P units. */
export function PixelText({ children, color = 'text', size = font.hud, bold = false, style, ...rest }: Props) {
  const { colors } = useTheme();
  const fontSize = Math.round(size * PIXEL_SCALE);
  return (
    <Text {...rest} style={[styles.pixel, bold && styles.pixelBold, { color: colors[color], fontSize, lineHeight: Math.round(fontSize * 1.25) }, style]}>
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
  pixelBold: { fontFamily: PIXEL_FONT_BOLD },
  body: {},
});
