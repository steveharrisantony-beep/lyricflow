# LyricFlow — VoxelWall Music-Reactive Soundstage & VoxelVerse Animated Lyrics

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/Tunai-0511/lyricflow?file=README.md)
[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/Tunai-0511/lyricflow?quickstart=1)

**LyricFlow** is a studio-grade, real-time audio-reactive music visualizer and synchronized kinetic lyric stage. It combines **23 genuinely distinct VoxelWall-inspired 2D music-reactive live wallpapers** (each equipped with **4–5 selectable colour palettes**) across seven curated visual families with **19 VoxelVerse animated lyric choreography styles**, **Stash multi-catalog online streaming**, **Apple Music syllable/word-synced TTML & line-synced LRC engines**, **offline Indic-to-Latin phonetic romanization**, and **Firebase Authentication & Cloud Firestore profile synchronization**.

> **Maintenance Policy:** This `README.md` is the canonical technical reference for LyricFlow and is continuously updated alongside every architectural, visual, audio, and lyric-engine update.

---

## Table of Contents

1. [Core Features & Capabilities](#1-core-features--capabilities)
2. [VoxelWall Music-Reactive Live Wallpapers (23 Unique Designs × Multi-Palette)](#2-voxelwall-music-reactive-live-wallpapers-23-unique-designs--multi-palette)
3. [VoxelVerse Animated Lyric Styles (19 Choreography Modes)](#3-voxelverse-animated-lyric-styles-19-choreography-modes)
4. [Audio Reactivity & 64-Band Spectral Pipeline](#4-audio-reactivity--64-band-spectral-pipeline)
5. [Audio Sources & Stash Multi-Catalog Streaming](#5-audio-sources--stash-multi-catalog-streaming)
6. [Synchronized Lyrics Engine & Provider Attribution](#6-synchronized-lyrics-engine--provider-attribution)
7. [Romanization & Multi-Script Support](#7-romanization--multi-script-support)
8. [Camera Views, Shake Controls, Cinema Studio Drawer & Contrast Engine](#8-camera-views-shake-controls-cinema-studio-drawer--contrast-engine)
9. [Cloud Sync, Authentication & Security Architecture](#9-cloud-sync-authentication--security-architecture)
10. [Project Structure](#10-project-structure)
11. [Getting Started & Commands](#11-getting-started--commands)
12. [Reference Links & Technical Inspirations](#12-reference-links--technical-inspirations)

---

## 1. Core Features & Capabilities

- **23 Unique VoxelWall 2D Music-Reactive Backgrounds with Multi-Palette Selector (`https://voxelwall.app/wallpapers`)**:
  - Pure, high-FPS 2D procedural canvas and spectral-geometry wallpapers organized into **7 VoxelWall categories**: *Flow*, *Contours*, *Sculptures*, *Space*, *Nature*, *Architecture*, and *Journeys*.
  - Every theme uses a 100% distinct procedural visual algorithm—all color-swap duplicate themes have been consolidated into **4–5 interactive Colour Palettes per theme** (`ThemePalette`) selectable directly on each theme card and inside Cinema Mode.
  - Every background can be individually toggled **ON/OFF** to curate the active auto-director rotation pool.
- **19 VoxelVerse Lyric Animation Styles (`https://voxelwall.app/verse#verse-styles`)**:
  - Full support for all **19 VoxelVerse text styles** organized into four families: **Signature** (*Ship, Fisheye, Visual, Fisheye Visual*), **Spatial** (*Orbit, Cascade, Prism, Scatter*), **Kinetic** (*Surge, Elastic, Echo, Halo*), and **Editorial** (*Reel, Hinge, Fable, Carnival, Broadside, Portal, Mosaic*).
  - Each style features dedicated 3D-projected plane orientation, spring physics, vector framing plates, semantic lyric emblems, and individual **ON/OFF** toggles.
- **Background-Adaptive Sequential Lyric Colour Engine**:
  - **Base Line Colour**: Every lyric line first renders in a single uniform, WCAG-verified base colour adapted to the active theme palette background (`baseColor`).
  - **Slow Songs (Letter-by-Letter Fill)**: When word-synced timing is available on slow-to-mid tempo songs, letters change colour **one by one (`letter` pace)** as each syllable/letter is sung (`sungColor`).
  - **Fast-Paced Songs (Word-by-Word Fill)**: When word-synced timing is available on fast songs (`BPM >= 122` or rapid word cadence), whole words change colour **one by one (`word` pace)** as each word is sung.
  - **Strict Line-Sync Integrity**: When only line-by-line sync (`timing !== 'sourced'`) is available, LyricFlow **never predicts or fakes word-by-word or letter-by-letter colour changes**—keeping the entire line in a single uniform colour with zero random word colour glitches.
  - **Zero Lyric Holding During Pause or Music Breaks**: Finished lyric lines clear naturally (`computeNaturalLineEnd`) during instrumental solos/interludes and immediately hide while playback is paused.
- **Transparent Provider & Audio Source Attribution**:
  - Displays live **Lyrics Provider** badges (*Apple Music Word-Synced TTML*, *MusixMatch*, *LRCLIB*, *KuGou*, *YouTube Music*, or *Local File*) and **Audio Source** badges (*JioSaavn 320kbps AAC*, *YouTube Music*, *SoundCloud*, *Audius*, or *Local Device File*) in both the header and lyric panel.
- **Configurable Min & Max Lyric Font Sizes (`16px–130px`)**:
  - Dedicated **Min Font Size (`16px–72px`)** and **Max Font Size (`32px–130px`)** sliders in both the Lyric Panel and Cinema Mode Studio Drawer clamp dynamic lyric scaling on both the 3D-projected kinetic canvas and the synchronized DOM lyric stage.
- **Balanced Multi-Line Lyric Wrapping**:
  - Long lyric phrases are automatically partitioned into balanced multi-line rows (`buildWordRows` on the canvas stage and `splitLyricIntoBalancedLines` / `splitWordsIntoBalancedRows` in the DOM lyric stage) so lyrics never clip or stretch into a single cramped line.
- **Romanized Lyrics Priority & 9-Script Indic Transliteration**:
  - Automatically extracts Apple Music `<span ttm:role="x-roman">` tracks and performs offline phonetic transliteration for **Devanagari (Hindi/Marathi/Sanskrit), Malayalam, Tamil, Telugu, Kannada, Bengali, Gujarati, Gurmukhi (Punjabi), and Odia**, preferring Romanized display whenever available.

---

## 2. VoxelWall Music-Reactive Live Wallpapers (23 Unique Designs × Multi-Palette)

Inspired by [VoxelWall Live Wallpapers](https://voxelwall.app/wallpapers), all 23 unique scenes react in real time to 64-band frequency energy, bass envelopes, midrange harmonics, treble shimmer, and beat/onset impulses, and each includes **4–5 curated Colour Palettes**:

| Category | Scene ID | Label | Palettes Included | Visual Grammar & Audio Reactivity |
| :--- | :--- | :--- | :--- | :--- |
| **Flow** | `holographic-tide` | **Holographic Tide** | *Prismatic Cyan, Liquid Filigree, Crimson Current, Silk Waves, Emerald Drift* | Iridescent multi-ribbon fluid tide waves driven by bass swells and midrange phase |
| **Flow** | `gilded-whirlpool` | **Gilded Whirlpool** | *Imperial Gold, Abyssal Cyan, Rose Vortex, Ultraviolet Spin* | Golden 6-arm logarithmic spiral vortex rotating with midrange and bass |
| **Flow** | `ribbon-dance` | **Ribbon Dance** | *Magenta Harmonics, Cyber Mint, Solar Ribbon, Ice Filament* | Parametric Lissajous infinity figure-8 weave with orbiting harmonic phase nodes |
| **Contours** | `chroma-moire-voids` | **Chroma Moire Voids** | *Violet Cyan Moire, Crimson Gold Moire, Emerald Indigo, Monochrome Pulse* | Dual-center chromatic interference moiré rings and phase voids |
| **Contours** | `cobalt-contours` | **Cobalt Contours** | *Deep Cobalt, Molten Magma, Layered Jade, Arctic Topo, Amber Terraces* | Multi-lobe topographic isolines and terraced frequency elevation ridges |
| **Contours** | `contour-flow` | **Contour Flow** | *Emerald Precision, Pulsar Cyan, Crimson Ridges, Golden Horizon* | Stepped Joy Division-style pulsar horizon ridgelines stacked in depth |
| **Sculptures** | `crystal-resonance` | **Crystal Resonance** | *Quartz Prism, Pearl Nacre, Ruby Facet, Emerald Shard* | 12-shard faceted geometric crystal prisms refracting bass and beat impulses |
| **Sculptures** | `tidal-bloom` | **Tidal Bloom** | *Coral Rose, Pearl Bloom, Lotus Cyan, Golden Sunburst* | 14-petal radial acoustic bloom expanding with bass and treble |
| **Sculptures** | `paper-cut` | **Paper Cut** | *Warm Terracotta, Midnight Slate, Matcha Forest, Berry Canyon* | Multi-layered brutalist paper diorama canyon with floating geometric slabs |
| **Space** | `celestial-orbit` | **Celestial Orbit** | *Solar Astrolabe, Orbital Score,Deep Nebula, Brass Orrery* | 8-ring planetary astrolabe with degree calibration ticks and vector chords |
| **Space** | `orbital-halo` | **Orbital Halo** | *Eclipse Cyan, Solar Corona, Magenta Pulsar, Emerald Ring* | 64-ray luminous eclipse corona and radial frequency halo |
| **Space** | `infinite-tunnel` | **Infinite Tunnel** | *Ultraviolet Warp, Cyber Matrix, Crimson Hyperdrive, Golden Gates* | 16-layer rotating sacred-geometry portal rushing forward on bass hits |
| **Space** | `star-map` | **Star Map** | *Astrometric Blue, Emerald Cartography, Amber Observatory, Violet Sky* | 60-node astrometric triangulation network and polar coordinate reticle |
| **Nature** | `aurora-field` | **Aurora Field** | *Polar Borealis, Solar Storm, Geomagnetic Violet, Arctic Blue* | 7-layer shimmering geomagnetic aurora borealis curtains |
| **Nature** | `glow-lagoon` | **Glow Lagoon** | *Bioluminescent Teal, Ocean Pulse, Coral Reef, Midnight Plankton* | Nocturnal bioluminescent lagoon ripples and harmonic spore field |
| **Nature** | `pixel-garden` | **Pixel Garden** | *Neon Flora, Cherry Blossom, Cyber Bamboo, Golden Harvest* | 28-column cyber-botanical voxel equalizer with blooming frequency caps |
| **Architecture** | `signal-chamber` | **Signal Chamber** | *Emerald Analyzer, Cyan Broadcast, Crimson Mastering, Amber Console* | 64-band spectral sculpture with mirrored reflection floor and upper contour spline |
| **Architecture** | `neon-metal-matrix` | **Neon Metal Matrix** | *Titanium Cyan, Copper Forge, Matrix Emerald, Crimson Core* | 18×10 cybernetic grid matrix with frequency-modulated cells |
| **Architecture** | `bauhaus-beat` | **Bauhaus Beat** | *Weimar Primary, Midcentury Warm, Nordic Minimal, Brutalist Red* | Constructivist architectural poster with 16-bar rhythmic step ladder |
| **Architecture** | `halftone-club` | **Halftone Club** | *Club Magenta, Acid Lime, Laser Cyan, Sunset Strobe* | 26×16 radial frequency-modulated halftone matrix and club aperture rings |
| **Journeys** | `chromatic-drive` | **Chromatic Drive** | *Outrun Sunset, White Velocity, Nightrunner Cyan, Blood Moon Drive* | Synth-horizon perspective speed lanes and pulsing solar aperture |
| **Journeys** | `origami-flight` | **Origami Flight** | *Sky Crane, Sunset Flock, Starlight Fold, Emerald Wind* | 14-wing folded geometric paper flock soaring across harmonic wind currents |
| **Journeys** | `color-riot` | **Color Riot** | *Constructivist Riot, Cyber Punk, Acid Bauhaus, Monochrome Ink* | Constructivist kinetic geometry poster with 64-band hexagonal lattice and 3D hex stack |

---

## 3. VoxelVerse Animated Lyric Styles (19 Choreography Modes)

Inspired by [VoxelVerse (`#verse-styles`)](https://voxelwall.app/verse#verse-styles), LyricFlow implements 19 distinct lyric animation styles across four families:

| Family | Style ID | Name | Choreography & Visual Detail |
| :--- | :--- | :--- | :--- |
| **Signature** | `ship` | **Ship** | 3D Z-axis camera propulsion with word-by-word depth impulse |
| **Signature** | `fisheye` | **Fisheye** | Spherical barrel-lens magnification bulging centered words forward |
| **Signature** | `visual` | **Visual** | Gentle harmonic wave paired with semantic lyric emblems & star icons |
| **Signature** | `fisheye-visual` | **Fisheye Visual** | Spherical fisheye lens curvature combined with lyric icon emblems |
| **Spatial** | `orbit` | **Orbit** | Tilted orbital plane with oversized hero words and luminous ring halos |
| **Spatial** | `cascade` | **Cascade** | Stepped multi-row diagonal waterfall with sculpted 3D depth |
| **Spatial** | `prism` | **Prism** | Chromatic multi-layer dimensional offset frames and shear |
| **Spatial** | `scatter` | **Scatter** | Asymmetric word clusters with playful alternating shear angles |
| **Kinetic** | `surge` | **Surge** | Rising fluid word wave with cresting vertical momentum |
| **Kinetic** | `elastic` | **Elastic** | Critically-damped spring stretch and settle with bold emphasis |
| **Kinetic** | `echo` | **Echo** | Receding twin contour echo frames layered behind active words |
| **Kinetic** | `halo` | **Halo** | Expanding luminous concentric rings around each active word |
| **Editorial** | `reel` | **Reel** | Rolling vertical tape-reel column motion with pitch rotation |
| **Editorial** | `hinge` | **Hinge** | Folded architectural word walls with turning perspective planes |
| **Editorial** | `fable` | **Fable** | Storybook painted words with expressive ornamental corner emblems |
| **Editorial** | `carnival` | **Carnival** | High-impact kinetic slam with 4-point star-sticker collage accents |
| **Editorial** | `broadside` | **Broadside** | Tracking editorial typography framed in angled paper-ticket plates |
| **Editorial** | `portal` | **Portal** | Folding aperture windows and rounded lyric capsules around active words |
| **Editorial** | `mosaic` | **Mosaic** | Curved typographic arc framed inside modular moving lyric grid cells |

---

## 4. Audio Reactivity & 64-Band Spectral Pipeline

- **64-Band Log-Scaled Frequency Analyzer (`src/audio/audioSignal.ts`)**:
  - Maps 32 Hz – 14 kHz into 64 logarithmically spaced musical bands with independent **Spectrum Gain** control and a quiet-room noise gate (`spectrumResponse`).
- **Spectral-Flux Beat & Tempo Detector (`src/audio/beatDetector.ts`)**:
  - Computes real-time spectral flux, adaptive onset thresholds, tempo estimation (BPM), tempo confidence, and downbeat phase without false triggers during silence.
- **Instrument-Role Separation (`src/visualization/cinematic/procedural/audioMotion.ts` & `src/audio/bandEnvelope.ts`)**:
  - Separates **Bass** (20–250 Hz), **Midrange** (250–2000 Hz), **Treble** (2–14 kHz), and **Beat/Onset** envelopes with adaptive headroom preservation (`BandEnvelope`) so new hits punch through even during loud sustained passages.

---

## 5. Audio & Video Sources (JioSaavn, YouTube Video Stage & Local Upload)

Accessible anytime from the stage bar (**Choose Source**) with a dedicated modal close button (`×` header button, `Close Window` footer button, `Escape` key, or backdrop click):

1. **Built-in Online Player (`src/music/providers.ts` & `src/music/SongSearch.tsx`)**:
   - **JioSaavn Direct Catalog**: Instant search and direct 320kbps/160kbps MP4/AAC full-song streaming.
   - **YouTube Video + Lyrics Stage**:
     - Plays the exact selected YouTube video (`format: 'youtube'`) directly as a **live video background** on the visualizer stage with its own synchronized audio and the **VoxelVerse Lyrics Engine overlaid on top** (never substituting an unrelated audio stream from other catalogs).
     - Uses YouTube's IFrame `listening` / `infoDelivery` `postMessage` protocol (`CinematicStage.tsx` & `LocalPlayer.tsx`) to synchronize play/pause, seek, volume, and real-time `currentTime`/`duration` with the VoxelVerse lyrics clock.
     - Includes an interactive **Background Option Slider** (`0: YouTube Video` · `1: Built-in Themes`) allowing instant switching between the YouTube video background and the 23 built-in VoxelWall themes.
     - Includes an **Auto-Hide Lyrics Engine on Lyric Videos** toggle (`autoHideYoutubeLyrics`) that automatically searches the currently playing video metadata for terms like `lyrical`, `lyrics`, and `lyric video` (`isLyricVideoTrack`) and hides the stage lyrics engine when the video already contains embedded lyrics.
2. **Local Audio Upload (`src/audio/LocalPlayer.tsx`)**:
   - Supports `.mp3`, `.wav`, `.flac`, `.m4a`, `.ogg`, and `.aac` files decoded locally in the browser via the Web Audio API.

---

## 6. Synchronized Lyrics Engine & Provider Attribution

When a song loads, `TrackFinder` (`src/metadata/TrackFinder.tsx`) and `providers.ts` (`src/lyrics/providers.ts`) automatically query a multi-tier cascade:

1. **Apple Music Syllable/Word-Synced TTML (`src/lyrics/appleLyrics.ts`)**:
   - Queries Apple Music / iTunes catalog IDs and converts TTML (`<p begin="..." end="...">`, `<span begin="..." end="...">`, `<span ttm:role="x-bg">`, and `<span ttm:role="x-roman">`) or structured syllable JSON into enhanced LRC (`[mm:ss.xx]<mm:ss.xx>Word`).
   - Automatically glues adjacent multi-syllable spans without trailing whitespace into unified words while preserving syllable timing.
2. **MusixMatch RichSync & Line-Synced LRC**:
   - Word-level RichSync and line-synced LRC fallback via the `/api/lyrics/apple` server proxy.
3. **LRCLIB Exact & Search Matching**:
   - Strict duration-validated (`±2.5s`) recording match against `lrclib.net/api/get` and `/api/search`.
4. **KuGou & YouTube Music Transcript Fallback**:
   - Line-synced LRC decoding from KuGou and timed transcript extraction from YouTube Music.
5. **Local `.lrc`, `.ttml`, `.xml`, and `.txt` Import**:
   - Import custom lyric files or edit timestamps on-demand with per-song delay adjustments (`-30s` to `+30s`).

---

## 7. Romanization & Multi-Script Support

- **Offline Indic Phonetic Transliteration (`src/romanization/romanize.ts`)**:
  - Supports **Devanagari (Hindi / Marathi / Sanskrit)**, **Malayalam**, **Tamil**, **Telugu**, **Kannada**, **Bengali**, **Gujarati**, **Gurmukhi (Punjabi)**, and **Odia** with vowel-sign (matra) composition, virama consonant cluster handling, anusvara/chandrabindu nasalization, and inherent schwa rules.
- **Apple Music Native Romanization**:
  - Automatically extracts `<span ttm:role="x-roman">` from Apple Music TTML payloads when available.
- **Romanized-First Display**:
  - Defaults to preferring Romanized lyrics on both the primary kinetic canvas and the interactive lyric panel whenever non-Latin scripts are detected.

---

## 8. Camera Views, Smooth Bass Shake, Clean Stage & Contrast Engine

- **Centered Front Camera View & Smooth Bass-Threshold Camera Shake (`src/visualization/cinematic/cameraRig.ts`)**:
  - Uses a dedicated, distraction-free **Front** camera view (`CAMERA_VIEWS = ['Front']`) that keeps the stage and lyrics centered.
  - **Smooth Bass-Driven Shake (`computeBassThreshold`)**: Camera shake is driven strictly by low-end **bass (`p.bass`)**. The **Shake Sensitivity (`0%–100%`)** slider controls the **bass threshold** required to trigger a camera shake (higher sensitivity lowers the bass threshold so moderate bass lines trigger smooth movement; lower sensitivity raises the threshold so only heavy sub-bass drops trigger shake).
  - Uses critically-damped exponential attack/release smoothing and low-frequency harmonic curves for a fluid, cinematic camera sway without high-frequency jitter.
- **Clean Uncluttered Stage Corners (`MotionGraphics.ts` & `GraphicCompositions.ts`)**:
  - All 23 VoxelWall themes render edge-to-edge without corner VU meter overlays, keeping the top-left and bottom-right stage corners completely clean.
- **Full-Featured Cinema Mode Studio Drawer**:
  - Clicking **Controls** inside Cinema Mode opens a studio control window (`All`, `Themes`, `Lyrics`, `Camera`, `Engine`) with full control over YouTube video vs. built-in theme backgrounds, auto-hiding lyrics on lyric videos, themes, palettes, VoxelVerse styles, **Lyric Min/Max Font Sizes**, bass shake threshold sensitivity, and audio engine parameters without exiting full-bleed Cinema Mode.
- **WCAG AA Contrast Enforcement (`src/visualization/cinematic/contrast.ts` & `typography.ts`)**:
  - Guarantees a minimum `4.5:1` contrast ratio for all foreground and accent lyric inks (`readableInk` and `readableChromaticInk`) across every colour palette of all 23 VoxelWall themes.

---

## 9. Profile Persistence & Security Architecture

- **Instant Local Device Persistence (`src/firebase/firebaseClient.ts`)**:
  - Launches directly into the LyricFlow studio without login friction and automatically persists visual intensity, speed, audio sensitivity, spectrum gain, motion blur, quality preset, enabled VoxelWall themes (`1–23`), enabled VoxelVerse lyric styles (`1–19`), lyric min/max font sizes, bass camera shake preferences, and per-song lyric delays in `localStorage`.
- **Secret-Free GitHub Policy (`.gitignore` & `.env.example`)**:
  - No API keys or secrets are stored in tracked files (`firebase-applet-config.json` and `.env.local` are listed in `.gitignore`).
- **Hardened Firestore Security Rules (`firestore.rules`)**:
  - Default-deny catch-all, strict owner UID + `email_verified` enforcement, exact schema key whitelisting (`hasAll` / `hasOnly`), bounded list sizes, and immutable `uid`/`createdAt` invariants ready for future cloud sync.

---

## 10. Project Structure

```text
├── server.ts                                      # Express + Vite full-stack server (/api/music/* & /api/lyrics/*)
├── firestore.rules                                # Hardened Cloud Firestore security rules
├── firebase-blueprint.json                        # Firestore schema blueprint
├── src/
│   ├── App.tsx                                    # Main studio interface, VoxelWall & VoxelVerse controls
│   ├── audio/
│   │   ├── AudioSourceHub.tsx                     # Modal selector for Stash Online Player vs. Local Upload
│   │   ├── LocalPlayer.tsx                        # Playback transport, seek bar, & per-song delay controls
│   │   ├── audioSignal.ts                         # Web Audio graph & 64-band log-scaled analyzer
│   │   ├── bandEnvelope.ts                        # Adaptive attack/release envelope follower
│   │   └── beatDetector.ts                        # Spectral-flux onset, beat, & BPM tempo detector
│   ├── lyrics/
│   │   ├── ManualLyrics.tsx                       # Synchronized lyric stage, provider badges, & color picker
│   │   ├── appleLyrics.ts                         # Apple Music TTML & syllable JSON -> Enhanced LRC parser
│   │   ├── lrc.ts                                 # Line-synced & word-synced (<mm:ss.xx>) LRC parser
│   │   ├── lyricTimeline.ts                       # Playback cue scheduler & natural line-end calculator
│   │   ├── providers.ts                           # Multi-provider lyric cascade (Apple/MusixMatch/LRCLIB)
│   │   └── sceneDirector.ts                       # Semantic lyric mood & energy analyzer
│   ├── metadata/
│   │   ├── TrackFinder.tsx                        # Automatic track & lyric resolver
│   │   └── trackInfo.ts                           # Filename & recording metadata normalizer
│   ├── music/
│   │   └── providers.ts                           # Stash multi-catalog search & stream resolver
│   ├── romanization/
│   │   └── romanize.ts                            # 9-script offline Indic-to-Latin transliterator
│   ├── visualization/cinematic/
│   │   ├── CinematicStage.tsx                     # Dual-canvas compositor & Cinema Mode Studio Drawer
│   │   ├── catalog.ts                             # 23 VoxelWall scene templates × 4–5 palettes across 7 categories
│   │   ├── kineticTypography.ts                   # 19 VoxelVerse styles & sequential letter/word colour fill
│   │   ├── cameraRig.ts                           # Beat-reactive 3D projection rig with shake toggle & sensitivity
│   │   ├── contrast.ts                            # Real-time backdrop luminance sampler & WCAG contrast guard
│   │   ├── fonts.ts                               # 25 curated display, editorial, & monospace font packs
│   │   └── procedural/
│   │       ├── MotionGraphics.ts                  # 21 distinct VoxelWall 2D music-reactive wallpaper painters
│   │       ├── GraphicCompositions.ts             # 64-band Signal Chamber spectrum & Color Riot hex geometry
│   │       └── audioMotion.ts                     # Instrument-role channel routing
│   └── tests/                                     # 10 Vitest test suites covering audio, lyrics, & visuals
```

---

## 11. Getting Started & Commands

### Prerequisites
- **Node.js** 20+ and **npm**

### Installation & Development
```bash
# Install dependencies
npm install

# Start the full-stack Express + Vite development server on port 3000
npm run dev
```

### Verification & Production Build
```bash
# Run the complete Vitest unit & integration test suite
npx vitest run

# Type-check and build the production bundle
npm run build
```

---

## 12. Reference Links & Technical Inspirations

### Visual & Typographic References
- **VoxelWall — Music-Reactive Live Wallpapers (Flow, Contours, Sculptures, Space, Nature, Architecture, Journeys)**:  
  [https://voxelwall.app/wallpapers](https://voxelwall.app/wallpapers)
- **VoxelVerse — 19 Animated Desktop Lyric Styles (Signature, Spatial, Kinetic, Editorial)**:  
  [https://voxelwall.app/verse#verse-styles](https://voxelwall.app/verse#verse-styles)
- **VoxelWall Engine Architecture Overview**:  
  [https://voxelwall.app/engine](https://voxelwall.app/engine)
- **Baseline Audio-Reactive Visualizer (`Tunai-0511/baseline`)**:  
  [https://github.com/Tunai-0511/baseline](https://github.com/Tunai-0511/baseline) · Local architecture review: [`BASELINE_REVIEW.md`](./BASELINE_REVIEW.md)
- **p(doom) Procedural Audio-Visual System (`mexicat/pdoom-video`)**:  
  [https://github.com/mexicat/pdoom-video](https://github.com/mexicat/pdoom-video) · Local reference review: [`REFERENCE_REVIEW.md`](./REFERENCE_REVIEW.md)

### Streaming & Lyric Synchronization References
- **Stash Audio & Apple Music TTML Architecture (`STASH_RESEARCH.md`)**:  
  Local research notes: [`STASH_RESEARCH.md`](./STASH_RESEARCH.md)
- **LRCLIB Synchronized Lyrics API**:  
  [https://lrclib.net/docs](https://lrclib.net/docs)
- **Apple Timed Text Markup Language (TTML) Specification**:  
  [https://www.w3.org/TR/ttml2/](https://www.w3.org/TR/ttml2/)
- **MDN Web Audio API (`AnalyserNode` & Real-Time Frequency Analysis)**:  
  [https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- **Cloud Firestore Security Rules Documentation**:  
  [https://firebase.google.com/docs/firestore/security/get-started](https://firebase.google.com/docs/firestore/security/get-started)
