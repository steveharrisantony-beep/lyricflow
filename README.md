# LyricFlow Android

**Account sync and guest-readable approved corrections:** see [Firebase setup](FIREBASE_SETUP.md). The dashboard is deferred; publication remains manual.

Capacitor Android packaging of [LyricFlow](https://github.com/steveharrisantony-beep/lyricflow).

**[Download/build an APK on your tablet: Android setup guide](ANDROID.md)**

[![Build Android APK](https://github.com/steveharrisantony-beep/lyricsflow-android/actions/workflows/android-apk.yml/badge.svg)](https://github.com/steveharrisantony-beep/lyricsflow-android/actions/workflows/android-apk.yml)

The application and its existing Express backend run inside the APK. No external backend hosting or manual server setup is required. Online music/lyrics and optional Firebase sync still require internet services. Notification-listener integration is not included in this milestone.

---

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
     - Permanent layers are YouTube video, animated built-in themes, then transparent lyrics. Themes remain visible during video search/loading, errors and external-player ads. Lyrics stay on top, including on lyrical videos; external ads hide lyrics and cancel lookup.
     - YouTube audio keeps playing from the same iframe when themes cover it. JioSaavn/local/external backgrounds are muted. On Android, external mode also mutes the WebContents through AndroidX to avoid taking the other app's audio focus; unsupported System WebView versions fall back to themes.
     - Background selection compares up to 20 candidates per query, searches both music and lyrical videos for music preference, and rejects Topic/ATV, static audio, album images and visualizers. Lyrical preference requires `lyric`, `lyrical` or `lyrics` in the title. Recording suitability comes before views; missing music videos fall back to lyrical videos. Unknown unlabelled uploads are not used automatically. YouTube metadata cannot guarantee that every labelled video contains moving imagery.
     - The manual background chooser first shows up to 15 already-loaded candidates; **Search again** refreshes the list using the current query.
     - A recording change immediately removes its old iframe while the next match loads.
     - Captions use direct verified requests with bounded timeouts and support signed JSON3/XML/VTT tracks. Creator tracks are preferred; automatic captions are labelled and excluded from timing alignment. Restricted captions are reported rather than treated as missing. Use **Try video subtitles** to request captions directly or import a subtitle file when YouTube restricts access.
2. **Local Audio Upload (`src/audio/LocalPlayer.tsx`)**:
   - Supports `.mp3`, `.wav`, `.flac`, `.m4a`, `.ogg`, and `.aac` files decoded locally in the browser via the Web Audio API.

---

## 6. Synchronized Lyrics Engine (Dynamic Available Options) & YouTube Metadata Cleaner

LyricFlow searches Apple Library and LRCLIB concurrently, displays the first available library result immediately, and prefers Apple when it becomes available. A later upgrade waits for the current lyric line (including overlapping singers) to finish; changing songs cancels the pending handoff. Saved explicit source choices and custom lyrics remain in control.

LyricFlow dynamically probes and displays **only the Lyrics Engine options that are available** for the current song (`src/lyrics/lyricFlowEngine.ts`, `src/metadata/TrackFinder.tsx`, and `src/lyrics/providers.ts`):

1. **LyricFlow Engine (`lyricflow` — Hybrid Video-Aligned Sync with Parallel Library Lookup)**:
   - Designed specifically to solve music video vs. studio audio duration mismatches.
   - Collects **creator-uploaded YouTube Subtitles** (line-by-line timed to the exact music video timeline) **AND** **Apple Library** word-by-word TTML/syllable sync (`<mm:ss.xx>`).
   - Compares each line between the two transcripts (`alignAppleWordSyncWithYouTubeSubtitles`) and shifts/scales every Apple Music word timestamp onto the YouTube video's actual timeline.
   - **Smart Fallback**: If Apple Library lyrics are not found, LyricFlow Engine automatically falls back to aligning **LRC Library** onto **YouTube Subtitles**, or displaying **YouTube Subtitles** or **LRC Library** directly.
2. **Apple Library (`apple` — Direct Word-by-Word TTML & Dual-Singer Duets)**:
   - Direct Apple Music / iTunes catalog syllable & word-synced TTML (`<p begin="..." end="...">`, `<span begin="..." end="...">`, `<span ttm:role="x-roman">`, `<span ttm:role="x-bg">`) converted into enhanced LRC (`[mm:ss.xx]<mm:ss.xx>Word`).
   - Preserves overlapping dual-singer vocal timestamps (`ttm:agent="v1"` / `"v2"` and multi-word `x-bg` phrases) so when two singers perform simultaneously, both vocal lines render on **Left and Right sides of the stage at the same time**.
3. **LRC Library (`lrclib` — Direct Timed LRC)**:
   - Direct duration-aware timed LRC lookup from LRCLIB (`lrclib.net/api/get` & `/api/search`) and KuGou.
4. **YouTube Subtitles (`youtube` — Creator-Uploaded Video Captions + Multi-Track Selector)**:
   - Uses the [`jdepoix/youtube-transcript-api`](https://github.com/jdepoix/youtube-transcript-api) architecture (fetching the watch page with `CONSENT=YES+cb`, extracting `INNERTUBE_API_KEY`, and querying the `ANDROID` InnerTube `/youtubei/v1/player` endpoint).
   - **Creator-Uploaded Captions Only**: Strictly filters out auto-generated ASR captions (`kind !== 'asr'` and `!vssId.startsWith('a.')`) for high accuracy across Tamil, Malayalam, Hindi, Telugu, and international songs.
   - **Multiple Subtitle Tracks**: When a video includes multiple creator-uploaded subtitle tracks, collects all tracks and provides a track selector in the UI.

### Smart YouTube Metadata Cleaner & Post-Search Candidate Ranking
- **YouTube Title Sanitization (`cleanYouTubeTitleForLyrics`)**:
  - Automatically strips `@handle` mentions (e.g., `@SaiAbhyankkar`), standalone suffixes like `Lyrical`, `Lyrics`, `Sing Along`, everything from the first opening bracket `(`, `[`, `{` onwards, and recognizes `Song - Artist1 | Artist2 | Artist3` pipe-credit patterns so the song name before `-` is preserved.
  - Examples:
    - `Punchiri - Eechuu | Suhas | Chris Wayne | Steel | Loopd | Official Music Video` → **`Punchiri`** (recognizes `Eechuu` as author/artist).
    - `Punchiri - Sing Along | Eechuu | Suhas | Chris Wayne | Steel | Loopd | Malayalam Song` → **`Punchiri`**.
    - `Veezha Veera Lyrical (Tamil) | OM | Dhanush | Mammootty | Sai Pallavi | Rajkumar | Sai Abhyankkar` → **`Veezha Veera`**.
    - `@SaiAbhyankkar - Aasa Kooda (Music Video) | Thejo Bharathwaj | Preity Mukhundhan | Sai Smriti` → **`Aasa Kooda`**.
- **Post-Search Candidate Matching Against Full Raw Video Title (`scoreCandidateAgainstRawMetadata`)**:
  - While author and album names are skipped during the initial search query for YouTube songs, once multiple candidate results are returned from the lyrics library (complete with `artistName` and `albumName`), each candidate's title, artist, and album tokens are scored against the full original YouTube video title (`rawTitle` + `channel`) to choose the candidate with the **maximum match rate** and reject non-matching song titles.

---

## 7. Romanization & Multi-Script Support

- **Offline Indic Phonetic Transliteration (`src/romanization/romanize.ts`)**:
  - Supports **Devanagari (Hindi / Marathi / Sanskrit)**, **Malayalam**, **Tamil**, **Telugu**, **Kannada**, **Bengali**, **Gujarati**, **Gurmukhi (Punjabi)**, and **Odia** with vowel-sign (matra) composition, virama consonant cluster handling, anusvara/chandrabindu nasalization, and inherent schwa rules.
- **Apple Music Native Romanization**:
  - Automatically extracts `<span ttm:role="x-roman">` from Apple Music TTML payloads when available.
- **Romanized-First Display**:
  - Defaults to preferring Romanized lyrics on both the primary kinetic canvas and the interactive lyric panel whenever non-Latin scripts are detected.

---

## 8. Video Performance, Black Overlay, Dual-Singer Split Stage, Line-Locked Transitions, SponsorBlock & Queue (`Q`)

- **Zero-Lag YouTube Video Background (`CinematicStage.tsx`)**:
  - When the YouTube video background is running, built-in VoxelWall background theme canvases (`cinematic-effects`) and procedural shaders are **completely unloaded** so the video and VoxelVerse lyrics run at a silky-smooth 60 FPS. Built-in themes are only loaded when the **Built-in Themes** toggle is turned on.
- **Light-Themed Video Lyrics & Adjustable Black Overlay (`0%–90%`)**:
  - When lyrics are overlaid on a YouTube video, LyricFlow enforces crisp **light-themed text** (`#f8fafc` + high-luminance neon accent) and places a dedicated **Black Overlay** strictly between the YouTube video (`zIndex: 0`) and the lyrics canvas (`zIndex: 2`), with a live opacity slider (`0%` to `90%`).
- **Simultaneous Dual-Singer Split-Stage Display (`lyricTimeline.ts` & `kineticTypography.ts`)**:
  - When two singers sing at the same time in Apple Library lyrics, LyricFlow renders Singer 1 on the **Left side (`27%`)** and Singer 2 on the **Right side (`73%`)** simultaneously with independent word-by-word highlighting.
- **Line-Locked Animation & Background Transitions (`catalog.ts` & `CinematicStage.tsx`)**:
  - Scene boundaries are snapped to lyric line completion timestamps and locked while any lyric line is active (`activeCueNow`), ensuring background themes and lyric animation styles **never switch in the middle of a line**.
- **9 Spatial Lyric Stage Placements & Directional Line Animations (`kineticTypography.ts`)**:
  - Lyrics are no longer restricted to the center of the screen. Choose between **Dynamic Stage (Auto)**, **Alternating Left ↔ Right** (Line 1 enters from Left, Line 2 enters from Right), **Left Stage Sweep**, **Right Stage Sweep**, **Bottom-Right Cinema**, **Bottom-Left Editorial**, **Top-Left Headline**, **Diagonal Counter-Slide**, and **Center Stage**.
- **SponsorBlock Non-Music & Sponsor Auto-Skip (`src/music/sponsorBlock.ts`)**:
  - Powered by [SponsorBlockServer (`ajayyy/SponsorBlockServer`)](https://github.com/ajayyy/SponsorBlockServer), automatically detects and skips non-music (`music_offtopic`), `sponsor`, `selfpromo`, `intro`, `outro`, and `interaction` segments in YouTube videos.
- **Multi-Song Queue (`Q`) with Position Arrangement (`LocalPlayer.tsx` & `SongSearch.tsx`)**:
  - Every search result in JioSaavn and YouTube provides **Play Now** and **+ Queue** buttons.
  - The **QUEUE (`Q`)** section sits directly below **SONG DETAILS**, displaying all queued tracks with **Move Up (`↑`)**, **Move Down (`↓`)**, drag-and-drop reordering, **Play Now**, **Clear Queue**, and automatic progression when the current song finishes.
- **Centered Front Camera View & Smooth Bass-Threshold Camera Shake (`src/visualization/cinematic/cameraRig.ts`)**:
  - Camera shake is driven strictly by low-end **bass (`p.bass`)**, with the **Shake Sensitivity (`0%–100%`)** slider controlling the bass trigger threshold.

---

## 9. Profile Persistence & Security Architecture

Guest mode launches directly and saves preferences and fixes in a versioned device namespace. Each account has a separate namespace. Optional Firebase login synchronizes theme/display settings, font sizes, camera shake, volume, per-recording lyrics selections, exact-lyrics-version delays and saved custom overrides across web and Android. Firestore offline persistence queues changes where supported; pending device records can retry after reconnect. Guest import is explicit.

Approved timing, lyrics-provider and background-video corrections are readable without login. Personal overrides always win. Verified users can submit a proposal; submissions are private and never auto-publish. The dashboard is deferred, with manual review/publication through the Firebase Console documented in [FIREBASE_SETUP.md](FIREBASE_SETUP.md). Background-video replacement preserves the existing separate audio stream and is unavailable when the YouTube player itself supplies audio.

`firestore.rules` denies access by default, separates private profiles from public approvals, validates correction schemas and bounds, and restricts publishing to developer roles provisioned through trusted administration. Public config is supplied at build time; no Admin SDK private key belongs in the browser or APK. The original `userPreferences` v2 records/rules remain for compatibility; the v3 schema lives under `profiles` and `approvedCorrections`.

Set up the shared project using the browser-only [Firebase setup guide](FIREBASE_SETUP.md). Email/password works on both bundles; Google popup login is web-only until native Google sign-in is configured. Web Google users can add a password to their existing account for Android. Without Firebase config, local guest mode continues to work.

---

## 10. Project Structure

```text
├── server.ts                                      # Express + Vite server (/music/lyrics, /music/yt-subtitles, /music/sponsorblock)
├── firestore.rules                                # Hardened Cloud Firestore security rules
├── firebase-blueprint.json                        # Legacy v2 blueprint (v3: FIREBASE_SETUP.md)
├── src/
│   ├── App.tsx                                    # Main studio interface, VoxelWall & VoxelVerse controls
│   ├── audio/
│   │   ├── AudioSourceHub.tsx                     # Modal selector for Online Player vs. Local Upload
│   │   ├── LocalPlayer.tsx                        # Playback transport, Song Details, Queue (Q), SponsorBlock & delay
│   │   ├── audioSignal.ts                         # Web Audio graph & 64-band log-scaled analyzer
│   │   ├── bandEnvelope.ts                        # Adaptive attack/release envelope follower
│   │   └── beatDetector.ts                        # Spectral-flux onset, beat, & BPM tempo detector
│   ├── lyrics/
│   │   ├── ManualLyrics.tsx                       # Synchronized lyric stage, provider badges, & color picker
│   │   ├── lyricFlowEngine.ts                     # 4-Engine lyrics definitions, YT title cleaner & hybrid word-sync aligner
│   │   ├── appleLyrics.ts                         # Apple Music TTML & syllable JSON -> Enhanced LRC parser
│   │   ├── lrc.ts                                 # Line-synced & word-synced (<mm:ss.xx>) LRC parser
│   │   ├── lyricTimeline.ts                       # Playback cue scheduler & natural line-end calculator
│   │   ├── providers.ts                           # 4-Engine lyric resolver (LyricFlow / Apple / LRC / YouTube)
│   │   └── sceneDirector.ts                       # Semantic lyric mood & energy analyzer
│   ├── metadata/
│   │   ├── TrackFinder.tsx                        # Automatic 4-engine track & lyric resolver
│   │   └── trackInfo.ts                           # Filename & YouTube recording metadata normalizer
│   ├── music/
│   │   ├── SongSearch.tsx                         # JioSaavn & YouTube search with Play Now & + Queue buttons
│   │   ├── sponsorBlock.ts                        # SponsorBlock API client for skipping non-music & sponsor segments
│   │   └── providers.ts                           # JioSaavn & YouTube stream resolver
│   ├── romanization/
│   │   └── romanize.ts                            # 9-script offline Indic-to-Latin transliterator
│   ├── visualization/cinematic/
│   │   ├── CinematicStage.tsx                     # Video/Theme compositor, Black Overlay & Cinema Mode Studio Drawer
│   │   ├── catalog.ts                             # 23 VoxelWall scene templates × 4–5 palettes across 7 categories
│   │   ├── kineticTypography.ts                   # 19 VoxelVerse styles, 9 spatial placements & sequential colour fill
│   │   ├── cameraRig.ts                           # Smooth bass-threshold camera rig with sensitivity control
│   │   ├── contrast.ts                            # Real-time backdrop luminance sampler & WCAG contrast guard
│   │   ├── fonts.ts                               # 25 curated display, editorial, & monospace font packs
│   │   └── procedural/
│   │       ├── MotionGraphics.ts                  # 21 distinct VoxelWall 2D music-reactive wallpaper painters
│   │       ├── GraphicCompositions.ts             # 64-band Signal Chamber spectrum & Color Riot hex geometry
│   │       └── audioMotion.ts                     # Instrument-role channel routing
│   └── tests/                                     # Vitest test suites covering audio, lyrics, & visuals
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

### Streaming, SponsorBlock & Lyric Synchronization References
- **SponsorBlock Server (`ajayyy/SponsorBlockServer` — Non-Music & Sponsor Segment Skipping)**:  
  [https://github.com/ajayyy/SponsorBlockServer](https://github.com/ajayyy/SponsorBlockServer)
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


Per-song mappings now use title, artist/author and duration and retain a lyrics source file reference plus its signed delay, and a YouTube video ID plus its independent signed delay. Separate audio (including JioSaavn) can continue while a selected YouTube background stays muted. The saved music-video/lyrical-video preference changes the exact search query; see [Firebase setup](FIREBASE_SETUP.md).

### Automatic video timing with separate audio

JioSaavn, external-player and local audio retain their authoritative song clock.
Creator-uploaded subtitles with matching script/text and consistent timestamp
anchors shift only the muted video. Auto-generated captions are excluded. If
captions cannot be aligned, leading SponsorBlock skip segments supply the intro
cut. The two services load independently with bounded requests.

Choosing a video uses automatic timing (`videoDelaySeconds` / mapped `delaySeconds`
are null). Saving a numeric delay, including zero, overrides automatic timing.
For an older saved fixed delay, use **Saved fixes & community corrections > Use
automatic video sync** to enable the new behavior without losing the video choice.
Updated Firestore rules accept automatic timing; deploy `firestore.rules` to your
Firebase project before syncing these choices across signed-in devices.
