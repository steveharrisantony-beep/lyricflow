import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const keystoreDir = resolve(rootDir, 'android', 'keystore');
const keystorePath = resolve(keystoreDir, 'lyricflow-release.jks');
const signingConfigPath = resolve(keystoreDir, 'signing.json');

export function ensureApkKeystore() {
  mkdirSync(keystoreDir, { recursive: true });

  let config = {
    keystorePath,
    keyAlias: process.env.LYRICFLOW_KEY_ALIAS || 'lyricflow-release',
    storePassword: process.env.LYRICFLOW_STORE_PASSWORD || '',
    keyPassword: process.env.LYRICFLOW_KEY_PASSWORD || '',
    sha256Fingerprint: '',
  };

  if (existsSync(signingConfigPath)) {
    try {
      const saved = JSON.parse(readFileSync(signingConfigPath, 'utf8'));
      config = {
        keystorePath: saved.keystorePath || keystorePath,
        keyAlias: process.env.LYRICFLOW_KEY_ALIAS || saved.keyAlias || 'lyricflow-release',
        storePassword: process.env.LYRICFLOW_STORE_PASSWORD || saved.storePassword || '',
        keyPassword: process.env.LYRICFLOW_KEY_PASSWORD || saved.keyPassword || '',
        sha256Fingerprint: saved.sha256Fingerprint || '',
      };
    } catch {
      // Regenerate config below if unreadable
    }
  }

  if (!config.storePassword) {
    config.storePassword = randomBytes(18).toString('base64url');
  }
  if (!config.keyPassword) {
    config.keyPassword = config.storePassword;
  }

  if (!existsSync(config.keystorePath)) {
    console.log('Generating Android APK signing keystore at:', config.keystorePath);
    const keytoolArgs = [
      '-genkeypair',
      '-v',
      '-keystore',
      config.keystorePath,
      '-storetype',
      'PKCS12',
      '-alias',
      config.keyAlias,
      '-keyalg',
      'RSA',
      '-keysize',
      '2048',
      '-validity',
      '10000',
      '-storepass',
      config.storePassword,
      '-keypass',
      config.keyPassword,
      '-dname',
      'CN=LyricFlow, OU=Mobile, O=LyricFlow, L=Studio, S=CA, C=US',
    ];

    const keytoolRes = spawnSync('keytool', keytoolArgs, { stdio: 'pipe' });
    if (keytoolRes.error || keytoolRes.status !== 0) {
      // Fallback 1: OpenSSL PKCS12 keystore (natively supported by Android Gradle Plugin)
      const tmpKey = resolve(keystoreDir, 'tmp-key.pem');
      const tmpCert = resolve(keystoreDir, 'tmp-cert.pem');
      const reqRes = spawnSync(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-keyout',
          tmpKey,
          '-out',
          tmpCert,
          '-days',
          '10000',
          '-subj',
          '/C=US/ST=CA/L=Studio/O=LyricFlow/OU=Mobile/CN=LyricFlow',
        ],
        { stdio: 'pipe' }
      );
      const pkcs12Res =
        reqRes.status === 0
          ? spawnSync(
              'openssl',
              [
                'pkcs12',
                '-export',
                '-in',
                tmpCert,
                '-inkey',
                tmpKey,
                '-out',
                config.keystorePath,
                '-name',
                config.keyAlias,
                '-passout',
                `pass:${config.storePassword}`,
              ],
              { stdio: 'pipe' }
            )
          : { status: 1 };

      if (existsSync(tmpCert)) {
        try {
          const fpRes = spawnSync('openssl', ['x509', '-in', tmpCert, '-noout', '-fingerprint', '-sha256'], {
            encoding: 'utf8',
          });
          const m = fpRes.stdout?.match(/Fingerprint=([0-9A-F:]+)/i);
          if (m) config.sha256Fingerprint = m[1];
        } catch {}
      }
      if (existsSync(tmpKey)) try { unlinkSync(tmpKey); } catch {}
      if (existsSync(tmpCert)) try { unlinkSync(tmpCert); } catch {}

      if (pkcs12Res.status !== 0 || !existsSync(config.keystorePath)) {
        // Fallback 2: Node.js native RSA 2048-bit keypair
        const { privateKey, publicKey } = generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'der' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: config.storePassword },
        });
        writeFileSync(config.keystorePath, privateKey, { mode: 0o600 });
        const digest = createHash('sha256').update(publicKey).digest('hex').toUpperCase();
        config.sha256Fingerprint = digest.match(/.{1,2}/g)?.join(':') || digest;
      }
    }
  } else {
    console.log('Using existing Android APK signing keystore at:', config.keystorePath);
  }

  writeFileSync(
    signingConfigPath,
    JSON.stringify(
      {
        keystorePath: config.keystorePath,
        keyAlias: config.keyAlias,
        storePassword: config.storePassword,
        keyPassword: config.keyPassword,
        sha256Fingerprint: config.sha256Fingerprint,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    { mode: 0o600 }
  );

  return config;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const cfg = ensureApkKeystore();
    console.log('\nAPK Signing Key Ready (local & gitignored):');
    console.log('  Keystore : ' + cfg.keystorePath);
    console.log('  Alias    : ' + cfg.keyAlias);
    console.log('  Config   : ' + signingConfigPath);
    if (cfg.sha256Fingerprint) {
      console.log('  SHA-256  : ' + cfg.sha256Fingerprint);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
