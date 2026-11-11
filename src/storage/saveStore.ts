// AsyncStorage wiring of the save model (src/game/core/save.ts): one JSON document under one key.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { LoadResult, parseSave, Save, serializeSave } from '../game/core/save';
import { reportError } from '../telemetry/telemetry';

export const SAVE_KEY = 'save';

export async function loadSave(): Promise<LoadResult> {
  try {
    return parseSave(await AsyncStorage.getItem(SAVE_KEY));
  } catch (error) {
    reportError(error, 'load_save');
    return parseSave(null);
  }
}

export async function writeSave(save: Save): Promise<void> {
  try {
    await AsyncStorage.setItem(SAVE_KEY, serializeSave(save));
  } catch (error) {
    reportError(error, 'write_save');
  }
}

export async function clearSave(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SAVE_KEY);
  } catch (error) {
    reportError(error, 'clear_save');
  }
}
