// app.config.js replaces app.json so we can inject env vars via extra at build time.
// The Expo CLI populates process.env from .env.local before evaluating this file.
const base = require('./app.json');

module.exports = {
  ...base,
  expo: {
    ...base.expo,
    extra: {
      firebaseApiKey:           process.env.EXPO_PUBLIC_FIREBASE_API_KEY           ?? '',
      firebaseAuthDomain:       process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN       ?? '',
      firebaseProjectId:        process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID        ?? '',
      firebaseStorageBucket:    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET    ?? '',
      firebaseMessagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
      firebaseAppId:            process.env.EXPO_PUBLIC_FIREBASE_APP_ID            ?? '',
    },
  },
};
