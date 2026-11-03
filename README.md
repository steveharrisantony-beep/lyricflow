# LyricFlow Android

A music-reactive visualizer and synchronized lyrics app for Android and the browser.
Built with React, TypeScript, Vite and Canvas 2D, with Capacitor and an embedded
Node.js/Express backend on Android.

## Features

- **28 reactive themes and 115 colour palettes**, including Spectrum Prism,
  Radial Spectrum, Spectrum Waterfall and Spectrum Ribbons. Pixel Garden has
  audio-reactive flowers; Color Riot uses light pastel palettes.
- **Automatic rotation:** one enabled theme stays fixed; multiple themes rotate.
  Select multiple palettes per theme to rotate those too, with adjustable duration.
- **25 lyric animations**, four current-word styles with animated highlights, and separate
  **Lift and Zoom** effects. **Orbit** combines its trails and satellites with progressive
  letter glow. Letters flow smoothly while connected scripts
  such as Hindi remain shaped. Word effects require word-synced lyrics.
- **Flexible lyrics:** original/romanized display, manual import and editing,
  source reselection, adaptive theme/album colours, independent font-size limits,
  placement, horizontal/vertical padding and maximum text width/height.
- **Music and video:** local files, online search, queue controls, muted YouTube
  backgrounds with separate audio, saved song mappings and independent lyric/video
  timing adjustments.
- **Responsive glass interface:** light/dark modes, fullscreen controls, quality
  presets, reduced motion and optional Firebase account sync.

Settings are organized into **Song Mapping, Background, Lyrics, Render Engine
and Others**. Preferences and selection pools are saved between sessions.

## Android app

The APK includes the app and its backend, so no external server hosting is needed.
Online music and lyric lookup, plus optional account sync, require internet access.

**External Player** reads media playback details from other Android music players.
Its setup guides users through **restricted settings → notification access →
Microphone or Internal Audio**. Audio capture starts only after an explicit Start
request. Internal Audio support and performance depend on the device.

APK builds are **manual-only**: GitHub **Actions → Build Android APK → Run workflow**.
See the [Android guide](ANDROID.md) for installation, signing, updates and permission
troubleshooting. Xiaomi Pad 8 / Android WebView performance and native permission
screens still need on-device verification.

## Development

Use **Node.js 22+** and npm:

```bash
npm ci
npm run dev
```

Checks: `npm run typecheck`, `npm test`, `npm run build`,
`npm run build:backend` and `npm run test:backend`.
Keep `package-lock.json` committed. Firebase setup is documented in
[FIREBASE_SETUP.md](FIREBASE_SETUP.md).

## Reference repositories

These projects informed the source adapters, timing and custom visual effects:

| Area | Repositories |
| --- | --- |
| Music, lyrics and segment skipping | [Stash](https://github.com/rawnaldclark/Stash), [youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api), [SponsorBlockServer](https://github.com/ajayyy/SponsorBlockServer) |
| Lyric presentation and motion | [baseline](https://github.com/Tunai-0511/baseline), [pdoom-video](https://github.com/mexicat/pdoom-video), [Codrops LetterEffects](https://github.com/Codrops/LetterEffects), [Anime.js](https://github.com/juliangarnier/anime), [Splitting](https://github.com/shshaw/Splitting) |
| Spectrum visualizers | [audioMotion-analyzer](https://github.com/hvianna/audioMotion-analyzer), [CAVA](https://github.com/karlstav/cava), [WebAudioSpectrum](https://github.com/deftio/WebAudioSpectrum), [audio-analyzer](https://github.com/fagci/audio-analyzer) |
| Reactive backgrounds | [Butterchurn](https://github.com/jberg/butterchurn), [Party Mode](https://github.com/preziotte/party-mode), [Visual Audio](https://github.com/josephyu12/visual-audio), [Void Visualizer](https://github.com/TheOmegaFett/void-visualizer) |

Implementation and attribution details: [lyric motion](docs/lyric-animation-references.md),
[theme research](docs/theme-visualizer-research.md), [spectrum themes](docs/spectrum-analyzer-themes.md)
and [Stash review](STASH_RESEARCH.md). Visual design references also include
[VoxelWall](https://voxelwall.app/wallpapers) and [vizz.fm](https://vizz.fm/).

---

Developed by **Steve Harris** · [Instagram](https://www.instagram.com/ig.steve_edits)
