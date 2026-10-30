# LyricFlow Android

This repository packages the existing LyricFlow React/Vite application using
Capacitor 8.6.0. The UI and fonts are bundled inside the APK, not loaded from a
remote website. The original web repository is unchanged.

Application ID: `com.steveharrisantony.lyricflow`
Launcher name: `LyricFlow`

## Get an APK using only your tablet

1. Open this repository's **Actions** tab.
2. Select **Build Android APK**. A build starts automatically after a push to `main`.
   To build again, choose **Run workflow**, leave branch `main`, then **Run workflow**.
3. Wait for the run to finish successfully and open the run.
4. Under **Artifacts**, download **LyricFlow-Android-debug** (GitHub requires sign-in).
5. Extract the downloaded ZIP using your tablet's Files app.
6. Open `LyricFlow-Android-debug.apk` and allow installation from that Files app
   if Android asks. Then launch **LyricFlow**.

This is a debug-signed APK for device testing, not a Google Play release. A release
needs a private signing key and release configuration. Never commit signing keys.
GitHub-hosted runners may use different debug keys between runs; an APK signed
with another key cannot update an existing installation. Export permitted local
data before uninstalling an older test build, since uninstalling removes app data.

## On-device backend: no external hosting

The APK embeds the existing Express backend using the MIT-licensed
`@capawesome/capacitor-nodejs` plugin (0.2.0), which bundles Node.js Mobile
18.20.4. It starts automatically on a dedicated native thread when LyricFlow
opens. No Termux, manual server commands, hosting account or server URL is needed.

The frontend and all existing `/music/*` endpoints remain in the APK: catalog
search, stream resolution, Range audio streaming, HLS playlist proxying, the
four lyrics-engine choices, subtitle tracks, and the existing SponsorBlock proxy.
The same provider logic is reused from `server.ts`; no provider was replaced with
sample results or silently removed. The optional Python developer resolver is
not needed by this built-in Express path and is not bundled.

Music catalogs, online lyrics, YouTube playback and optional Firebase cloud sync
still use their external internet services. Running the backend locally does not
make those services offline, remove their restrictions, or guarantee that every
provider will respond. Local audio, imported lyrics, romanization and bundled
visuals remain local. Existing cloud authentication still needs device validation;
this change does not introduce a native Google sign-in integration.

Internally, Express binds only to `127.0.0.1` on a dynamically assigned port and
requires a random per-process token. A native WebView client forwards only the
app's `/music/*` requests, including streaming and Range headers, to that service.
The WebView stays on `https://localhost`; remote cleartext traffic and mixed
content remain disabled. Only native loopback HTTP is allowed. The service is
part of the application process, not a permanently running Android foreground
service, so Android can reclaim it when the app is killed.

The UI waits for service readiness before rendering and reports a startup failure
without hiding local-audio/manual-lyrics features. Restart the application to
recover from a runtime failure. Backend caches are bounded in memory. Persistent
user data keeps using the web app's existing local storage mechanisms.

The embedded runtime adds several tens of megabytes per CPU architecture. The
APK supports arm64, armv7 and x86_64. The Node.js Mobile runtime version is older
than the desktop build tooling (Node 22+); runtime maintenance and provider
compatibility need review before a public production release.

An optional `VITE_BACKEND_URL` remains available for web development. Leave it
unset for the self-contained Android build. Never embed backend/provider secrets
in the APK. All `VITE_` values are public build configuration.

## Developer commands

When editing in AI Studio, keep `package-lock.json` in the repository. GitHub
Actions uses npm and `npm ci`; a `bun.lock` file does not replace npm's lockfile.
If dependencies change, regenerate and commit `package-lock.json` with npm before
pushing. Removing it prevents both the APK build and the web checks from starting.

Use Node 22+, JDK 21 and Android SDK platform 36, NDK 27.2.12479018 and CMake 3.22.1 with the build tools required by
the checked-in Gradle project. Android Studio is optional for command-line builds.
The GitHub Actions workflow supplies the native build environment.

```sh
npm ci
npm test
npm run android:sync
npm run test:backend
npm run android:apk
```

`android:sync` runs the TypeScript/Vite production build and `cap sync android`.
`android:apk` synchronizes and invokes the checked-in Gradle wrapper to build a
debug APK. The output is `android/app/build/outputs/apk/debug/app-debug.apk`.
`npm run android:open` opens the native project in Android Studio when installed.
Commit source changes and Android project files, not `dist`, generated copied web
assets, SDK paths, build output, or private signing material.

## Packaging scope and verification

This Android version retains the existing UI and backend provider code. It adds no external
player listener, notification access, background playback service, or audio capture.
The manifest requests internet and microphone access for the existing app; the
microphone is only used after the existing Start Listening action and Android's
permission grant. Local file selection uses Android's file picker.

Before treating the APK as device-verified, test on your Xiaomi Pad 8: launch,
local-file playback, demo visuals, lyric import and timing, full screen, rotation,
file selection, microphone grant/denial and stop, and online catalog/lyrics/video features with internet access. The workflow also runs an Android emulator test of WebView → native proxy → embedded Express startup and checks that unauthenticated loopback requests are rejected. Fixture tests cover search, resolution, Range streaming and timed lyrics without contacting live providers. These checks do not prove Xiaomi hardware performance or live provider availability.

Upstream source snapshot: `steveharrisantony-beep/lyricflow` at
`736facf6753bde219aa7b8aad8a9cb4c16b7e510`.

The automatic browser workflow checks the current production UI, local audio,
lyric import and signed delay, bundled fonts, portrait layout and page errors.
Older `smoke:*` scripts contain assertions for the previous 40-scene interface;
they are retained in the separate **Legacy visual smoke (manual)** workflow and
are not represented as passing checks of the current 23-theme UI.
