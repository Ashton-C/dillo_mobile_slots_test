const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase JS SDK v10 ships .cjs files for its React Native build, and its
// `exports` field doesn't surface them under the conditions Metro picks when
// `unstable_enablePackageExports` is on (the SDK 53+ default). The result is
// `@firebase/app` getting pulled in twice, so the auth component registers
// against one component-registry instance while `initializeAuth` looks up a
// different one — surfacing as "Component auth has not been registered yet".
//
// Adding `cjs` to sourceExts and falling back to the legacy `react-native`
// field resolver ensures a single shared instance. Remove this when we move
// to Firebase v11+, which exposes a clean RN entry under modern conditions.
config.resolver.sourceExts.push('cjs');
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
