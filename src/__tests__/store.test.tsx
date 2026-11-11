import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { setClock } from '../game/clock';
import { defaultSave, SCHEMA_VERSION, serializeSave } from '../game/core/save';
import { GameStoreProvider, useGameStore } from '../state/GameStore';

// A probe component exposing the store to the test (handed over in an effect, never during render).
let store: ReturnType<typeof useGameStore> | null = null;
function Probe() {
  const current = useGameStore();
  useEffect(() => {
    store = current;
  }, [current]);
  return <Text testID="probe">{current.loaded ? 'loaded' : 'loading'}</Text>;
}

async function mount(sessionSeed: number | null = null) {
  await render(
    <GameStoreProvider sessionSeed={sessionSeed}>
      <Probe />
    </GameStoreProvider>,
  );
  await screen.findByText('loaded');
}

const flush = () => new Promise((r) => setTimeout(r, 400));

describe('game store persistence (AC-15)', () => {
  let restore = () => {};
  beforeEach(async () => {
    await AsyncStorage.clear();
    store = null;
    restore = setClock(() => new Date(2026, 10, 11, 10, 0).getTime());
  });
  afterEach(() => restore());

  it('loads the stored save, draws today\'s challenges and writes every change after a short delay', async () => {
    const save = defaultSave();
    save.profile.coins = 77;
    await AsyncStorage.setItem('save', serializeSave(save));
    await mount();
    expect(store?.save.profile.coins).toBe(77);
    expect(store?.save.challenges.date).toBe('2026-11-11');
    expect(store?.save.challenges.ids[0]).toBe('rounds3');
    await act(async () => store?.setSettings({ sound: false }));
    await flush();
    const stored = JSON.parse((await AsyncStorage.getItem('save')) ?? '{}');
    expect(stored.settings.sound).toBe(false);
    expect(stored.profile.coins).toBe(77);
  });

  it('never writes during a read-only session (newer schema on disk)', async () => {
    const newer = JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, profile: { coins: 9999 } });
    await AsyncStorage.setItem('save', newer);
    await mount();
    expect(store?.readOnly).toBe(true);
    expect(store?.save.profile.coins).toBe(0);
    await act(async () => store?.setSettings({ sound: false }));
    await flush();
    expect(await AsyncStorage.getItem('save')).toBe(newer);
  });

  it('settles rounds synchronously so that two rounds in a row accumulate', async () => {
    await mount();
    let coins = 0;
    await act(async () => {
      store?.settle({ game: 'blocks', score: 100, durationS: 30, combos: 0, outcome: 'ended' });
      const second = store?.settle({ game: 'blocks', score: 100, durationS: 30, combos: 0, outcome: 'ended' });
      coins = second?.coins ?? 0;
    });
    expect(coins).toBe(14);
    expect(store?.save.profile.roundsPlayed).toBe(2);
    expect(store?.toasts).toEqual(['first_round']);
    await act(async () => store?.dismissToast());
    expect(store?.toasts).toEqual([]);
  });

  it('derives round seeds from the session seed', async () => {
    await mount(5);
    expect(store?.roundSeed()).toBe(6);
    expect(store?.roundSeed()).toBe(7);
  });

  it('reset clears the progression and the stored save', async () => {
    await mount();
    await act(async () => {
      store?.settle({ game: 'blocks', score: 1500, durationS: 30, combos: 0, outcome: 'ended' });
    });
    await flush();
    await act(async () => {
      await store?.reset();
    });
    expect(store?.save.profile.coins).toBe(0);
    expect(store?.save.games.blocks.stars).toBe(0);
    expect(store?.save.unlockedWorlds).toEqual(['arcade']);
  });
});
