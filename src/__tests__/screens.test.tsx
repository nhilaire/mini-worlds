import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import App from '../App';
import { setClock } from '../game/clock';
import { settleRound } from '../game/core/engine';
import { defaultSave, Save, serializeSave } from '../game/core/save';
import { deviceLanguageTags } from '../i18n/deviceLocale';
import { I18nProvider } from '../i18n/I18nProvider';
import { GameSheetScreen } from '../screens/GameSheetScreen';
import { ResultScreen } from '../screens/ResultScreen';
import { GameStoreProvider } from '../state/GameStore';
import { ThemeProvider } from '../ui/ThemeProvider';

const DATE = new Date(2026, 10, 11, 10, 0).getTime();

async function seed(save: Save) {
  await AsyncStorage.multiSet([
    ['telemetry.consent.v1', 'denied'],
    ['save', serializeSave(save)],
  ]);
}

function withCoins(coins: number): Save {
  const save = defaultSave();
  return { ...save, profile: { ...save.profile, coins } };
}

describe('meta-game screens', () => {
  let restore = () => {};
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.mocked(deviceLanguageTags).mockReturnValue(['fr-FR']);
    restore = setClock(() => DATE);
  });
  afterEach(() => restore());

  it('lists the 10 worlds with their state, opens Arcade, its game and the game sheet (AC-31)', async () => {
    await seed(defaultSave());
    await render(<App />);
    await fireEvent.press(await screen.findByTestId('tab-games'));
    expect(await screen.findByTestId('worlds-screen')).toBeTruthy();
    for (const id of ['arcade', 'puzzle', 'strategy', 'cards', 'bubbles', 'skill', 'building', 'exploration', 'memory', 'challenges']) {
      expect(screen.getByTestId(`world-${id}`)).toBeTruthy();
    }
    expect(screen.getByTestId('world-arcade-state')).toHaveTextContent(/Ouvert/);
    expect(screen.getByTestId('world-puzzle-state')).toHaveTextContent(/Verrouillé/);
    expect(screen.getByTestId('world-bubbles-state')).toHaveTextContent(/Verrouillé/);
    expect(screen.getByTestId('world-strategy-state')).toHaveTextContent(/Verrouillé/);
    expect(screen.getByTestId('world-building-state')).toHaveTextContent(/Bientôt/);
    expect(screen.getByText('2 étoiles dans Arcade')).toBeTruthy();
    expect(screen.getByText('4 étoiles au total')).toBeTruthy();
    expect(screen.getByText('Niveau 3')).toBeTruthy();

    // a locked world shows its conditions in a sheet
    await fireEvent.press(screen.getByTestId('world-puzzle'));
    expect(await screen.findByTestId('world-locked-sheet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('world-locked-close'));

    await fireEvent.press(screen.getByTestId('world-arcade'));
    expect(await screen.findByTestId('world-detail-screen')).toBeTruthy();
    expect(screen.getByTestId('game-blocks')).toBeTruthy();
    // v0.2.0: Tour Bancale and Saute-Lapin are shown locked with their condition, then two coming-soon slots.
    expect(screen.getByTestId('game-tower-condition')).toHaveTextContent('2 étoiles dans Arcade');
    expect(screen.getByTestId('game-hop-condition')).toHaveTextContent('4 étoiles dans Arcade');
    expect(screen.getByTestId('game-fruit-condition')).toHaveTextContent('6 étoiles dans Arcade');
    // v0.4.0: Arcade is full (5 games), no coming-soon slot is left.
    expect(screen.getByTestId('game-dash-condition')).toHaveTextContent('8 étoiles dans Arcade');
    expect(screen.queryByTestId('slot-soon-4')).toBeNull();

    await fireEvent.press(screen.getByTestId('game-blocks'));
    expect(await screen.findByTestId('game-sheet-screen')).toBeTruthy();
    expect(screen.getByTestId('sheet-name')).toHaveTextContent(/Pluie de Blocs/);
    expect(screen.getByTestId('sheet-play')).toBeTruthy();
    expect(screen.getByTestId('sheet-thresholds')).toHaveTextContent(/1.000 · 2.500 · 5.000/);
    await fireEvent.press(screen.getByTestId('sheet-back'));
    expect(await screen.findByTestId('world-detail-screen')).toBeTruthy();
  });

  it('shows the three upgrades at 0 / 3 with Buy disabled when the player has no coins (AC-32)', async () => {
    await seed(defaultSave());
    await render(<App />);
    await fireEvent.press(await screen.findByTestId('tab-games'));
    await fireEvent.press(await screen.findByTestId('world-arcade'));
    await fireEvent.press(await screen.findByTestId('game-blocks'));
    await fireEvent.press(await screen.findByTestId('sheet-upgrades'));
    expect(await screen.findByTestId('upgrades-screen')).toBeTruthy();
    for (const id of ['preview', 'slow_start', 'coins']) {
      expect(screen.getByTestId(`upgrade-${id}-level`)).toHaveTextContent(/Niveau 0 \/ 3/);
      expect(screen.getByTestId(`upgrade-${id}-buy`)).toBeDisabled();
    }
  });

  it('buys an upgrade when affordable and updates the coins and level (AC-10)', async () => {
    await seed(withCoins(300));
    await render(<App />);
    await fireEvent.press(await screen.findByTestId('tab-games'));
    await fireEvent.press(await screen.findByTestId('world-arcade'));
    expect(screen.getByTestId('game-blocks-upgrade-badge')).toHaveTextContent(/3/);
    await fireEvent.press(await screen.findByTestId('game-blocks'));
    await fireEvent.press(await screen.findByTestId('sheet-upgrades'));
    await fireEvent.press(await screen.findByTestId('upgrade-preview-buy'));
    expect(screen.getByTestId('upgrade-preview-level')).toHaveTextContent(/Niveau 1 \/ 3/);
    // 300 − 250, plus 50 for the « Bricoleur » achievement announced by a toast
    expect(screen.getByTestId('upgrades-coins')).toHaveTextContent(/^100$/);
    expect(await screen.findByTestId('achievement-toast')).toHaveTextContent(/Succès.: Bricoleur/);
    await fireEvent.press(screen.getByTestId('upgrade-preview-buy')); // level 2 costs 600: refused
    expect(screen.getByTestId('upgrade-preview-level')).toHaveTextContent(/Niveau 1 \/ 3/);
    expect(screen.getByTestId('upgrades-coins')).toHaveTextContent(/^100$/);
    expect(screen.getByTestId('upgrade-preview-buy')).toBeDisabled();
  });

  it('collects the daily reward once from the Home card (AC-34)', async () => {
    await seed(defaultSave());
    await render(<App />);
    await fireEvent.press(await screen.findByTestId('home-daily'));
    expect(await screen.findByTestId('daily-screen')).toBeTruthy();
    expect(screen.getByTestId('daily-day-1')).toHaveTextContent(/100 pièces/);
    await fireEvent.press(screen.getByTestId('daily-collect'));
    expect(await screen.findByTestId('daily-collected')).toBeTruthy();
    expect(screen.getByTestId('daily-collected-button')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('daily-back'));
    expect(await screen.findByTestId('home-coins')).toHaveTextContent(/100/);
    expect(screen.queryByTestId('home-daily')).toBeNull();
    await new Promise((r) => setTimeout(r, 400));
    const stored = JSON.parse((await AsyncStorage.getItem('save')) ?? '{}');
    expect(stored.dailyReward).toEqual({ lastCollectedDate: '2026-11-11', calendarDay: 1 });
  });

  it('shows the daily challenges with « Jouer 3 parties » first at 0 / 3 (AC-35)', async () => {
    await seed(defaultSave());
    await render(<App />);
    expect(await screen.findByTestId('challenge-rounds3')).toHaveTextContent(/Jouer 3 parties/);
    expect(screen.getByTestId('challenge-rounds3-progress')).toHaveTextContent(/0 \/ 3/);
    expect(screen.getAllByTestId(/^challenge-[a-z0-9_]+$/)).toHaveLength(3);
  });

  it('shows the profile stats and achievements', async () => {
    const played = settleRound(defaultSave(), { game: 'blocks', score: 1000, durationS: 60, combos: 0, outcome: 'ended', date: '2026-11-11' }).save;
    await seed(played);
    await render(<App />);
    await fireEvent.press(await screen.findByTestId('tab-profile'));
    expect(await screen.findByTestId('profile-rounds')).toHaveTextContent(/1/);
    expect(screen.getByTestId('profile-games')).toHaveTextContent(/1 \/ 35/);
    expect(screen.getByTestId('profile-stars')).toHaveTextContent(/1 \/ 105/);
    expect(screen.getByTestId('achievement-first_round-unlocked')).toBeTruthy();
    expect(screen.getByTestId('achievement-first_star-unlocked')).toBeTruthy();
    expect(screen.getByTestId('achievement-rounds10')).toBeTruthy();
  });

  it('resets the progression after confirmation and keeps the language and consent (AC-37)', async () => {
    const played = settleRound(withCoins(999), { game: 'blocks', score: 1600, durationS: 60, combos: 0, outcome: 'ended', date: '2026-11-11' }).save;
    await seed(played);
    await AsyncStorage.setItem('settings.language.v1', 'en');
    await render(<App />);
    await fireEvent.press(await screen.findByTestId('tab-profile'));
    await fireEvent.press(await screen.findByTestId('profile-settings'));
    await fireEvent.press(await screen.findByTestId('settings-reset'));
    expect(await screen.findByTestId('settings-reset-dialog')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('settings-reset-cancel'));
    await fireEvent.press(screen.getByTestId('settings-reset'));
    await fireEvent.press(await screen.findByTestId('settings-reset-confirm'));
    await fireEvent.press(screen.getByTestId('settings-back'));
    await fireEvent.press(screen.getByTestId('tab-home'));
    expect(await screen.findByTestId('home-coins')).toHaveTextContent(/^0$/);
    expect(screen.getByTestId('home-level')).toHaveTextContent(/Level 1/);
    expect(screen.queryByTestId('recent-blocks')).toBeNull();
    expect(await AsyncStorage.getItem('settings.language.v1')).toBe('en');
    expect(await AsyncStorage.getItem('telemetry.consent.v1')).toBe('denied');
  });
});

describe('result screen (AC-33)', () => {
  const wrap = (ui: React.ReactElement) => (
    <GameStoreProvider sessionSeed={null}>
      <ThemeProvider setting="dark">
        <I18nProvider setting="fr" onChange={() => {}}>
          {ui}
        </I18nProvider>
      </ThemeProvider>
    </GameStoreProvider>
  );

  it('shows new best, new stars, level-up, unlock and challenges only when applicable', async () => {
    const plain = { ...defaultSave(), dailyGame: { date: '2026-11-11', gameId: 'tower' as const } }; // Pluie de Blocs is not the game of the day
    const { result } = settleRound(plain, { game: 'blocks', score: 2500, durationS: 60, combos: 0, outcome: 'ended', date: '2026-11-11' });
    await render(wrap(<ResultScreen game="blocks" result={{ ...result, levelUps: [{ level: 2, coins: 50 }], worldsUnlocked: ['puzzle'] }} onReplay={() => {}} onUpgrade={() => {}} onBack={() => {}} />));
    expect(screen.getByTestId('result-new-best')).toBeTruthy();
    expect(screen.getAllByTestId('result-stars-on')).toHaveLength(2);
    expect(screen.getByTestId('result-coins')).toHaveTextContent(/\+210 pièces/); // 10 + 2500/25 + 2 × 50
    expect(screen.getByTestId('result-xp')).toHaveTextContent(/\+110 XP/); // 10 + 2500/50 + 2 × 25
    expect(screen.getByTestId('result-level-2')).toHaveTextContent(/Niveau 2.! \+50 pièces/);
    expect(screen.getByTestId('result-unlock-puzzle')).toHaveTextContent(/Monde débloqué.: Puzzle.!/);
    expect(screen.queryByTestId('result-short')).toBeNull();
    expect(screen.queryByTestId('result-daily-game')).toBeNull();
    await screen.unmount();

    // AC-111: a round of the game of the day shows its doubled coins and the line.
    const daily = settleRound(defaultSave(), { game: 'blocks', score: 2500, durationS: 60, combos: 0, outcome: 'ended', date: '2026-11-11' });
    await render(wrap(<ResultScreen game="blocks" result={daily.result} onReplay={() => {}} onUpgrade={() => {}} onBack={() => {}} />));
    expect(screen.getByTestId('result-coins')).toHaveTextContent(/\+320 pièces/); // (10 + 2500/25) × 2 + 2 × 50
    expect(screen.getByTestId('result-daily-game')).toHaveTextContent(/Jeu du jour.: pièces ×2.!/);
    await screen.unmount();

    const again = settleRound(defaultSave(), { game: 'blocks', score: 100, durationS: 60, combos: 0, outcome: 'ended', date: '2026-11-11' });
    await render(wrap(<ResultScreen game="blocks" result={{ ...again.result, newBest: false }} onReplay={() => {}} onUpgrade={() => {}} onBack={() => {}} />));
    expect(screen.queryByTestId('result-new-best')).toBeNull();
    expect(screen.queryByTestId('result-level-2')).toBeNull();
    expect(screen.queryByTestId(/result-unlock-/)).toBeNull();
    await screen.unmount();

    const short = settleRound(defaultSave(), { game: 'blocks', score: 100, durationS: 5, combos: 0, outcome: 'quit', date: '2026-11-11' });
    await render(wrap(<ResultScreen game="blocks" result={short.result} onReplay={() => {}} onUpgrade={() => {}} onBack={() => {}} />));
    expect(screen.getByTestId('result-short')).toHaveTextContent(/Partie trop courte/);
    expect(screen.queryByTestId('result-coins')).toBeNull();
  });
});

describe('game sheet of a locked game (AC-56)', () => {
  const wrap = (ui: React.ReactElement) => (
    <GameStoreProvider sessionSeed={null}>
      <ThemeProvider setting="dark">
        <I18nProvider setting="fr" onChange={() => {}}>
          {ui}
        </I18nProvider>
      </ThemeProvider>
    </GameStoreProvider>
  );

  it('refuses « Jouer » while the game needs more stars in its world, and allows it once they are earned', async () => {
    await AsyncStorage.clear();
    const onPlay = jest.fn();
    await render(wrap(<GameSheetScreen game="tower" onPlay={onPlay} onUpgrades={() => {}} onBack={() => {}} />));
    const play = await screen.findByTestId('sheet-play');
    expect(play).toBeDisabled();
    await fireEvent.press(play);
    expect(onPlay).not.toHaveBeenCalled();
    screen.unmount();

    const save = defaultSave();
    save.games.blocks = { ...save.games.blocks, stars: 2 };
    await AsyncStorage.setItem('save', serializeSave(save));
    await render(wrap(<GameSheetScreen game="tower" onPlay={onPlay} onUpgrades={() => {}} onBack={() => {}} />));
    await waitFor(() => expect(screen.getByTestId('sheet-play')).toBeEnabled());
    await fireEvent.press(screen.getByTestId('sheet-play'));
    expect(onPlay).toHaveBeenCalledTimes(1);
  });
});
