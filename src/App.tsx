import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { installSoundPlayer, releaseSoundPlayer } from './feedback/player';
import { AchievementId, GameId } from './game/core/content';
import { parseTestLink, TestLink } from './game/rng';
import { LanguageSetting } from './i18n';
import { I18nProvider, useI18n } from './i18n/I18nProvider';
import { current, initialNavigation, Navigation, pop, popTo, push, replace, selectTab, Tab } from './navigation';
import { AboutScreen } from './screens/AboutScreen';
import { DailyRewardScreen } from './screens/DailyRewardScreen';
import { GameSheetScreen } from './screens/GameSheetScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { ResultScreen } from './screens/ResultScreen';
import { UpgradesScreen } from './screens/UpgradesScreen';
import { WorldDetailScreen } from './screens/WorldDetailScreen';
import { WorldsScreen } from './screens/WorldsScreen';
import { ConsentScreen } from './screens/ConsentScreen';
import type { OnFinish } from './screens/game/GameFrame';
import { GameScreen } from './screens/game/GameScreen';
import { HomeScreen } from './screens/HomeScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { GameStoreProvider, useGameStore } from './state/GameStore';
import { loadLanguageSetting, saveLanguageSetting } from './storage/languageSetting';
import { Consent, loadConsent, saveConsent } from './telemetry/consentStore';
import { applyConsent, reportError } from './telemetry/telemetry';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { TabBar } from './ui/TabBar';
import { ThemeProvider, useTheme } from './ui/ThemeProvider';
import { PixelText } from './ui/Typography';

// Pixelify Sans (OFL): a soft pixel font for titles, HUD and buttons (Press Start 2P was found too harsh on the phone).
const FONTS = {
  PixelifySans: require('../assets/fonts/PixelifySans-Regular.ttf'),
  'PixelifySans-Bold': require('../assets/fonts/PixelifySans-Bold.ttf'),
};

/** Test link from the deep link (null = normal play). Resolved before the store loads. */
function useTestLink(): TestLink | null | 'pending' {
  const [link, setLink] = useState<TestLink | null | 'pending'>('pending');
  useEffect(() => {
    let alive = true;
    Linking.getInitialURL()
      .then((url) => alive && setLink(parseTestLink(url)))
      .catch(() => alive && setLink(null));
    const sub = Linking.addEventListener('url', ({ url }) => {
      const parsed = parseTestLink(url);
      if (parsed !== null) setLink(parsed);
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return link;
}

function Shell({ consent, onConsent }: { consent: Consent; onConsent: (granted: boolean) => void }) {
  const store = useGameStore();
  const { colors } = useTheme();
  const [nav, setNav] = useState<Navigation>(initialNavigation);
  const route = current(nav);

  // Today's challenges are refreshed when the app comes back to the foreground (the date may have changed).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') store.refreshDay();
    });
    return () => sub?.remove();
  }, [store]);

  const goBack = useCallback(() => setNav((n) => pop(n)), []);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route === null || route.name === 'game') return false; // game screens handle it (pause); tabs let Android exit
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [route, goBack]);

  const onTab = useCallback((tab: Tab) => setNav((n) => selectTab(n, tab)), []);
  const openGame = useCallback((game: GameId) => setNav((n) => push(n, { name: 'game', game, seed: store.roundSeed() })), [store]);
  const openSheet = useCallback((game: GameId) => setNav((n) => push(n, { name: 'sheet', game })), []);
  // A finished round is settled by the store, then the Result screen replaces the game (or a new round starts).
  const onFinish = useCallback<OnFinish>(
    (round, next) => {
      const result = store.settle(round);
      setNav((n) => replace(n, next === 'restart' ? { name: 'game', game: round.game, seed: store.roundSeed() } : { name: 'result', game: round.game, result }));
    },
    [store],
  );

  if (!store.loaded) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (consent === 'unknown') return <ConsentScreen onDecision={onConsent} />;

  let content: React.ReactNode;
  if (route === null) {
    if (nav.tab === 'home') {
      content = <HomeScreen onPlay={openGame} onDaily={() => setNav((n) => push(n, { name: 'daily' }))} onGame={openSheet} onWorlds={() => onTab('games')} />;
    } else if (nav.tab === 'games') {
      content = <WorldsScreen onWorld={(world) => setNav((n) => push(n, { name: 'world', world }))} />;
    } else {
      content = <ProfileScreen onSettings={() => setNav((n) => push(n, { name: 'settings' }))} onAbout={() => setNav((n) => push(n, { name: 'about' }))} />;
    }
  } else if (route.name === 'settings') {
    content = <SettingsScreen telemetryEnabled={consent === 'granted'} onToggleTelemetry={onConsent} onBack={goBack} />;
  } else if (route.name === 'about') {
    content = <AboutScreen onBack={goBack} />;
  } else if (route.name === 'game') {
    content = <GameScreen game={route.game} seed={route.seed} onFinish={onFinish} />;
  } else if (route.name === 'world') {
    content = <WorldDetailScreen world={route.world} onGame={openSheet} onBack={goBack} />;
  } else if (route.name === 'sheet') {
    content = (
      <GameSheetScreen game={route.game} onPlay={() => openGame(route.game)} onUpgrades={() => setNav((n) => push(n, { name: 'upgrades', game: route.game }))} onBack={goBack} />
    );
  } else if (route.name === 'upgrades') {
    content = <UpgradesScreen game={route.game} onBack={goBack} />;
  } else if (route.name === 'daily') {
    content = <DailyRewardScreen onBack={goBack} />;
  } else if (route.name === 'result') {
    content = (
      <ResultScreen
        game={route.game}
        result={route.result}
        onReplay={() => setNav((n) => replace(n, { name: 'game', game: route.game, seed: store.roundSeed() }))}
        onUpgrade={() => setNav((n) => push(n, { name: 'upgrades', game: route.game }))}
        onBack={() => setNav((n) => (n.stack.some((r) => r.name === 'sheet') ? popTo(n, 'sheet') : selectTab(n, n.tab)))}
      />
    );
  }

  const showTabs = route === null;
  return (
    <View style={styles.root}>
      <View style={styles.root}>{content}</View>
      {showTabs && <TabBar active={nav.tab} onSelect={onTab} />}
      {store.toasts.length > 0 && <Toast id={store.toasts[0]} onDone={store.dismissToast} />}
    </View>
  );
}

function Toast({ id, onDone }: { id: AchievementId; onDone: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  useEffect(() => {
    const timer = setTimeout(onDone, 2500);
    return () => clearTimeout(timer);
  }, [id, onDone]);
  return (
    <View style={[styles.toast, { backgroundColor: colors.accent }]} testID="achievement-toast" pointerEvents="none">
      <PixelText size={8} style={{ color: colors.accentText }}>
        {t.achievement.toast(t.achievement[id])}
      </PixelText>
    </View>
  );
}

function Root() {
  const store = useGameStore();
  const [consent, setConsentState] = useState<Consent | 'loading'>('loading');
  const [languageSetting, setLanguageSetting] = useState<LanguageSetting>('auto');

  useEffect(() => {
    let alive = true;
    (async () => {
      const [storedConsent, storedLanguage] = await Promise.all([loadConsent(), loadLanguageSetting()]);
      // Not awaited: the first screen must not wait for Firebase (the choice applies at once inside applyConsent).
      if (storedConsent !== 'unknown') void applyConsent(storedConsent === 'granted');
      if (alive) {
        setLanguageSetting(storedLanguage);
        setConsentState(storedConsent);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const decide = useCallback(async (granted: boolean) => {
    const value = granted ? 'granted' : 'denied';
    try {
      await saveConsent(value);
      await applyConsent(granted);
    } catch (error) {
      reportError(error, 'apply_consent');
    } finally {
      setConsentState(value); // never leave the player on the consent screen
    }
  }, []);

  const changeLanguage = useCallback(async (value: LanguageSetting) => {
    setLanguageSetting(value);
    await saveLanguageSetting(value);
  }, []);

  return (
    <ThemeProvider setting={store.save.settings.theme}>
      <I18nProvider setting={languageSetting} onChange={changeLanguage}>
        <ErrorBoundary>{consent === 'loading' ? <Loading /> : <Shell consent={consent} onConsent={decide} />}</ErrorBoundary>
      </I18nProvider>
    </ThemeProvider>
  );
}

function Loading() {
  const { colors } = useTheme();
  return (
    <View style={[styles.loading, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts(FONTS);
  const link = useTestLink();
  useEffect(() => {
    installSoundPlayer();
    return releaseSoundPlayer;
  }, []);
  if (!fontsLoaded || link === 'pending') return <View style={styles.loading} />;
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <GameStoreProvider sessionSeed={link?.seed ?? null} testUnlocked={link?.unlocked ?? false}>
          <Root />
        </GameStoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#141226' },
  toast: { position: 'absolute', top: 60, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
});
