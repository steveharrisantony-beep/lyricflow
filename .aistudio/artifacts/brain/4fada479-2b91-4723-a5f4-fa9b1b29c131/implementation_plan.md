# LyricFlow — Personalized Stash-Powered Visualizer & Word-Synced Lyrics

Transform LyricFlow into a personalized, session-aware music visualization experience featuring a first-time Google or Guest login screen, cloud-synced preferences and per-song lyric timing delays, a focused audio source selector (Local Audio Upload or Stash-inspired Built-in Online Player), an automatic Apple Music word-synced lyrics pipeline with fallback providers, and granular per-theme and per-kinetic-animation toggles.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX decisions were confirmed during interactive planning and will govern the implementation:

- **Confirmed Decision 1 — Authentication & Persistence (`Firebase Auth + Firestore`)**: Users sign in via Google OAuth (`signInWithPopup`) or enter as a Guest. Logged-in users have their visual settings, enabled theme sets, enabled kinetic animation styles, and per-song lyric timing delays automatically persisted to Firestore and synchronized across devices, while Guest sessions persist locally and can upgrade to Google login at any time.
- **Confirmed Decision 2 — Exclusive Two-Source Audio Selector**: Legacy features (`Live Microphone Visualizer`, `Spotify Discovery`, `System/Tab Audio`, `Internet Radio`, and `Virtual Audio Routing`) will be completely removed. Post-login, users select between **Local Audio Upload** and the **Built-in Online Player (Stash Architecture)**.
- **Confirmed Decision 3 — Automatic Apple Music Word-Synced Lyrics + Fallback Chain**: When a track loads, LyricFlow automatically queries the Stash-style lyric provider chain: **Apple Music TTML/Syllable Word-Synced Lyrics** first (via iTunes track lookup + lyrics proxy/TTML parser), followed by **LRCLIB** (exact recording match then ranked search), and **KuGou / YouTube transcript** fallbacks. Lyrics load automatically into the timeline while keeping the custom lyrics editor and candidate switcher collapsed unless the user chooses to override a mismatch.
- **Confirmed Decision 4 — Granular Theme & Kinetic Animation Toggles in Auto-Director**: Users can individually toggle each of the 40 visual themes and each of the 8 kinetic lyric choreography styles (`dolly`, `rise`, `sweep`, `tilt`, `elastic`, `ribbon`, `stamp`, `cascade`) on or off. The automatic scene director and kinetic typography engine strictly sample from the user's enabled themes and enabled animation styles.

---

## 1. Overview & Core Concept

- **What It Does**: LyricFlow guides listeners through a clean three-stage journey:
  1. **Welcome & Login Screen**: First-time visitors sign in with Google or continue as Guest.
  2. **Audio Source Selection Screen**: Immediately after login, users choose between uploading local audio files or streaming via the built-in Stash-inspired online catalog player.
  3. **Ordered Visualizer Workspace**: The main workspace presents the **3D/2D Cinematic Visualizer Stage** at the top, followed immediately by **Player Details**, **Song Details**, and the **Interactive Timebar & Delay Controls**, then the **Automatic Word-Synced Lyrics & Custom Override Drawer**, and finally the **Theme & Kinetic Animation Customizer**.
- **Target Audience / Persona**: Music enthusiasts and visual performance curators who want effortless karaoke-grade word-synced kinetic typography paired with customizable 2D/3D procedural visuals that remember their exact per-song synchronization offsets and favorite visual styles.
- **Key Value**: Eliminates manual lyric hunting and repetitive setup by automating word-level lyric synchronization using Stash's provider strategy and persisting per-song delays and curated theme/motion pools to the user's account.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **First-Time Login Flow**:
     - Presents a full-viewport obsidian soundstage entry screen with two clear actions: **Continue with Google** (syncs settings, custom theme/motion rotations, and song lyric delays across devices) and **Continue as Guest** (local session storage).
  2. **Post-Login Audio Source Prompt**:
     - Once authenticated (or when clicking "Switch Source" in the workspace), a dedicated source selection view presents two high-contrast cards:
       - **Local Audio Upload**: Drag-and-drop or browse local MP3, WAV, M4A, FLAC, OGG, or AAC files analyzed directly on-device.
       - **Built-in Online Player (Stash Engine)**: Search and stream tracks directly from YouTube Music, JioSaavn, SoundCloud, and Audius with separated metadata search and validated stream resolution.
  3. **Primary Visualizer & Player Stack (Strict Vertical Order)**:
     - **1. Visualizer Stage**: Full-width 3D WebGL + 2D procedural canvas with semantic HUD overlay, Cinema Mode fullscreen toggle, and live word-synced kinetic choreography.
     - **2. Player Details**: Active source mode indicator (Local vs. Online Stream), play/pause transport, volume control, and quick button to switch audio source or search a new online track.
     - **3. Song Details**: Track title, artist, album, artwork thumbnail, audio reactivity summary, and active lyric sync badge (`Apple Music Word-Sync`, `LRCLIB Timed`, or `Custom Edited`) with a single `"Change / Edit Lyrics"` toggle button.
     - **4. Timebar & Per-Song Delay Bar**: Full-width interactive seek scrubber with tabular timestamps (`current / duration`) paired directly with quick `-0.25s / Reset / +0.25s` lyric delay controls that automatically save to the user's profile for that specific song (`title + artist + duration` key).
     - **5. Collapsible Lyrics Override & Editor**: Hidden by default while automatic lyrics play; expands on demand when `"Change / Edit Lyrics"` is clicked so the user can pick an alternative match from the provider chain or edit LRC/word timestamps manually.
     - **6. Theme & Kinetic Animation Curation Panel**: Filterable grid of all 40 visual themes and all 8 kinetic lyric animation styles with individual On/Off switches, "Enable All / Disable All" batch actions, and rendering quality sliders.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Precision dark-room studio console meets spatial 3D soundstage, adhering to the 3D Spatial and SaaS Console design rules.
  - *Color Palette & Mood*:
    - Dominant Canvas (60%): Deep Obsidian Slate (`#090B10`) and Midnight Surface (`#0F141D`).
    - Structural Surfaces (30%): Subdued Charcoal (`#141C27`) with crisp hairline borders (`1px solid rgba(255,255,255,0.08)`).
    - Accent Budget (10%): Luminous Ice Cyan (`#97E0E9`) for primary interactive focus and Warm Amber (`#F8DDC8`) for active word-sync highlights.
  - *Typography & Hierarchy*:
    - Display / Brand & Stage Headers: `Bricolage Grotesque` & `Syne` for bold studio presence.
    - UI & Controls Prose: `Space Grotesk` for crisp single-line control legibility.
    - Timestamps, Timebar & Audio Telemetry: `Space Mono` with `font-variant-numeric: tabular-nums` so timebars and delay offsets never jitter during playback.
  - *Component Styling & Layout*: Single-elevation dark surfaces with hairline dividers, zero static pill clutter (metadata rendered as clean text separated by `·`), and a clean 3-zone top bar (`Brand Wordmark` — `Source / Themes / Lyrics / Settings navigation` — `User Profile / Sign Out`).
- **Interactive Feedback & Motion**:
  - Smooth `150ms` transitions on theme/motion toggles and timebar scrubbing.
  - Non-intrusive sync indicator showing when settings or song lyric delays are saved to Firestore.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Stash-Inspired Multi-Source Music & Apple Music Word-Sync Pipeline**
  - *Chosen Approach*: Mirror Stash's two-pronged architecture (`rawnaldclark/Stash`):
    1. **Catalog & Stream Resolution**: Combine direct browser-playable Audius streams with the Python resolver (`ytmusicapi`, `JioSaavn`, `SoundCloud`, `yt-dlp` validated audio stream extraction) inside a unified Built-in Online Player.
    2. **Ordered Lyrics Repository Chain**: Query **Apple Music syllable/word-synced lyrics** first (resolving track metadata via iTunes Search API and fetching TTML/word-timed lyrics via public Apple Music lyric proxy endpoints, converting `<span begin="..." end="...">` word tags into `TimedWord[]` segments), then fall back to **LRCLIB** (exact duration-bounded lookup followed by fuzzy search), and finally **KuGou / YouTube captions** fallback.
  - *Why*: Apple Music TTML provides true syllable/word-level start and end timestamps that drive LyricFlow's 3D kinetic word emphasis and karaoke sweep bars with studio accuracy, while LRCLIB guarantees high coverage when word-level data is unavailable.
  - *Alternatives Considered*: Relying solely on LRCLIB (passed over because most LRCLIB entries only include line-level timestamps rather than word-by-word sync).

- **Decision 2: Cloud-Synced Per-Song Lyric Delay & User Preferences via Firestore**
  - *Chosen Approach*: Provision Firebase Authentication (Google Sign-In) and Cloud Firestore. Store a `userPreferences/{userId}` document containing visual settings (sensitivity, intensity, speed, motion blur, quality, camera mode, enabled theme IDs, enabled kinetic motion IDs) and a `userPreferences/{userId}/songDelays/{songKey}` subcollection storing custom lyric delays and optional lyric overrides indexed by normalized `artist + title + duration`.
  - *Why*: Users frequently fine-tune lyric delay (`-0.50s`, `+0.75s`) for specific recordings; storing these in a bounded subcollection per song ensures instant automatic recall whenever that song is played again on any device, while guest users get seamless `localStorage` fallback.
  - *Alternatives Considered*: Storing all song delays inside a single array on the user document (passed over to respect Firestore security rule scalability invariants and avoid unbounded document growth).

- **Decision 3: Curated Pool Filtering for Themes & Kinetic Choreography**
  - *Chosen Approach*: Add explicit toggle switches on every theme card (40 themes) and every kinetic motion card (8 styles: `dolly`, `rise`, `sweep`, `tilt`, `elastic`, `ribbon`, `stamp`, `cascade`), enforcing that at least 1 theme and 1 kinetic style remain active. Both manual selection and the automatic `sceneDirector` / `kineticTypography` selector filter against the user's enabled sets.
  - *Why*: Gives users complete creative control over the visual aesthetic—allowing them to disable high-flash or specific 2D/3D themes and lock kinetic typography to their favorite motion grammars.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Authentication & Session Gate                         │
│  ┌────────────────────────────────────┐  ┌────────────────────────────────┐  │
│  │ Google Sign-In (Firebase Auth)     │  │ Guest Session (Local Profile)  │  │
│  └─────────────────┬──────────────────┘  └───────────────┬────────────────┘  │
└────────────────────┼─────────────────────────────────────┼───────────────────┘
                     ▼                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                User Preferences & Song Delay Sync Store                      │
│  • Firestore: /userPreferences/{uid} & /songDelays/{songHash}                │
│  • LocalStorage mirror for zero-latency boot & Guest mode                    │
└────────────────────────────────────┬─────────────────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                 Post-Login Audio Source Selector Modal / View                │
│  ┌────────────────────────────────────┐  ┌────────────────────────────────┐  │
│  │ 1. Local Audio File Upload         │  │ 2. Built-in Stash Online Player│  │
│  │    (MP3/WAV/M4A/FLAC on-device)    │  │    (YTMusic/Saavn/Audius/SC)   │  │
│  └─────────────────┬──────────────────┘  └───────────────┬────────────────┘  │
└────────────────────┼─────────────────────────────────────┼───────────────────┘
                     └─────────────────┬───────────────────┘
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    Main Workspace (Ordered Vertical Flow)                    │
│                                                                              │
│  [1] Cinematic Visualizer Stage (WebGL 3D + 2D Procedural + Kinetic Lyrics)  │
│       ▲ Filtered by Enabled Themes (40) & Enabled Kinetic Motions (8)        │
│  [2] Player Details Bar (Play/Pause, Source Switcher, Online Search Drawer)  │
│  [3] Song Details Card (Title, Artist, Album, Sync Source, "Edit Lyrics" Btn)│
│  [4] Interactive Timebar & Per-Song Lyric Delay Controls (-0.25s / +0.25s)   │
│  [5] Automatic Lyrics Engine & On-Demand Custom Lyrics Override Drawer       │
│       ├─► 1. Saved Song Override / Local Library                             │
│       ├─► 2. Apple Music Word-Synced TTML / Syllable Lyrics Provider         │
│       ├─► 3. LRCLIB Exact Duration & Ranked Search Fallback                  │
│       └─► 4. KuGou / Plain Text Estimated Timing Fallback                    │
│  [6] Theme & Kinetic Animation Toggle Matrix (Individual On/Off Switches)    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

1. **User Preferences (`userPreferences/{userId}`)**:
   - `uid`: string (matches `request.auth.uid`)
   - `displayName`: string
   - `intensity`: number (`0–100`), `speed`: number (`10–100`), `sensitivity`: number (`0–100`), `spectrumGain`: number (`0–100`), `motionBlur`: number (`0–80`)
   - `quality`: `'High' | 'Balanced' | 'Performance'`
   - `autoScenes`: boolean, `spatialTypography`: boolean, `narrativeObjects`: boolean
   - `cameraMode`: `'Automatic' | 'Front' | 'Orbit' | 'Side' | 'Top'`
   - `enabledScenes`: string[] (bounded list of enabled `SceneId`s, max 40)
   - `enabledKineticMotions`: string[] (bounded list of enabled `LyricMotion`s, max 8)
   - `updatedAt`: server timestamp
2. **Per-Song Lyric Delay & Override (`userPreferences/{userId}/songDelays/{songId}`)**:
   - `uid`: string (matches `request.auth.uid`)
   - `songId`: deterministic alphanumeric hash of normalized `title + artist + duration`
   - `title`: string, `artist`: string, `duration`: number
   - `delaySeconds`: number (`-30` to `+30`)
   - `customLyricsLrc`: optional string (if the user edited/overrode mismatched lyrics for this song)
   - `updatedAt`: server timestamp

### Interactive Component & State Mapping

- **First-Time Auth & Source Gate**:
  - On initial load, if no active Firebase user or Guest session is present, the app renders the **Login Gate**.
  - Selecting **Continue with Google** triggers `signInWithPopup` and loads `/userPreferences/{uid}` from Firestore. Selecting **Continue as Guest** initializes a local guest session.
  - Once authenticated, if no audio source has been chosen in the current session, the **Audio Source Selector** opens automatically so the user picks either **Local Audio Upload** or **Built-in Online Player**.
- **Built-in Stash Online Player & Local Upload**:
  - Selecting **Local Audio Upload** opens the file picker and binds the local file to the shared `<audio>` clock.
  - Selecting **Built-in Online Player** opens the integrated Stash catalog search (supporting YouTube Music, JioSaavn, SoundCloud, and Audius), resolves the stream URL, and begins playback on the shared `<audio>` clock.
- **Automatic Stash Lyrics Pipeline & On-Demand Editor**:
  - Whenever `localTrack` changes, the lyrics controller checks if a per-song delay or custom lyric override exists for `songId` and applies the saved delay immediately.
  - Simultaneously, the automatic lyric resolver queries the ordered provider chain (Apple Music TTML/word-sync $\rightarrow$ LRCLIB exact/search $\rightarrow$ fallback) without requiring manual checkboxes.
  - Parsed word-level timestamps (`<mm:ss.xx>` or TTML `<span begin end>`) populate `TimedLine.words` so `kineticTypography.ts` renders true word-by-word choreography.
  - If the user notices a lyric mismatch, clicking **Change / Edit Lyrics** in the Song Details bar expands the candidate selector and LRC/word editor to pick another recording or paste custom lyrics.
- **Theme & Kinetic Animation Toggles**:
  - Each theme card in the Scene Library includes an enable/disable toggle button alongside clicking to preview.
  - A new **Kinetic Lyric Styles** row displays all 8 motion grammars (`Dolly`, `Rise`, `Sweep`, `Tilt`, `Elastic`, `Ribbon`, `Stamp`, `Cascade`) with individual toggle switches.
  - `buildCinematicSchedule` and `lyricMotionFor` filter against `enabledScenes` and `enabledKineticMotions`, persisting any changes to Firestore (for logged-in users) and `localStorage`.
- **Feature Removal & Cleanup**:
  - Remove `MicListener.tsx` and `SpotifyDiscovery.tsx` from the application shell and strip microphone/system-audio/radio branches from the source hub and status indicators.
