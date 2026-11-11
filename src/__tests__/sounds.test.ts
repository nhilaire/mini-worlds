import * as Haptics from 'expo-haptics';
import fs from 'node:fs';
import path from 'node:path';

import { FEEDBACK, playFeedback } from '../feedback/feedback';
import { setSoundPlayer, SOUND_NAMES } from '../feedback/sounds';

const SOUNDS_DIR = path.join(__dirname, '..', '..', 'assets', 'sounds');

describe('generated sound files', () => {
  it.each(SOUND_NAMES)('%s.wav has a valid RIFF/WAVE header with a data chunk and is not silent', (name) => {
    const file = fs.readFileSync(path.join(SOUNDS_DIR, `${name}.wav`));
    expect(file.toString('ascii', 0, 4)).toBe('RIFF');
    expect(file.readUInt32LE(4)).toBe(file.length - 8);
    expect(file.toString('ascii', 8, 12)).toBe('WAVE');
    expect(file.toString('ascii', 12, 16)).toBe('fmt ');
    expect(file.readUInt16LE(20)).toBe(1); // PCM
    expect(file.readUInt16LE(22)).toBe(1); // mono
    expect(file.readUInt32LE(24)).toBe(22050);
    expect(file.readUInt16LE(34)).toBe(16);
    expect(file.toString('ascii', 36, 40)).toBe('data');
    const dataSize = file.readUInt32LE(40);
    expect(dataSize).toBe(file.length - 44);
    expect(dataSize).toBeGreaterThan(1000);
    let peak = 0;
    for (let i = 44; i < file.length; i += 2) peak = Math.max(peak, Math.abs(file.readInt16LE(i)));
    expect(peak).toBeGreaterThan(3000);
  });

  it('every sound named by the feedback map exists', () => {
    for (const mapping of Object.values(FEEDBACK)) if (mapping.sound) expect(SOUND_NAMES).toContain(mapping.sound);
  });
});

describe('feedback obeys the settings (AC-36)', () => {
  const player = jest.fn();
  beforeEach(() => {
    player.mockClear();
    jest.mocked(Haptics.impactAsync).mockClear();
    jest.mocked(Haptics.notificationAsync).mockClear();
    setSoundPlayer(player);
  });
  afterEach(() => setSoundPlayer(null));

  it('plays the sound and the haptic when both are on', () => {
    playFeedback('lines', { sound: true, vibrations: true });
    expect(player).toHaveBeenCalledWith('clear');
    expect(Haptics.impactAsync).toHaveBeenCalledWith('medium');
  });

  it('plays nothing with sound off and no haptic with vibrations off', () => {
    playFeedback('lines', { sound: false, vibrations: true });
    expect(player).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    playFeedback('star', { sound: true, vibrations: false });
    expect(player).toHaveBeenCalledWith('star');
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('ignores unknown events', () => {
    playFeedback('nothing', { sound: true, vibrations: true });
    expect(player).not.toHaveBeenCalled();
  });
});
