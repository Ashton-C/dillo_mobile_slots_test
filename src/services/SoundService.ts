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

type ExpoAudio = typeof import('expo-audio');
type AudioPlayer = ReturnType<ExpoAudio['createAudioPlayer']>;

class SoundService {
  private players: Map<SoundKey, AudioPlayer> = new Map();
  private muted = false;
  private audioLoaded = false;

  async preload(): Promise<void> {
    this.muted = (await AsyncStorage.getItem(MUTE_STORAGE_KEY)) === 'true';

    let audio: ExpoAudio;
    try {
      audio = require('expo-audio') as ExpoAudio;
      await audio.setAudioModeAsync({ playsInSilentMode: true });
      this.audioLoaded = true;
    } catch {
      return;
    }

    for (const [key, asset] of Object.entries(ASSET_MAP) as [SoundKey, number | null][]) {
      if (asset === null) continue;
      try {
        const player = audio.createAudioPlayer(asset);
        this.players.set(key, player);
      } catch {
        // Missing or invalid asset — skip silently
      }
    }
  }

  async play(key: SoundKey, volume = 1.0): Promise<void> {
    if (this.muted || !this.audioLoaded) return;
    const player = this.players.get(key);
    if (!player) return;
    try {
      player.volume = volume;
      player.seekTo(0);
      player.play();
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
