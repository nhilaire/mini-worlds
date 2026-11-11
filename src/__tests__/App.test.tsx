import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';

import App from '../App';
import { appName } from '../config/app';
import { deviceLanguageTags } from '../i18n/deviceLocale';

// render/fireEvent are awaited: asynchronous in React Native Testing Library 14+, harmless before.
// The phone is French unless a test says otherwise (jest.setup.js mocks deviceLanguageTags).
describe('App', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.mocked(deviceLanguageTags).mockReturnValue(['fr-FR']);
  });

  async function openSettings() {
    await fireEvent.press(await screen.findByTestId('tab-profile'));
    await fireEvent.press(await screen.findByTestId('profile-settings'));
    expect(await screen.findByTestId('settings-screen')).toBeTruthy();
  }

  it('asks for consent in French on a French phone, then shows the home screen (AC-01)', async () => {
    await render(<App />);
    expect(await screen.findByText('Statistiques anonymes')).toBeTruthy();
    await fireEvent.press(screen.getByText('Refuser'));
    expect(await screen.findByText('Jouer')).toBeTruthy();
    expect(screen.getByText(appName('fr'))).toBeTruthy();
    expect(screen.getByTestId('home-daily')).toBeTruthy();
    expect(screen.getByTestId('challenge-rounds3')).toBeTruthy();
  });

  it('speaks English on an English phone (AC-02)', async () => {
    jest.mocked(deviceLanguageTags).mockReturnValue(['en-US']);
    await render(<App />);
    expect(await screen.findByText('Anonymous statistics')).toBeTruthy();
  });

  it('uses the fallback language on a phone in an unsupported language (AC-02)', async () => {
    jest.mocked(deviceLanguageTags).mockReturnValue(['it-IT']);
    await AsyncStorage.setItem('telemetry.consent.v1', 'denied');
    await render(<App />);
    expect(await screen.findByTestId('home-screen')).toBeTruthy();
    expect(screen.getByText('Play')).toBeTruthy();
    expect(screen.getByText(appName('en'))).toBeTruthy();
  });

  it('switches language from the settings at once and remembers the choice (AC-03)', async () => {
    await AsyncStorage.setItem('telemetry.consent.v1', 'denied');
    await render(<App />);
    await openSettings();
    expect(screen.getByText('Paramètres')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('settings-language-en'));
    expect(await screen.findByText('Settings')).toBeTruthy();
    expect(screen.getByText('Sound')).toBeTruthy();
    expect(await AsyncStorage.getItem('settings.language.v1')).toBe('en');

    await screen.unmount();
    await render(<App />);
    expect(await screen.findByText('Play')).toBeTruthy();
  });

  it('goes back to the phone language with the automatic choice (AC-03)', async () => {
    await AsyncStorage.multiSet([
      ['telemetry.consent.v1', 'denied'],
      ['settings.language.v1', 'en'],
    ]);
    await render(<App />);
    await openSettings();
    await fireEvent.press(screen.getByTestId('settings-language-auto'));
    expect(await screen.findByText('Paramètres')).toBeTruthy();
  });

  it('shows the About screen: story, word from the author, data, version (AC-38)', async () => {
    await AsyncStorage.setItem('telemetry.consent.v1', 'denied');
    await render(<App />);
    await fireEvent.press(await screen.findByTestId('tab-profile'));
    await fireEvent.press(await screen.findByTestId('profile-about'));
    expect(await screen.findByTestId('about-screen')).toBeTruthy();
    expect(screen.getByText("L'histoire de ce jeu")).toBeTruthy();
    expect(screen.getByText(/toute la famille, parents compris/)).toBeTruthy();
    expect(screen.getByText(/développeur passionné/)).toBeTruthy();
    expect(screen.getByText(/bugs/)).toBeTruthy();
    expect(screen.getByText(/^Version [0-9]+[.][0-9]+[.][0-9]+$/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('about-back'));
    expect(await screen.findByTestId('profile-screen')).toBeTruthy();
  });

  it('does not ask again once the player has chosen', async () => {
    await AsyncStorage.setItem('telemetry.consent.v1', 'denied');
    await render(<App />);
    expect(await screen.findByText('Jouer')).toBeTruthy();
    expect(screen.queryByText('Statistiques anonymes')).toBeNull();
  });

  it('persists sound, vibrations and theme settings (AC-36)', async () => {
    await AsyncStorage.setItem('telemetry.consent.v1', 'denied');
    await render(<App />);
    await openSettings();
    await fireEvent(screen.getByTestId('settings-sound'), 'valueChange', false);
    await fireEvent.press(screen.getByTestId('settings-theme-light'));
    await new Promise((r) => setTimeout(r, 400)); // debounced save
    const stored = JSON.parse((await AsyncStorage.getItem('save')) ?? '{}');
    expect(stored.settings).toMatchObject({ sound: false, vibrations: true, theme: 'light' });
  });
});
