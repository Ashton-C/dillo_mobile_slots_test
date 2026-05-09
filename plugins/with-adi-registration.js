// Config plugin: copies adi-registration.properties from the project root
// into android/app/src/main/assets/ during `expo prebuild`, so it ends up at
// `assets/adi-registration.properties` inside the compiled APK — the path
// Google's Play Console developer identity verifier reads.
//
// The file itself contains an account-tied identifier and is gitignored.
// On developer machines without the file, this plugin no-ops with a warning
// so the rest of prebuild still runs cleanly. Only matters at build time
// for the one-shot verification APK; remove the plugin from app.json once
// Google has accepted the registration.

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const FILE_NAME = 'adi-registration.properties';

module.exports = function withAdiRegistration(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const src = path.join(projectRoot, FILE_NAME);
      if (!fs.existsSync(src)) {
        console.warn(
          `[with-adi-registration] ${FILE_NAME} not found at project root — ` +
          `skipping. (Expected if you're not building the verification APK.)`,
        );
        return config;
      }
      const dst = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'assets',
        FILE_NAME,
      );
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      console.log(`[with-adi-registration] copied ${FILE_NAME} → ${dst}`);
      return config;
    },
  ]);
};
