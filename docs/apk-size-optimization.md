# LyricFlow Android size optimization

This project deliberately retains the built-in lyrics engines, visualizer scenes,
YouTube background playback, JioSaavn, local and external audio sources, Android TV,
Firebase mappings, subtitle sync, update verification, and the on-device Node.js server.

## Changes

- Moved 15 unused AI Studio screenshots (15,157,635 bytes total) from
  `public/assets/aistudio` to `docs/reference-images/aistudio`.
  Vite copies **every** file under `public` into `dist`, whether it is imported
  or not. These developer screenshots are no longer copied into APK assets.
  The source reference photos are still available in GitHub.
- Removed 18 unreferenced direct npm packages, including 14 unused Fontsource
  families. All font families actually imported by LyricFlow remain installed.
- Enabled R8 code shrinking and Android resource shrinking for release builds,
  with keep rules protecting Capacitor plugin classes, the native notification
  listener and Node.js JNI bridge. Normal development/emulator builds still
  default to unminified code.
- Android APK workflow generates individually downloadable ABI-specific APKs
  in addition to the universal APK. This avoids bundling native Node.js
  libraries for other CPU architectures in device-specific artifacts.
- Added `npm run size:audit` to report bundled web, font and backend sizes and
  prevent development screenshots being reintroduced into production assets.

## Choosing an APK from the GitHub Actions run

| Artifact | Intended device |
|---|---|
| `LyricFlow-Android` | Universal: any supported Android architecture, default and in-app update build |
| `LyricFlow-Android-arm64-v8a` | Most modern 64-bit Android phones/tablets and some TVs |
| `LyricFlow-Android-armeabi-v7a` | 32-bit ARM Android TVs and older devices |
| `LyricFlow-Android-x86_64` | 64-bit x86 emulator and compatible devices |
| `LyricFlow-Android-x86` | 32-bit x86 emulator and compatible devices |

Use the **universal** artifact if unsure of your device's CPU ABI. Do not choose
an APK based only on Android OS version; the actual processor ABI matters.

The in-app updater and GitHub releases retain the exact
`LyricFlow-Android.apk` **universal** file name and existing checksum/signing
workflow. CPU-specific APKs are optional GitHub Actions artifacts, not a
replacement for the update file.

## Build switches

- `LYRICFLOW_ABI_SPLITS=true`: generate CPU-specific APKs **and** universal.
  The manual APK workflow sets this automatically.
- `LYRICFLOW_OPTIMIZE_RELEASE=false`: turn off R8 release shrinking to
  troubleshoot a release-only plugin issue; normally enabled.
- `LYRICFLOW_OPTIMIZE_DEBUG=true`: enable R8 for downloaded test APKs.
  The manual APK workflow sets this; emulator/instrumentation test workflow
  does not, to preserve debugging behavior.

## Verification

Run `npm ci`, `npm test`, `npm run android:sync`, and
`npm run size:audit`. The manual APK workflow reports sizes of each generated
APK in the GitHub Actions run summary. After installing, verify local Node.js
startup, YouTube/JioSaavn playback, Android external player notification access,
Google Sign-In, lyric synchronization, Android TV controls, and in-app updates.

The native Node.js runtime is **not removable** without replacing the app's
on-device backend mechanism. Its native libraries account for several tens of
megabytes per architecture. R8 does not strip unused CPU architectures from a
universal APK; per-ABI APKs are the safe way to remove those extra binaries.

No actual post-optimization APK size can be claimed until the manual APK build
completes. A successful web build does not prove native plugin compatibility.
