# LyricFlow Android

This repository packages the existing LyricFlow React/Vite application using
Capacitor 8.6.0. The UI and fonts are bundled inside the APK, not loaded from a
remote website. The original web repository is unchanged.

Application ID: `com.steveharrisantony.lyricflow`
Launcher name: `LyricFlow`

## Get an APK using only your tablet

1. Open this repository's **Actions** tab.
2. Only when you want an APK, select **Build Android APK**, choose **Run workflow**,
   leave branch `main`, then **Run workflow**. Source updates do not trigger APK builds.
3. Wait for the run to finish successfully and open the run.
4. Under **Artifacts**, download **LyricFlow-Android** (GitHub requires sign-in).
5. Extract the downloaded ZIP using your tablet's Files app.
6. Open `LyricFlow-Android.apk` and allow installation from that Files app
   if Android asks. Then launch **LyricFlow**.

The workflow uses persistent release signing when its signing secrets are configured;
otherwise it produces a debug-signed test APK. Never commit signing keys.
GitHub-hosted runners may use different debug keys between runs; an APK signed
with another key cannot update an existing installation. Export permitted local
data before uninstalling an older test build, since uninstalling removes app data.

## External Player permission setup

Selecting **External player** opens an ordered setup. It does not request audio permission.

1. On Android 13+, **Open App info** opens this app's Android settings. Enable
   **Allow restricted settings** if required: Xiaomi may show it under Advanced
   settings, while other devices use the overflow menu. Return and confirm that
   you checked it. Opening App info alone is not treated as granting access.
   Older Android versions skip this step; devices with notification access already
   granted go directly to audio selection.
2. **Enable notification listening** opens LyricFlow's notification-access page
   (or the general list when the device does not support the app-specific page).
   LyricFlow rechecks the real permission on return; **Check access** is a fallback.
   It uses media playback metadata for matching lyrics/video, not ordinary messages.
3. Choose **Internal Audio** or **Microphone**, then press its **Start** button.
   Only then is Android audio permission requested. Internal Audio uses Android's
   `Visualizer(0)` and may require a permission labelled Microphone; OEM restrictions
   may make it unavailable. The app does not silently switch to Microphone.

Audio is optional. Song metadata and timed lyrics can work without audio capture.
Changing source/mode, stopping, revoking access or leaving during a pending audio
permission request releases capture resources. Settings must be changed by the
user; the app cannot enable restricted settings or notification access itself.
The restricted-settings confirmation is a user acknowledgement, not a claim that
Android exposed the switch's value. No hidden settings APIs are used.

### Play Protect installation warnings

The setup above happens **after installation** and cannot remove a Play Protect
installation block. Google documents region-dependent blocking of internet-sideloaded
apps that request sensitive access, including notification listeners. An APK's
signing key is important for update continuity, but does not exempt it from these
checks. If Google offers an app scan, let the scan finish.

**If Play Protect blocks the GitHub APK:** First verify the file came from the
project's official release and review the warning. Some users may choose to
**temporarily pause Google Play Protect scanning** for a trusted APK:

1. Open the **Google Play Store** and tap your **profile picture**.
2. Open **Play Protect → Settings** (gear icon).
3. Turn **Scan apps with Play Protect** off only if you accept the temporary risk.
4. Retry installation, then **immediately turn Scan apps with Play Protect back on**.

This is **not a requirement for everyone** and may not bypass all blocks. Turning
protection off reduces your device's malware protection. Do not ignore a specific
harmful-app finding without checking the APK and its source. Google recommends
keeping Play Protect enabled; if LyricFlow is misclassified, the project owner
should check its permissions and request a Play Protect appeal.

- [Google's Play Protect user guide](https://support.google.com/android/answer/2812853)
- [Google's Play Protect developer guidance](https://developers.google.com/android/play-protect/warning-dev-guidance)
- [Google's app-verification appeal](https://support.google.com/android/answer/2992033)
- [Android restricted settings](https://support.google.com/android/answer/12623953)

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

Music catalogs, online lyrics, YouTube playback and some romanization requests
still use external internet services. Running the backend locally does not make
those services offline, bypass provider restrictions or guarantee availability.
Local audio, imported lyrics and bundled visuals can work without those services.
User preferences and song mappings are stored locally; **Firebase account sign-in
and cloud synchronization have been removed**. Optional YouTube account settings
are separate and do not require Firebase.

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

The Android app includes a native notification listener for the **External Player**
source, audio capture support, media playback controls and the embedded backend.
It requests internet access, audio capture permission when enabled, and Android
notification access through an explicit setup flow. Local file selection uses
the Android file picker. Audio capture does not start merely by selecting the
External Player source.

Before treating the APK as device-verified, test on your Xiaomi Pad 8: launch,
local-file playback, demo visuals, lyric import and timing, full screen, rotation,
file selection, microphone grant/denial and stop, and online catalog/lyrics/video features with internet access. The workflow also runs an Android emulator test of WebView → native proxy → embedded Express startup and checks that unauthenticated loopback requests are rejected. Fixture tests cover search, resolution, Range streaming and timed lyrics without contacting live providers. These checks do not prove Xiaomi hardware performance or live provider availability.

LyricFlow Android originated from the browser-based LyricFlow project.
This repository now contains its own subsequent features and fixes.

The automatic browser workflow checks the current production UI, local audio,
lyric import and signed delay, bundled fonts, portrait layout and page errors.
Older `smoke:*` scripts may contain assertions for previous visual interfaces;
they are retained in a separate **Legacy visual smoke (manual)** workflow.
The actively maintained browser workflow verifies the current 28-theme UI.

## Updates from inside the app

See [Android app updates](ANDROID_UPDATES.md) for the in-app checker, verified APK download, Android installation confirmation and one-time permanent signing setup. The browser preview cannot install an Android update.
