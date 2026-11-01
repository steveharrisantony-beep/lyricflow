import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {ensureApkKeystore} from './generate-apk-keystore.mjs';

const windows = process.platform === 'win32';
const wantRelease = process.argv.includes('--release') || process.argv.includes('--signed');
const env = { ...process.env };

if (wantRelease && !env.LYRICFLOW_KEYSTORE) {
  try {
    const cfg = ensureApkKeystore();
    env.LYRICFLOW_KEYSTORE = cfg.keystorePath;
    env.LYRICFLOW_KEY_ALIAS = cfg.keyAlias;
    env.LYRICFLOW_STORE_PASSWORD = cfg.storePassword;
    env.LYRICFLOW_KEY_PASSWORD = cfg.keyPassword;
  } catch (e) {
    console.warn('Keystore setup warning:', e instanceof Error ? e.message : String(e));
  }
} else if (!env.LYRICFLOW_KEYSTORE && existsSync(new URL('../android/keystore/lyricflow-release.jks', import.meta.url))) {
  try {
    const cfg = ensureApkKeystore();
    env.LYRICFLOW_KEYSTORE = cfg.keystorePath;
    env.LYRICFLOW_KEY_ALIAS = cfg.keyAlias;
    env.LYRICFLOW_STORE_PASSWORD = cfg.storePassword;
    env.LYRICFLOW_KEY_PASSWORD = cfg.keyPassword;
  } catch {}
}

const gradleTask = wantRelease ? 'assembleRelease' : 'assembleDebug';
const result = spawnSync(windows ? 'gradlew.bat' : './gradlew', ['--no-daemon', gradleTask], {
  cwd: new URL('../android/', import.meta.url),
  stdio: 'inherit',
  shell: windows,
  env,
});
if (result.error) {
  console.error('Unable to run the Android Gradle wrapper:', result.error.message);
}
process.exit(result.status ?? 1);
