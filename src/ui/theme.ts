// Theme tokens (light / dark) and typography. The theme follows the phone unless the player picks one in the
// settings (src/game/core/save.ts settings.theme). Components read `useTheme()` from ./ThemeProvider.

export type Scheme = 'light' | 'dark';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  danger: string;
  success: string;
  border: string;
  overlay: string;
};

export const THEMES: Record<Scheme, ThemeColors> = {
  dark: {
    background: '#141226',
    surface: '#22203A',
    surfaceAlt: '#2E2B4D',
    text: '#F7F5FF',
    muted: '#A39FC9',
    accent: '#FFD60A',
    accentText: '#1B1A2E',
    danger: '#F06A6A',
    success: '#5BD39A',
    border: '#3C3863',
    overlay: 'rgba(10, 8, 24, 0.82)',
  },
  light: {
    background: '#F4F1E8',
    surface: '#FFFFFF',
    surfaceAlt: '#E8E3D3',
    text: '#1B1A2E',
    muted: '#6B6889',
    accent: '#F77F00',
    accentText: '#FFFFFF',
    danger: '#C8323C',
    success: '#2A8F62',
    border: '#D5CFBB',
    overlay: 'rgba(30, 26, 60, 0.78)',
  },
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 } as const;

/** Body text uses the system font (accents, long sentences); titles and HUD use the pixel font. */
export const font = { title: 22, heading: 16, body: 17, small: 14, hud: 12, pixelBig: 18 } as const;

export const PIXEL_FONT = 'PressStart2P';

export const radius = { card: 14, button: 12, chip: 8 } as const;
