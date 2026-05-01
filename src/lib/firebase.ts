import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { initializeAuth, getAuth, Auth } from 'firebase/auth';
// @ts-ignore — Metro resolves the RN build which exports this; TS resolves the wrong types
import { getReactNativePersistence } from '@firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, Firestore } from 'firebase/firestore';
import Constants from 'expo-constants';

// Read from app.config.js extra (injected at build time) with process.env as fallback.
const extra = Constants.expoConfig?.extra ?? {};

const firebaseConfig = {
  apiKey:            extra.firebaseApiKey            || process.env.EXPO_PUBLIC_FIREBASE_API_KEY            || '',
  authDomain:        extra.firebaseAuthDomain        || process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN        || '',
  projectId:         extra.firebaseProjectId         || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID         || '',
  storageBucket:     extra.firebaseStorageBucket     || process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET     || '',
  messagingSenderId: extra.firebaseMessagingSenderId || process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId:             extra.firebaseAppId             || process.env.EXPO_PUBLIC_FIREBASE_APP_ID             || '',
};

let app: FirebaseApp;
let auth: Auth;

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} else {
  app = getApps()[0]!;
  auth = getAuth(app);
}

export { auth };
export const db: Firestore = getFirestore(app);
export default app;
