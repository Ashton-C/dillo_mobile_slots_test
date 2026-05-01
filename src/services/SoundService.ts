import AsyncStorage from '@react-native-async-storage/async-storage';

export type SoundKey =
  | 'spinStart'
  | 'reelStop0'
  | 'reelStop1'
  | 'reelStop2'
  | 'coinSmall'
  | 'coinMedium'
  | 'coinLarge'
  | 'jackpot'
  | 'pvpIncoming'
  | 'buildStart'
  | 'buildComplete'
  | 'radarScan'
  | 'levelUp'
  | 'buttonTap';

// Replace null with require('../../assets/sounds/<file>.mp3') once audio files are added.
const ASSET_MAP: Record<SoundKey, number | null> = {
  spinStart:     null,
  reelStop0:     null,
  reelStop1:     null,
  reelStop2:     null,
  coinSmall:     null,
  coinMedium:    null,
  coinLarge:     null,
  jackpot:       null,
  pvpIncoming:   null,
  buildStart:    null,
  buildComplete: null,
  radarScan:     null,
  levelUp:       null,
  buttonTap:     null,
};

const MUTE_STORAGE_KEY = 'settings:muted';

class SoundService {
  // Using unknown here because expo-av is loaded lazily; typed internally via cast
  private sounds: Map<SoundKey, unknown> = new Map();
  private muted = false;
  private avLoaded = false;

  async preload(): Promise<void> {
    this.muted = (await AsyncStorage.getItem(MUTE_STORAGE_KEY)) === 'true';

    let Audio: typeof import('expo-av').Audio;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const av = require('expo-av') as typeof import('expo-av');
      Audio = av.Audio;
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      this.avLoaded = true;
    } catch {
      // expo-av native module not available — stay silent
      return;
    }

    for (const [key, asset] of Object.entries(ASSET_MAP) as [SoundKey, number | null][]) {
      if (asset === null) continue;
      try {
        const { sound } = await Audio.Sound.createAsync(asset, { shouldPlay: false });
        this.sounds.set(key, sound);
      } catch {
        // Missing or invalid asset — skip silently
      }
    }
  }

  async play(key: SoundKey, volume = 1.0): Promise<void> {
    if (this.muted || !this.avLoaded) return;
    const sound = this.sounds.get(key) as { setVolumeAsync: (v: number) => Promise<void>; replayAsync: () => Promise<void> } | undefined;
    if (!sound) return;
    try {
      await sound.setVolumeAsync(volume);
      await sound.replayAsync();
    } catch {
      // Playback failure — skip silently
    }
  }

  playCoinWin(creditsWon: number): void {
    if (creditsWon <= 0) return;
    if (creditsWon >= 2000) {
      void this.play('jackpot');
    } else if (creditsWon >= 500) {
      void this.play('coinLarge');
    } else if (creditsWon >= 100) {
      void this.play('coinMedium');
    } else {
      void this.play('coinSmall');
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    this.muted = muted;
    await AsyncStorage.setItem(MUTE_STORAGE_KEY, muted ? 'true' : 'false');
  }

  getMuted(): boolean {
    return this.muted;
  }
}

export const soundService = new SoundService();
