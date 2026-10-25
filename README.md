# LyricFlow — VoxelWall Music-Reactive Soundstage & VoxelVerse Animated Lyrics

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/Tunai-0511/lyricflow?file=README.md)
[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/Tunai-0511/lyricflow?quickstart=1)

**LyricFlow** is a studio-grade, real-time audio-reactive music visualizer and synchronized kinetic lyric stage. It combines **32 VoxelWall-inspired 2D music-reactive live wallpapers** across seven curated visual families with **19 VoxelVerse animated lyric choreography styles**, **Stash multi-catalog online streaming**, **Apple Music syllable/word-synced TTML & line-synced LRC engines**, **offline Indic-to-Latin phonetic romanization**, and **Firebase Authentication & Cloud Firestore profile synchronization**.

> **Maintenance Policy:** This `README.md` is the canonical technical reference for LyricFlow and is continuously updated alongside every architectural, visual, audio, and lyric-engine update.

---

## Table of Contents

1. [Core Features & Capabilities](#1-core-features--capabilities)
2. [VoxelWall Music-Reactive Live Wallpapers (32 Scenes)](#2-voxelwall-music-reactive-live-wallpapers-32-scenes)
3. [VoxelVerse Animated Lyric Styles (19 Choreography Modes)](#3-voxelverse-animated-lyric-styles-19-choreography-modes)
4. [Audio Reactivity & 64-Band Spectral Pipeline](#4-audio-reactivity--64-band-spectral-pipeline)
5. [Audio Sources & Stash Multi-Catalog Streaming](#5-audio-sources--stash-multi-catalog-streaming)
6. [Synchronized Lyrics Engine & Provider Attribution](#6-synchronized-lyrics-engine--provider-attribution)
7. [Romanization & Multi-Script Support](#7-romanization--multi-script-support)
8. [Camera Views, Stage Framing & Contrast Engine](#8-camera-views-stage-framing--contrast-engine)
9. [Cloud Sync, Authentication & Security Architecture](#9-cloud-sync-authentication--security-architecture)
10. [Project Structure](#10-project-structure)
11. [Getting Started & Commands](#11-getting-started--commands)
12. [Reference Links & Technical Inspirations](#12-reference-links--technical-inspirations)

---

## 1. Core Features & Capabilities

- **32 VoxelWall 2D Music-Reactive Backgrounds (`https://voxelwall.app/wallpapers`)**:
  - Pure, high-FPS 2D procedural canvas and spectral-geometry wallpapers organized into **7 VoxelWall categories**: *Flow*, *Contours*, *Sculptures*, *Space*, *Nature*, *Architecture*, and *Journeys*.
  - All legacy 3D WebGL themes, *Crimson Impact*, and *Vinyl Groove* have been permanently removed in favor of crisp, zero-bloat 2D music-reactive compositions.
  - Every background can be individually toggled **ON/OFF** to curate the active auto-director rotation pool.
- **19 VoxelVerse Lyric Animation Styles (`https://voxelwall.app/verse#verse-styles`)**:
  - Full support for all **19 VoxelVerse text styles** organized into four families: **Signature** (*Ship, Fisheye, Visual, Fisheye Visual*), **Spatial** (*Orbit, Cascade, Prism, Scatter*), **Kinetic** (*Surge, Elastic, Echo, Halo*), and **Editorial** (*Reel, Hinge, Fable, Carnival, Broadside, Portal, Mosaic*).
  - Each style features dedicated 3D-projected plane orientation, spring physics, vector framing plates, semantic lyric emblems, and individual **ON/OFF** toggles.
- **Transparent Provider & Audio Source Attribution**:
  - Displays live **Lyrics Provider** badges (*Apple Music Word-Synced TTML*, *MusixMatch*, *LRCLIB*, *KuGou*, *YouTube Music*, or *Local File*) and **Audio Source** badges (*JioSaavn 320kbps AAC*, *YouTube Music*, *SoundCloud*, *Audius*, or *Local Device File*) in both the header and lyric panel.
- **Honest Word-Sync vs. Line-Sync Rendering**:
  - When **word-synced TTML / enhanced LRC** (`<mm:ss.xx>`) timestamps are present, LyricFlow renders smooth syllable/word karaoke sweeps and per-word kinetic impulses.
  - When only **line-synced LRC** (`[mm:ss.xx]`) is available, LyricFlow **never fabricates or predicts fake word-by-word timing**—instead rendering clean, line-level synchronized typography.
- **Balanced Multi-Line Lyric Wrapping**:
  - Long lyric phrases are automatically partitioned into balanced multi-line rows (`buildWordRows` on the canvas stage and `splitLyricIntoBalancedLines` / `splitWordsIntoBalancedRows` in the DOM lyric stage) so lyrics never clip or stretch into a single cramped line.
- **Romanized Lyrics Priority & 9-Script Indic Transliteration**:
  - Automatically extracts Apple Music `<span ttm:role="x-roman">` tracks and performs offline phonetic transliteration for **Devanagari (Hindi/Marathi/Sanskrit), Malayalam, Tamil, Telugu, Kannada, Bengali, Gujarati, Gurmukhi (Punjabi), and Odia**, preferring Romanized display whenever available.
- **Dynamic Main Lyric Color Engine**:
  - Real-time main lyric text color shifting across phrases with WCAG AA contrast clamping (`readableChromaticInk`), plus manual color presets (*Auto Scene & Line Shift, Cyan Glow, Neon Rose, Solar Gold, Emerald Pulse, Electric Violet, Warm Coral, Classic White*).

---

## 2. VoxelWall Music-Reactive Live Wallpapers (32 Scenes)

Inspired by [VoxelWall Live Wallpapers](https://voxelwall.app/wallpapers), all 32 scenes react in real time to 64-band frequency energy, bass envelopes, midrange harmonics, treble shimmer, and beat/onset impulses:

| Category | Scene ID | Label | Visual Grammar & Audio Reactivity |
| :--- | :--- | :--- | :--- |
| **Flow** | `holographic-tide` | **Holographic Tide** | Iridescent multi-ribbon fluid tide waves driven by bass swells and midrange phase |
| **Flow** | `liquid-filigree` | **Liquid Filigree** | Delicate filigree harmonic streams with golden-cyan crest nodes on beats |
| **Flow** | `crimson-current` | **Crimson Current** | Deep velvet-crimson fluid currents and harmonic eddies |
| **Flow** | `gilded-whirlpool` | **Gilded Whirlpool** | Golden 6-arm logarithmic spiral vortex rotating with midrange and bass |
| **Flow** | `silk-waves` | **Silk Waves** | Wide translucent silk ribbon waves with harmonic crest nodes |
| **Flow** | `ribbon-dance` | **Ribbon Dance** | Luminous phase-shifted vector ribbons undulating across the stage |
| **Contours** | `chroma-moire-voids` | **Chroma Moire Voids** | Dual-center chromatic interference moiré rings and phase voids |
| **Contours** | `cobalt-contours` | **Cobalt Contours** | Deep cobalt 4-lobe elevation isolines and terraced frequency ridges |
| **Contours** | `molten-contours` | **Molten Contours** | Glowing magma 24-ring topographic isolines and bass-driven strata |
| **Contours** | `layered-contours` | **Layered Contours** | Stepped 5-lobe botanical topographic contour elevation fields |
| **Contours** | `contour-flow` | **Contour Flow** | Multi-harmonic topographic isoline field with precision plotter hairlines |
| **Sculptures** | `crystal-resonance` | **Crystal Resonance** | 12-shard faceted geometric crystal prisms refracting bass and beat impulses |
| **Sculptures** | `pearl-resonance` | **Pearl Resonance** | Nacreous concentric acoustic petal spheres and harmonic ripples |
| **Sculptures** | `tidal-bloom` | **Tidal Bloom** | 14-petal radial acoustic bloom expanding with bass and treble |
| **Sculptures** | `paper-cut` | **Paper Cut** | Multi-layered brutalist paper diorama canyon with floating geometric slabs |
| **Space** | `celestial-orbit` | **Celestial Orbit** | 8-ring planetary astrolabe with degree calibration ticks and vector chords |
| **Space** | `orbital-halo` | **Orbital Halo** | 64-ray luminous eclipse corona and radial frequency halo |
| **Space** | `infinite-tunnel` | **Infinite Tunnel** | 16-layer rotating sacred-geometry portal rushing forward on bass hits |
| **Space** | `orbital-score` | **Orbital Score** | Spacetime gyroscope with orbiting harmonic satellites |
| **Space** | `star-map` | **Star Map** | 60-node astrometric triangulation network and polar coordinate reticle |
| **Nature** | `aurora-field` | **Aurora Field** | 7-layer shimmering geomagnetic aurora borealis curtains |
| **Nature** | `silver-current` | **Ocean Pulse** | Silver-cyan bioluminescent ocean swell and floating light spores |
| **Nature** | `glow-lagoon` | **Glow Lagoon** | Nocturnal bioluminescent lagoon ripples and harmonic spore field |
| **Nature** | `pixel-garden` | **Pixel Garden** | 28-column cyber-botanical voxel equalizer with blooming frequency caps |
| **Architecture** | `signal-chamber` | **Signal Chamber** | 64-band spectral sculpture with mirrored reflection floor and upper contour spline |
| **Architecture** | `neon-metal-matrix` | **Neon Metal Matrix** | 18×10 cybernetic grid matrix with frequency-modulated cells |
| **Architecture** | `bauhaus-beat` | **Bauhaus Beat** | Constructivist architectural poster with 16-bar rhythmic step ladder |
| **Architecture** | `halftone-club` | **Halftone Club** | 26×16 radial frequency-modulated halftone matrix and club aperture rings |
| **Journeys** | `chromatic-drive` | **Chromatic Drive** | Synth-horizon perspective speed lanes and pulsing solar aperture |
| **Journeys** | `origami-flight` | **Origami Flight** | 14-wing folded geometric paper flock soaring across harmonic wind currents |
| **Journeys** | `white-velocity` | **White Velocity** | High-contrast daylight vector slipstream and perspective horizon grid |
| **Journeys** | `color-riot` | **Color Riot** | Constructivist kinetic geometry poster with 64-band hexagonal lattice and 3D hex stack |

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

## 5. Audio Sources & Stash Multi-Catalog Streaming

Accessible anytime from the stage bar (**Choose Audio Source**) with a dedicated modal close button (`×` header button, `Close Window` footer button, `Escape` key, or backdrop click):

1. **Stash Online Player (`src/music/providers.ts`)**:
   - **JioSaavn Direct Catalog**: Instant search and direct 320kbps/160kbps MP4/AAC full-song streaming.
   - **YouTube Music & YouTube Resolver**: High-bitrate full-track streaming via the integrated `/api/music/search`, `/api/music/resolve`, and `/api/music/stream` proxy routes.
   - **SoundCloud & Audius**: Full-track progressive and HLS streaming with automatic recording metadata preservation.
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

## 8. Camera Views, Stage Framing & Contrast Engine

- **4 Interactive Camera Views (`Front`, `Orbit`, `Side`, `Top`)**:
  - Each camera view has an individual **ON/OFF** switch in the control panel.
  - **Automatic Camera** cycles deterministically only through user-enabled views, or locks to a single view when selected.
- **WCAG AA Contrast Enforcement (`src/visualization/cinematic/contrast.ts` & `typography.ts`)**:
  - Continuously samples the live canvas backdrop (`48×30` luminance downsampler) and guarantees a minimum `4.5:1` contrast ratio for all foreground and accent lyric inks (`readableInk` and `readableChromaticInk`).

---

## 9. Cloud Sync, Authentication & Security Architecture

- **Google Sign-In & Guest Session (`src/auth/LoginScreen.tsx`, `src/firebase/firebaseClient.ts`)**:
  - Sign in with Google to synchronize visual intensity, speed, audio sensitivity, spectrum gain, motion blur, quality preset, enabled VoxelWall themes (`1–32`), enabled VoxelVerse lyric styles (`1–19`), enabled camera views (`1–4`), and per-song lyric delays (`userPreferences/{uid}/songDelays/{songId}`) to Cloud Firestore.
  - Full offline `localStorage` persistence in Guest Mode.
- **Secret-Free Repository Policy (`.env.example` & `firebase-applet-config.json`)**:
  - No API keys or OAuth client secrets are committed to tracked files. Copy `.env.example` to `.env.local` (gitignored) and provide `VITE_FIREBASE_API_KEY` when enabling Firebase Cloud Sync; when omitted, LyricFlow automatically runs in local storage mode without initialization errors.
- **Hardened Firestore Security Rules (`firestore.rules`)**:
  - Default-deny catch-all, strict owner UID + `email_verified` enforcement, exact schema key whitelisting (`hasAll` / `hasOnly`), bounded list sizes, and immutable `uid`/`createdAt` invariants.

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
│   │   ├── lyricTimeline.ts                       # Playback cue scheduler & whole-song emphasis snapshot
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
│   │   ├── CinematicStage.tsx                     # Dual-canvas compositor (background + sharp top lyric layer)
│   │   ├── catalog.ts                             # 32 VoxelWall scene templates across 7 categories
│   │   ├── kineticTypography.ts                   # 19 VoxelVerse lyric animation styles & multi-line layout
│   │   ├── cameraRig.ts                           # Beat-reactive 3D projection rig for kinetic typography
│   │   ├── contrast.ts                            # Real-time backdrop luminance sampler & WCAG contrast guard
│   │   ├── fonts.ts                               # 25 curated display, editorial, & monospace font packs
│   │   └── procedural/
│   │       ├── MotionGraphics.ts                  # 30 VoxelWall 2D music-reactive live wallpaper painters
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
