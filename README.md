# LyricFlow

**See the music. Feel every word.**

LyricFlow puts **music, synchronized lyrics and animated visuals** on the same screen. Play a song, watch the background react to the sound, and follow the lyrics as they appear in time with the music.

It works in a web browser and as an Android app. You can use built-in visual themes or show a YouTube video behind the lyrics.

> **Quick facts:** No LyricFlow account is required. Your settings and custom song mappings are stored on your device. Android includes a local backend, so you do not need to host your own server to use the APK. Online music, video and lyric sources still require an internet connection.

## What can it do?

| Feature | In simple terms |
| --- | --- |
| **Music-reactive backgrounds** | Choose from 28 built-in visual themes with animated colors, shapes and spectrum effects that respond to sound. |
| **Video backgrounds** | Show a matching YouTube music or lyric video behind your lyrics. Videos paired with a separate audio source stay muted. |
| **Synced lyrics** | Show line-by-line lyrics or highlight individual words when word timing is available. Word-synced lyrics are preferred where a suitable match exists. |
| **Automatic lyric search** | Try multiple lyric sources, use available results while searching, and switch to a better timed version after the current line ends. |
| **Romanization** | Display supported non-Latin lyrics in Latin letters when enabled, so you can read along with unfamiliar scripts. |
| **Lyric effects** | Customize fonts, colors, placement, size, animations and current-word highlight styles. |
| **Song Mapping** | Save a preferred lyrics file, background video, timing correction or hide preference for a particular song. |
| **Fullscreen mode** | Enjoy an immersive visualizer with an optional player and settings overlay. |
| **Personal backups** | Export and import settings and song mappings as JSON files. No cloud account needed. |

### Choose how to listen

| Source | What you can do | Availability |
| --- | --- | --- |
| **Online music** | Search and play music using the supported YouTube and JioSaavn integrations. | Web and Android; depends on provider availability |
| **Local audio** | Choose a music file already on your device. | Web and Android |
| **External Player** | Follow playback metadata from another Android media app (for example, Spotify or YouTube Music) and look up matching lyrics/video. | Android only; notification access required |
| **Audio-reactive capture** | Drive visualizations using supported microphone or Android internal-audio capture modes. | Depends on platform, permissions and device capabilities |

**Important:** LyricFlow is a visualizer and playback interface, not a music subscription service. It does not include a licensed catalog of downloadable songs or lyrics. Some videos cannot be embedded, and third-party searches may fail or change without notice.

## Getting started

### On Android

1. Get a compatible APK from [Releases](https://github.com/steveharrisantony-beep/lyricsflow-android/releases) if one is published. Developers can also download a manually built test APK from GitHub Actions.
2. Install the APK and open **LyricFlow**. Review any Android installation or permission prompts before granting access.
3. Tap **Start visualizer**. You can try the optional short demo or choose your own song.
4. Open **Select Source** and pick online music, a local audio file or **External Player**.
5. Play music. LyricFlow will look for matching lyrics and a video background when those features are enabled.
6. Tap **Settings** to customize the visualizer, lyrics and song mapping.

**Using another music app?** In Android's **External Player** setup, follow the prompts for notification access and—if you want reactive audio capture—select **Internal Audio** or **Microphone** and press **Start**. The app cannot grant these permissions for you. Internal-audio capture is not supported by every device.

For step-by-step installation, Android TV notes, permissions and signing, read [ANDROID.md](ANDROID.md).

### In a browser

You'll need **Node.js 22 or newer** and npm. Clone this repository, then run:

```bash
npm ci
npm run dev
```

Open **http://localhost:3000** in your browser. The development command serves both the web interface and the local music/lyrics API. You do not need Firebase or an API-key configuration file for the default setup.

For security, the development backend listens on `127.0.0.1` by default. Only if you intentionally need access from another device on your network, launch it with `HOST=0.0.0.0 npm run dev` and protect that network—these development endpoints are not designed as a public internet service.

The browser supports local audio and its available online features. Android-specific notification listening and native playback controls are not available in the browser.

## How LyricFlow works

```text
Choose a song
    |
    +-- Read its title, artist and playback position
    |
    +-- Look for a saved Song Mapping
    |      |
    |      +-- Found? Use your selected lyrics/video and delays
    |      +-- Not found? Search available online sources
    |
    +-- Choose timed lyrics (prefer accurate word sync)
    |      |
    |      +-- Optional romanization and lyric effects
    |
    +-- Show a muted video OR an audio-reactive theme
    |
    +-- Keep the visuals and lyrics in sync with playback
```

LyricFlow uses **separate search systems for lyrics and video**. That means a missing video does not prevent lyric playback, and a video can be replaced without replacing the song. Your manually saved Song Mapping takes priority over automatic choices.

For synced lyrics, the application checks candidate titles, artists, duration and usable timestamps. It can also accept a line-synced or word-synced *alternative recording* when the song title matches and both recording durations match to the nearest whole second. Once a preferred word-synced match is found, later automatic search stages can stop. Some songs have no accurate timed lyrics; in that case, try a different candidate or import your own LRC/TTML file.

When playing another audio source, video backgrounds are **muted** so the app does not play two soundtracks at once. During ads or unavailable video playback, it can show the built-in visual themes instead.

## Make it yours: Settings

| Section | Useful controls |
| --- | --- |
| **Song Mapping** | See the current lyric and video matches, change them manually, correct timing, save mappings, or hide lyrics/video for one recording. |
| **Background** | Switch between video and themes; choose preferred video type, theme selection, colors, transitions and video fit/dimming. |
| **Lyrics** | Choose original or romanized display, fonts, size, colors, positions, animations and word styles. |
| **Render Engine** | Adjust visual quality, audio sensitivity, intensity, camera movement and related effects. |
| **Others** | Light/dark appearance, data export/import, reset options and information about the app. |
| **Logs** | Inspect lyrics search, video search and romanization activity to understand why a match was selected or rejected. |

**If lyrics or video are wrong:** Open **Settings → Song Mapping**, inspect the preloaded candidates, choose another version or search manually, adjust the delay if needed, then select **Save mapping for current song**. That choice is remembered locally for the recording.

## Your data and privacy

- **Local by default:** Preferences, custom lyric content, saved song mappings and corrections are stored in this browser/app's local data. Use **Others → Import & export data** to make a backup before clearing data or uninstalling.
- **No Firebase sign-in or cloud synchronization:** The current version does not require a Firebase project or a LyricFlow account. Some source files still use the historical `src/firebase/` folder name for *local storage and mapping utilities*; this is not an active Firebase SDK dependency.
- **Online features contact external services:** When searching online music, lyrics, videos or romanization, requests and relevant track metadata may be sent to the corresponding providers. Provider terms and availability apply.
- **YouTube account options are separate:** Advanced YouTube session or cookie settings, if used, are not Firebase authentication. Treat those credentials as sensitive; never post them in issues or commit them.
- **No packaged credentials required:** Do not put private API keys, signing keystores, passwords or session cookies in the repository. Values prefixed with `VITE_` should always be treated as browser-visible build configuration.

## Development and Android builds

The app uses **React, TypeScript, Vite, Web Audio, Canvas 2D** and an **Express** backend. Android packaging uses **Capacitor** and an embedded Node.js runtime.

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the exact dependencies from `package-lock.json` |
| `npm run dev` | Run the development web application and backend |
| `npm run typecheck` | Check TypeScript |
| `npm test` | Run unit and integration tests |
| `npm run build` | Create the production web bundle |
| `npm run build:backend` | Package the local backend for Android |
| `npm run test:backend` | Verify the embedded backend |
| `npm run android:sync` | Build and copy the web/backend assets into Capacitor Android |

You can also build a test APK manually from **Actions → Build Android APK → Run workflow**. Ordinary pushes do **not** start APK builds. GitHub Actions may produce an unsigned-for-release/debug-signed test build when permanent release-signing secrets are not configured.

For building from source locally you will also need the Android SDK and a compatible JDK. See [Android installation and build instructions](ANDROID.md) and [app update/signing notes](ANDROID_UPDATES.md).

### Repository layout

```text
src/                 Web app, audio, lyrics, settings and visual effects
src/firebase/        Legacy folder name: local data and mapping helpers
server.ts            Express web API and developer server
server/              Lyrics, YouTube and supporting service adapters
android/             Capacitor Android project and native plugins
node-runtime/        Bundled Android backend entry point
scripts/             Build, size audit and test utilities
docs/                Technical notes, credits and research
.github/workflows/   Automatic checks and manually triggered APK jobs
```

The [song mapping guide](SONG_MAPPING_DATA.md), [video matching notes](YOUTUBE_MATCHING.md) and [theme/animation references](docs/lyric-animation-references.md) explain individual systems in more depth.

## Credits

Developed by **Steve Harris** · [Instagram](https://www.instagram.com/ig.steve_edits) · [Support the project](https://www.buymeacoffee.com/steveharris)

Research and inspiration include [Codrops LetterEffects](https://github.com/Codrops/LetterEffects), [audioMotion-analyzer](https://github.com/hvianna/audioMotion-analyzer), [youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api), [SponsorBlock](https://github.com/ajayyy/SponsorBlockServer) and other references documented under [docs/](docs/). They are not endorsements of LyricFlow.
