import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Lazy-require so Expo Go and pre-`npm install` builds don't crash. The
// real native modules only resolve on a dev/preview/production build.

type ExpoNotificationsModule = {
  setNotificationHandler: (h: object) => void;
  getPermissionsAsync: () => Promise<{ status: string }>;
  requestPermissionsAsync: () => Promise<{ status: string }>;
  getExpoPushTokenAsync: (opts?: { projectId?: string }) => Promise<{ data: string }>;
  setNotificationChannelAsync: (id: string, ch: object) => Promise<unknown>;
  AndroidImportance: { DEFAULT: number; HIGH: number };
};

type ExpoDeviceModule = {
  isDevice: boolean;
};

let Notifications: ExpoNotificationsModule | null = null;
let Device: ExpoDeviceModule | null = null;

try {
  Notifications = require('expo-notifications');
} catch {
  // Module unavailable — running in Expo Go or before `npm install`.
}
try {
  Device = require('expo-device');
} catch {
  // Module unavailable.
}

export const NOTIFICATIONS_AVAILABLE = Notifications !== null;

// Foreground behaviour: show the banner even when the app is open. The PvP
// event banner already covers in-app surfacing for incoming raids, but
// build-complete pushes that arrive while the player is on a different tab
// should still pop a system banner.
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

let registered = false;

export async function registerPushTokenForUser(uid: string): Promise<string | null> {
  if (!Notifications || !Device?.isDevice) return null;
  if (registered) return null;

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Reelwright',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      });
    }

    const projectId =
      (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
      Constants.easConfig?.projectId;
    const tokenRes = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = tokenRes.data;

    await setDoc(
      doc(db, 'users', uid),
      { expoPushToken: token, expoPushTokenUpdatedAt: Date.now() },
      { merge: true },
    );

    registered = true;
    return token;
  } catch (err) {
    if (__DEV__) console.warn('[push] register failed', err);
    return null;
  }
}
