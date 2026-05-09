// Config plugin: copies adi-registration.properties into
// android/app/src/main/assets/ during `expo prebuild`, so it ends up at
// `assets/adi-registration.properties` inside the compiled APK — the path
// Google's Play Console developer identity verifier reads.
//
// Source resolution order:
//   1. process.env.ADI_REGISTRATION_FILE — EAS file secret. Path is
//      injected by EAS Build at build time. This is the path that works
//      on EAS cloud builds (where the gitignored file isn't checked out).
//   2. <projectRoot>/adi-registration.properties — local fallback for
//      Mac/Linux developers running `eas build --local`. Gitignored.
//
// On machines without either, the plugin no-ops with a console warning so
// the rest of prebuild still runs cleanly (regular dev builds aren't
// affected). Only matters at build time for the one-shot verification APK;
// remove the plugin from app.json once Google has accepted the
// registration.

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const FILE_NAME = 'adi-registration.properties';
const SECRET_ENV = 'ADI_REGISTRATION_FILE';

function resolveSrc(projectRoot) {
  const fromSecret = process.env[SECRET_ENV];
  if (fromSecret && fs.existsSync(fromSecret)) {
    return { path: fromSecret, source: `EAS secret ${SECRET_ENV}` };
  }
  const fromRoot = path.join(projectRoot, FILE_NAME);
  if (fs.existsSync(fromRoot)) {
    return { path: fromRoot, source: 'project root' };
  }
  return null;
}

module.exports = function withAdiRegistration(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const src = resolveSrc(projectRoot);
      if (!src) {
        console.warn(
          `[with-adi-registration] ${FILE_NAME} not found ` +
          `(checked $${SECRET_ENV} and ${projectRoot}/${FILE_NAME}) — ` +
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
      fs.copyFileSync(src.path, dst);
      console.log(`[with-adi-registration] copied from ${src.source} → ${dst}`);
      return config;
    },
  ]);
};
