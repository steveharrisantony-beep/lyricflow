# Credits and acknowledgements

LyricFlow is built with open-source software and was informed by other music, visual-effects and lyric projects. Thanks to the maintainers, contributors and designers of the projects below.

**Categories matter:** **Direct dependencies** are installed by the project or bundled into its Android/Web builds. **Optional tooling** appears in the separately maintained Python developer service. **References and inspiration** were studied to inform LyricFlow's implementation; listing them does **not** mean their source code, shaders, media or assets were copied into LyricFlow.

## 1. Directly used software

| Repository | Used for |
| --- | --- |
| [React](https://github.com/facebook/react) | User interface and components (including React DOM) |
| [TypeScript](https://github.com/microsoft/TypeScript) | Type checking and typed application code |
| [Vite](https://github.com/vitejs/vite) | Web development server and production builds; includes the React plugin |
| [Capacitor](https://github.com/ionic-team/capacitor) | Android WebView application and native bridge |
| [Capawesome Capacitor Plugins](https://github.com/capawesome-team/capacitor-plugins) | Embedded Android Node.js backend via `@capawesome/capacitor-nodejs` |
| [Node.js](https://github.com/nodejs/node) | JavaScript server runtime, including the mobile runtime embedded by the Capacitor plugin |
| [Express](https://github.com/expressjs/express) | Local music, lyric and video HTTP API |
| [hls.js](https://github.com/video-dev/hls.js) | HTTP Live Streaming playback |
| [Lucide](https://github.com/lucide-icons/lucide) | Interface icons via `lucide-react` |
| [Fontsource](https://github.com/fontsource/fontsource) | Bundled local webfont packages |
| [Vitest](https://github.com/vitest-dev/vitest) | Unit and integration tests |
| [Playwright](https://github.com/microsoft/playwright) | Browser smoke and interface tests |
| [jsdom](https://github.com/jsdom/jsdom) | Browser-like test environment |
| [esbuild](https://github.com/evanw/esbuild) | Backend packaging/build tooling |
| [tsx](https://github.com/privatenumber/tsx) | TypeScript server execution during development |

The Fontsource dependencies include **Anton, Black Ops One, Bricolage Grotesque, Chakra Petch, Fraunces, Noto Sans Devanagari, Noto Sans Malayalam, Noto Sans Tamil, Orbitron, Press Start 2P, Righteous, Space Grotesk, Space Mono, Syne and Unbounded**. Their original typeface authors and individual font licenses should be credited and respected as provided by the font packages.

The Android build also uses the **Android SDK and AndroidX** dependencies declared in its Gradle files; see the [AndroidX project](https://android.googlesource.com/platform/frameworks/support/) for their source.

## 2. Optional Python developer resolver

The `server/requirements.txt` file defines a separate Python-based resolver. It is **not required to use the bundled Android Node.js backend**.

| Repository | Role |
| --- | --- |
| [FastAPI](https://github.com/fastapi/fastapi) | Python HTTP API |
| [Uvicorn](https://github.com/encode/uvicorn) | Python ASGI server |
| [HTTPX](https://github.com/encode/httpx) | HTTP requests |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Optional media metadata and resolution |
| [ytmusicapi](https://github.com/sigma67/ytmusicapi) | Optional YouTube Music catalog metadata |

## 3. Music discovery, lyric search and subtitle references

| Repository | Influence or integration |
| --- | --- |
| [Stash](https://github.com/rawnaldclark/Stash) | Music source adapters, lyric-provider ordering, metadata matching and recovery patterns. Parts of the app's matching logic are described in source comments as adapted or ported from Stash. |
| [ytmusicapi](https://github.com/sigma67/ytmusicapi) | YouTube Music search shapes and metadata parsing reference; also an optional Python dependency above |
| [youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api) | YouTube subtitle retrieval approaches; not installed as a Python runtime dependency in the Android APK |
| [SponsorBlockServer](https://github.com/ajayyy/SponsorBlockServer) | SponsorBlock segment-service reference and supported API behavior |
| [Piped](https://github.com/TeamPiped/Piped) | Compatible public video-search mirror API fallback |
| [Invidious](https://github.com/iv-org/invidious) | Compatible public video-search mirror API fallback |

LyricFlow contacts third-party music and lyric providers such as **YouTube, YouTube Music, JioSaavn, LRCLIB, lrc.red, Binimum, Paxsenix, Apple/iTunes metadata and SponsorBlock** when the relevant online features are enabled. These are **external services**, not repositories vendored into this project. Service availability, API rules and usage rights belong to their operators.

## 4. Lyric animation and motion-graphics references

| Repository | Techniques studied |
| --- | --- |
| [Codrops LetterEffects](https://github.com/Codrops/LetterEffects) | Character-by-character entrances, exits, masks and transitions |
| [Anime.js](https://github.com/juliangarnier/anime) | Staggered timing, easing and split-text motion patterns |
| [Splitting](https://github.com/shshaw/Splitting) | Character grouping, text segmentation and stable text timing |
| [baseline](https://github.com/Tunai-0511/baseline) | Lyric-directed musical storytelling and synchronized choreography |
| [pdoom-video](https://github.com/mexicat/pdoom-video) | Instrument-aware motion and graphic composition |

Further detail on these references: [Lyric animation references](docs/lyric-animation-references.md), [Baseline review](BASELINE_REVIEW.md) and [Motion-graphics reference review](REFERENCE_REVIEW.md).

## 5. Audio analysis and reactive theme references

| Repository | Techniques studied |
| --- | --- |
| [audioMotion-analyzer](https://github.com/hvianna/audioMotion-analyzer) | Frequency-band analysis, radial spectra, peak behavior and smoothing |
| [CAVA](https://github.com/karlstav/cava) | Spectrum bars, peak caps and waterfall history |
| [WebAudioSpectrum](https://github.com/deftio/WebAudioSpectrum) | Filled spectrum curves and time-frequency displays |
| [audio-analyzer](https://github.com/fagci/audio-analyzer) | Canvas spectrum and waterfall rasterization |
| [Butterchurn](https://github.com/jberg/butterchurn) | Bass/mids/treble envelopes and music-reactive motion |
| [Party Mode](https://github.com/preziotte/party-mode) | Distinct visual geometries driven by the same audio signal |
| [Visual Audio](https://github.com/josephyu12/visual-audio) | Particle systems, bounded geometry pools and reactive visual design |
| [Void Visualizer](https://github.com/TheOmegaFett/void-visualizer) | Flow-field composition and layered visual motion |

The built-in LyricFlow Canvas scenes and effects are separate implementations, rather than installed versions of these reference projects. See [Spectrum analyzer research](docs/spectrum-analyzer-themes.md) and [Theme visualizer research](docs/theme-visualizer-research.md).

Visual-style reference websites also include [VoxelWall](https://voxelwall.app/wallpapers) and [vizz.fm](https://vizz.fm/). They are acknowledged as *visual references*, not software dependencies.

---

This document identifies the **direct dependencies and named repositories found in the current project's dependency declarations, source comments and reference documents**, rather than every transitive npm, Python or Android dependency. For exact installed package versions and their license information, consult `package-lock.json`, `server/requirements.txt`, Android Gradle dependencies and the license files distributed with those packages.

Project author: **Steve Harris**.
