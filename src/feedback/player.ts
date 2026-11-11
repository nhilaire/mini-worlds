// expo-audio player for the generated sound effects (assets/sounds/*.wav). One player per sound, created once;
// replay = seekTo(0) then play(). Each sound logs its first start (SOUND_LOADED <name>) so logcat proves playback.
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';

import { setSoundPlayer, SoundName } from './sounds';

const SOURCES: Record<SoundName, number> = {
  tick: require('../../assets/sounds/tick.wav'),
  drop: require('../../assets/sounds/drop.wav'),
  clear: require('../../assets/sounds/clear.wav'),
  combo: require('../../assets/sounds/combo.wav'),
  shoot: require('../../assets/sounds/shoot.wav'),
  pop: require('../../assets/sounds/pop.wav'),
  over: require('../../assets/sounds/over.wav'),
  star: require('../../assets/sounds/star.wav'),
  coin: require('../../assets/sounds/coin.wav'),
  levelup: require('../../assets/sounds/levelup.wav'),
  refused: require('../../assets/sounds/refused.wav'),
};

const players = new Map<SoundName, AudioPlayer>();
const started = new Set<SoundName>();

function play(name: SoundName): void {
  try {
    let player = players.get(name);
    if (!player) {
      player = createAudioPlayer(SOURCES[name]);
      players.set(name, player);
    }
    if (!started.has(name)) {
      started.add(name);
      console.log(`SOUND_LOADED ${name}`);
    }
    void player.seekTo(0).then(() => player?.play());
  } catch {
    // A missing audio device (emulator with -no-audio) must never break the game.
  }
}

/** Installs the player; sounds mix with other apps and never take the audio focus. */
export function installSoundPlayer(): void {
  void setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }).catch(() => {});
  setSoundPlayer(play);
}

export function releaseSoundPlayer(): void {
  setSoundPlayer(null);
  for (const player of players.values()) player.remove();
  players.clear();
  started.clear();
}
