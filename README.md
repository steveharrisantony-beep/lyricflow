<div align="center">

# lyricflow.

### See the music. Feel every word.

**Music, synchronized lyrics and motion — together on one stage.**

[![Latest release](https://img.shields.io/github/v/release/steveharrisantony-beep/lyricsflow-android?style=for-the-badge&label=Android%20release&labelColor=203a31&color=3b8565)](https://github.com/steveharrisantony-beep/lyricsflow-android/releases/latest)
[![GitHub stars](https://img.shields.io/github/stars/steveharrisantony-beep/lyricsflow-android?style=for-the-badge&labelColor=203a31&color=3b8565)](https://github.com/steveharrisantony-beep/lyricsflow-android/stargazers)
[![Android + Web](https://img.shields.io/badge/Platforms-Android%20%2B%20Web-3b8565?style=for-the-badge&labelColor=203a31)](#install)

[**Download APK**](https://github.com/steveharrisantony-beep/lyricsflow-android/releases) · [**Try the live demo**](https://lyricflowdemo.ai.studio/) · [**Features**](#what-it-does) · [**Screenshots**](#screenshots) · [**Setup**](#first-time-setup) · [**FAQ**](#faq)

</div>

<p align="center">
  <a href="docs/Screenshot_2026-11-08-18-53-31-201_com.steveharrisantony.lyricflow.jpg"><img src="docs/Screenshot_2026-11-08-18-53-31-201_com.steveharrisantony.lyricflow.jpg" alt="LyricFlow Android app fullscreen music visualizer with synchronized lyrics" width="100%"></a>
</p>

LyricFlow turns a song into a visual experience: **video or beat-reactive backgrounds, lyrics in time with the music, and customizable letter-by-letter effects.** Enjoy it fullscreen, or open the player and settings whenever you need them.

No LyricFlow account required. Your preferences and saved song mappings stay on your device.

> **[Launch the interactive web demo](https://lyricflowdemo.ai.studio/)** — Explore LyricFlow in your browser before installing Android.

---

## What it does

<table>
  <tr>
    <td width="50%" valign="top">

### 🎨 Visuals that move with music

- **28 built-in themes** with music-reactive patterns, waves and spectrum effects.
- Switch from themes to a **matching YouTube video background**.
- Adjust quality, sensitivity, intensity, motion, dimming and colors.

</td>
    <td width="50%" valign="top">

### 🎤 Lyrics that follow every word

- **Word-by-word highlighting** when accurate word timing exists.
- Line-synced lyrics as a fallback.
- Customize animated lettering, fonts, layout, color and word styles.
- Optional **romanization** for supported non-Latin scripts.

</td>
  </tr>
  <tr>
    <td valign="top">

### 🎵 Listen your way

- Built-in **YouTube and JioSaavn** music search.
- Open **local audio files** on your device.
- Android **External Player** can follow active tracks in other media apps through media-session notifications.
- Optional microphone/internal-audio reactive capture, depending on device support.

</td>
    <td valign="top">

### 🛠️ Your song, your settings

- Prefer a particular lyrics version or video.
- Fix timing with song-specific delays.
- **Save Song Mapping** so your selection is reused.
- Hide lyrics or video for an individual song.
- Export/import backups; no Firebase account or cloud sync.

</td>
  </tr>
</table>

**Built for Android and the browser.** The APK includes its own on-device backend for supported online search and matching; you don't have to rent or host a separate server. Third-party music, videos and online lyrics still need internet access.

---

## Screenshots

Explore LyricFlow's interface in these original Android screenshots. Select any image to view it at full resolution.

<p align="center">
  <a href="docs/Screenshot_2026-11-08-18-54-53-744_com.steveharrisantony.lyricflow.jpg"><img src="docs/Screenshot_2026-11-08-18-54-53-744_com.steveharrisantony.lyricflow.jpg" width="48%" alt="LyricFlow app screenshot 1"></a>
  <a href="docs/Screenshot_2026-11-08-18-55-13-177_com.steveharrisantony.lyricflow.jpg"><img src="docs/Screenshot_2026-11-08-18-55-13-177_com.steveharrisantony.lyricflow.jpg" width="48%" alt="LyricFlow app screenshot 2"></a>
</p>

<p align="center">
  <a href="docs/Screenshot_2026-11-08-18-55-36-928_com.steveharrisantony.lyricflow.jpg"><img src="docs/Screenshot_2026-11-08-18-55-36-928_com.steveharrisantony.lyricflow.jpg" width="48%" alt="LyricFlow app screenshot 3"></a>
  <a href="docs/Screenshot_2026-11-08-18-55-46-747_com.steveharrisantony.lyricflow.jpg"><img src="docs/Screenshot_2026-11-08-18-55-46-747_com.steveharrisantony.lyricflow.jpg" width="48%" alt="LyricFlow app screenshot 4"></a>
</p>

---

## Install

### Android

1. Go to [**GitHub Releases**](https://github.com/steveharrisantony-beep/lyricsflow-android/releases).
2. Open the latest Android release that includes an APK and download **LyricFlow-Android.apk**.
3. Install it on your Android device. Review and approve the installation request if Android asks.
4. Launch **LyricFlow**, select **Start visualizer**, and choose a music source.

> **Google Play Protect warning:** On some devices, Play Protect may warn about or block the GitHub APK, particularly because LyricFlow requests notification access for External Player. If you have verified the APK comes from this project's GitHub release and decide to temporarily pause scanning, open **Play Store → Profile → Play Protect → Settings → Scan apps with Play Protect (off)**. **Turn it back on immediately afterward.** This is not required on every device, reduces device security while disabled, and may not override every installation block. Prefer accepting an offered security scan; do not bypass a harmful-app warning for an unverified APK. See [Android installation guidance](ANDROID.md#play-protect-installation-warnings) and [Google's Play Protect help](https://support.google.com/android/answer/2812853).

> **Already installed another build?** APK updates must use a compatible signing key. If Android refuses an update because of a signature mismatch, back up your LyricFlow data before removing the older app.

The Android app is also designed to support Android TV, but features that depend on audio capture or notification permissions vary by device. See [ANDROID.md](ANDROID.md) for detailed setup, permissions, Android TV and builds.

### Web browser

**Try it without installing:** [lyricflowdemo.ai.studio](https://lyricflowdemo.ai.studio/)

For a local development copy, use **Node.js 22+** and npm:

```bash
git clone https://github.com/steveharrisantony-beep/lyricsflow-android.git
cd lyricsflow-android
npm ci
npm run dev
```

Open **http://localhost:3000**. This runs the app and its development backend locally; Firebase and a hosted server are not required.

<details>
<summary><b>Build Android from source</b></summary>

You need a compatible JDK, Android SDK and the checked-in Gradle toolchain. The repository also provides a **manual** GitHub Actions APK workflow; ordinary commits do not start APK builds.

```bash
npm ci
npm run typecheck
npm test
npm run android:sync
npm run android:apk
```

The local debug APK is written under `android/app/build/outputs/apk/debug/`. Read [ANDROID.md](ANDROID.md) and [ANDROID_UPDATES.md](ANDROID_UPDATES.md) for toolchain and release-signing details.

</details>

---

## First-time setup

1. Open LyricFlow and tap **Start visualizer**.
2. Select a source: **Online Music**, **Local Audio**, or **External Player** (Android).
3. Pick a song. LyricFlow searches for matching lyrics and a background video when enabled.
4. Use **Settings → Background** to choose between videos and audio-reactive themes.
5. Use **Settings → Lyrics** to customize positions, fonts, animations, colors, and romanization.
6. If a lyric/video match is wrong, open **Settings → Song Mapping**, choose another result and tap **Save mapping for current song**.

### External Player on Android

Allow **notification access** when prompted so LyricFlow can read track metadata from active media sessions. Optionally start **Internal Audio** or **Microphone** capture for beat-reactive visuals. LyricFlow does **not** need access to your ordinary messages to identify the current song, and permissions must be granted manually in Android settings.

---

## How it works

```text
     PLAY A SONG
          │
          ├─ Track title + artist + position
          │
          ├─ Saved Song Mapping?
          │    ├─ Yes → reuse your lyric/video choices
          │    └─ No  → search supported lyric and video providers
          │
          ├─ Select the most suitable synced lyrics
          │    └─ optional romanization + lyric animations
          │
          └─ Show an audio-reactive theme or matching video
                       │
                SYNCHRONIZED STAGE
```

**Lyrics and video searches run independently.** If no usable lyrics are available, the music and background can keep playing. If a video fails to embed, choose another one or switch to themes. Background YouTube videos paired with audio from another source remain muted.

**Song Mapping** stores your manual selections locally. Temporary candidate lists and prepared upcoming tracks are not permanent backups. Use **Settings → Others → Import & export** to preserve your settings and mappings before clearing data.

Learn more in [Song Mapping](SONG_MAPPING_DATA.md) and [Video Matching](YOUTUBE_MATCHING.md).

---

## FAQ

<details>
<summary><b>Does LyricFlow require a Firebase account or API key?</b></summary>

No. The current app uses local storage for preferences and custom mappings. Its supported default music/lyrics integrations do not require you to configure Firebase. Some internal folders retain historical names for compatibility.

</details>

<details>
<summary><b>Why can't LyricFlow find lyrics for a song?</b></summary>

The provider may not have lyrics, the metadata may be different, or no suitable timed result may exist. Try **Settings → Song Mapping → Lyrics mapping**, search manually, import your own synced lyrics or adjust the timing.

</details>

<details>
<summary><b>Can I use Spotify or other apps with LyricFlow?</b></summary>

On Android, **External Player** can follow supported playback notifications and media sessions. LyricFlow uses the track information to find lyrics/video; it does not extract another app's protected audio stream. Audio-reactive capture depends on Android and device permissions.

</details>

<details>
<summary><b>Will it work offline?</b></summary>

Bundled visual themes, local audio and previously saved/imported lyrics can work without online providers. Searching for new lyrics, music or YouTube videos generally needs internet.

</details>

<details>
<summary><b>Why is a background video missing or muted?</b></summary>

Some YouTube videos disallow embedding or fail to load. Select another candidate or use a theme. When a different source supplies the music, the background video is intentionally muted so you don't hear two tracks.

</details>

<details>
<summary><b>Is there an Android TV version?</b></summary>

LyricFlow is designed to open on supported Android TV devices as well as phones/tablets, but hardware performance, controls, codecs and notification/audio permissions vary. Not every device is fully tested.

</details>

<details>
<summary><b>Where can I report an issue or suggest a feature?</b></summary>

Use [GitHub Issues](https://github.com/steveharrisantony-beep/lyricsflow-android/issues). Include the app version, device, what happened, and relevant logs. Remove any account cookies or private data before sharing logs publicly.

</details>

---

## Behind the scenes

Built with **React, TypeScript, Vite, Canvas 2D, Web Audio, Express and Capacitor**. The Android package includes an embedded on-device Node.js backend and native media integration.

**Useful developer commands:** `npm run typecheck` · `npm test` · `npm run build` · `npm run build:backend` · `npm run test:backend`

<details>
<summary><b>Project layout</b></summary>

```text
src/                  UI, music, lyrics and visualizer
src/firebase/         Legacy folder: local storage and mapping utilities
server.ts             Web API and development server
server/               Provider adapters and server helpers
android/              Capacitor project and native Android plugins
node-runtime/         Android embedded backend
docs/                 References and technical notes
.github/workflows/    CI checks and manually triggered APK build
```

</details>

---

## Credits and thanks

LyricFlow depends on many open-source tools and draws ideas from music visualization and lyric synchronization projects.

**Core stack:** [React](https://github.com/facebook/react) · [Vite](https://github.com/vitejs/vite) · [Capacitor](https://github.com/ionic-team/capacitor) · [Lucide](https://github.com/lucide-icons/lucide)

**Music and lyrics research:** [Stash](https://github.com/rawnaldclark/Stash) · [yt-dlp](https://github.com/yt-dlp/yt-dlp) · [ytmusicapi](https://github.com/sigma67/ytmusicapi) · [youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api) · [SponsorBlock](https://github.com/ajayyy/SponsorBlockServer)

**Motion and visual inspiration:** [Codrops LetterEffects](https://github.com/Codrops/LetterEffects) · [audioMotion-analyzer](https://github.com/hvianna/audioMotion-analyzer) · [CAVA](https://github.com/karlstav/cava) · [Butterchurn](https://github.com/jberg/butterchurn)

**[Full credits, repositories and attribution details →](CREDITS.md)**

---

## Support LyricFlow

Developed by **Steve Harris**.

If you like LyricFlow, a GitHub star, feedback or bug report helps the project grow.

[**☕ Buy me a coffee**](https://www.buymeacoffee.com/steveharris) · [**Instagram**](https://www.instagram.com/ig.steve_edits) · [**Live demo**](https://lyricflowdemo.ai.studio/)

---

<sub>LyricFlow is an independent project and is not affiliated with or endorsed by YouTube, Google, Spotify, JioSaavn or any lyrics/video service. Third-party media and services remain subject to their respective rights and terms.</sub>
