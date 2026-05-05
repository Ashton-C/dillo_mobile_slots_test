import AsyncStorage from '@react-native-async-storage/async-storage';
import { PlayerIndexEntry } from '@/services/FirestoreService';

export const DEBUG_PLAYERS: PlayerIndexEntry[] = [
  {
    uid: 'debug_alpha_raider_001',
    displayName: 'AlphaRaider',
    avatarColor: '#FF3366',
    outpostLevel: 5,
    level: 12,
    updatedAt: null,
  },
  {
    uid: 'debug_beta_ops_001',
    displayName: 'BetaOps',
    avatarColor: '#00CFFF',
    outpostLevel: 3,
    level: 7,
    updatedAt: null,
  },
];

const STORAGE_KEY = 'debugActivePlayers';

export async function loadActiveDebugUids(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export async function saveActiveDebugUids(uids: string[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(uids));
}
