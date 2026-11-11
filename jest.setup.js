// Native modules are replaced by in-memory mocks so that tests run in Node.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: jest.fn(() => ({})),
  logEvent: jest.fn(() => Promise.resolve()),
  setConsent: jest.fn(() => Promise.resolve()),
  setAnalyticsCollectionEnabled: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-native-firebase/crashlytics', () => ({
  getCrashlytics: jest.fn(() => ({})),
  log: jest.fn(),
  recordError: jest.fn(),
  setCrashlyticsCollectionEnabled: jest.fn(() => Promise.resolve()),
}));

// The phone's languages: French by default; a test can switch with
// jest.mocked(deviceLanguageTags).mockReturnValue(['en-US']).
jest.mock('./src/i18n/deviceLocale', () => ({ deviceLanguageTags: jest.fn(() => ['fr-FR']) }));

// Gesture Handler and Reanimated ship their own Jest mocks.
require('react-native-gesture-handler/jestSetup');
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// Skia is native: a callable proxy stands in for every API (paints, paths, images), the canvas renders as a View
// and drawing code never runs in tests (it is proven by Maestro screenshots).
jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const { View } = require('react-native');
  const stub = () => {
    const fn = () => proxy;
    const proxy = new Proxy(fn, { get: (_t, key) => (key === 'then' ? undefined : proxy), apply: () => proxy });
    return proxy;
  };
  const any = stub();
  const Null = () => null;
  return {
    Skia: any,
    PaintStyle: any,
    StrokeCap: any,
    BlendMode: any,
    FilterMode: any,
    MipmapMode: any,
    AlphaType: any,
    ColorType: any,
    matchFont: () => any,
    createPicture: () => ({}),
    useImage: () => null,
    Canvas: ({ children, style, testID }) => React.createElement(View, { style, testID: testID || 'skia-canvas' }, children),
    Picture: Null,
    Path: Null,
    Rect: Null,
    RoundedRect: Null,
    Circle: Null,
    Group: Null,
    Line: Null,
    Image: Null,
    Text: Null,
  };
});

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    seekTo: jest.fn(() => Promise.resolve()),
    volume: 1,
    loop: false,
  })),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-font', () => ({
  useFonts: jest.fn(() => [true, null]),
  loadAsync: jest.fn(() => Promise.resolve()),
  isLoaded: jest.fn(() => true),
}));

jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(() => Promise.resolve(null)),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  parse: jest.fn((url) => ({ path: url })),
}));

// SafeAreaProvider renders nothing until native insets arrive: the library's mock provides them at once.
jest.mock('react-native-safe-area-context', () => {
  const mock = require('react-native-safe-area-context/jest/mock');
  return mock.default ?? mock;
});
