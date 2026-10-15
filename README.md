# LyricFlow — Cinematic Lyric Visualizer

A browser-based, locally reactive music visualizer for Android tablets. Built with **React, TypeScript, Vite, Canvas 2D and the Web Audio API**, without a paid graphics or AI service.

## Open on Xiaomi Pad 8

**[Launch in StackBlitz](https://stackblitz.com/github/steveharrisantony-beep/lyricflow)**

1. Open the link in your tablet's browser and wait for the project to build.
2. In **Local Music Player**, choose an MP3 from your tablet and press Play.
3. In **Find Lyrics**, review the filename-derived title/artist and correct them if necessary. You may inspect LRCLIB metadata candidates; choose only the correct version and retrieve text only if you have permission.
4. Alternatively, use **Edit / import lyrics** to import an authorized `.lrc`/text file or load the clearly labeled original sample.
5. Choose **Auto-direct cinematic scenes** to build a storyline from lyric sections, or tap one of the thirty templates for a manual override.
6. Use **Cinema Mode** for a full-window performance without controls; tap the stage to exit.
7. Check the **Song Storyboard** beneath the lyric panel for planned scene names, transitions, typography and timings.

The music player, microphone, visualizer and manual lyric entry all continue to work without a backend.

## Thirty original cinematic templates

| # | Name | Visual approach |
|---|---|---|
| 01 | Crimson Impact | Red/black kinetic title impacts |
| 02 | Concrete Manifesto | Urban poster wall, concrete, paper |
| 03 | Rain on Glass | Rainfall, bokeh, nocturnal reflections |
| 04 | Neon Velocity | Fast neon perspective tunnel |
| 05 | Ink Rebellion | Contrasting ink splashes and distressed text |
| 06 | Ocean Reverie | Pastel horizon and wave reflections |
| 07 | Color Riot | High-contrast geometric pop art |
| 08 | Analog Breakdown | CRT scanlines, tape errors, terminal lettering |
| 09 | Cloud Cathedral | Layered clouds and soft volumetric-looking light |
| 10 | Stellar Expansion | Cosmic flythrough and depth stars |
| 11 | Fragmented Thoughts | Angular shards and fractured titles |
| 12 | Quiet Pages | Sparse editorial paper compositions |
| 13 | Monochrome Memory | Vintage black-and-white film, dust and light shafts |
| 14 | Monument Titles | Architectural columns and gold-lit monumental typography |
| 15 | Midnight Confession | Intimate dark-red spotlight and poetic type |
| 16 | Glass Architecture | Transparent isometric glass towers and structural grids |
| 17 | Ransom Poetry | Assembled paper strips and ransom-cut typography |
| 18 | Type Collision | Bold brutalist type, geometric blocks and circles |
| 19 | Petal Memory | Moonlight, silhouetted branches and drifting petals |
| 20 | Submerged Words | Underwater caustics, distortion and rising bubbles |
| 21 | Inferno Letterforms | Flame tongues, embers and fiery typography |
| 22 | Holographic Frequency | Cyan holographic grid, scanning rings and tech type |
| 23 | Pixel Pulse | Retro pixel landscape, star sprites and arcade lettering |
| 24 | Marker Diary | Hand-drawn doodles, sketchbook lines and handwriting |
| 25 | Bubble Pop | Inflated lyric effects and floating pastel soap bubbles |
| 26 | Word Playground | Modern modular Bauhaus-style lettering and shape choreography |
| 27 | Sunset Frequency | Vaporwave sunset, palm silhouettes and retro font |
| 28 | Typographic Vortex | Spiral composition and orbiting letterforms |
| 29 | Midnight Transit | Urban vanishing-point camera and speed-line structures |
| 30 | Final Ascension | Golden spotlight, rising architecture and heroic type |

These are **implemented, procedural motion-graphic templates**, not licensed Videobolt templates or pre-rendered videos. The effects draw using native Canvas 2D to stay lightweight on Android; some are stylized 2.5D perspective effects, not full 3D meshes or volumetric ray tracing. This is an iterative foundation rather than a promise of production-quality video rendering.

The old Atmosphere / Light Trails / Geometry / Kinetic Type scenes and former Three.js overlay were removed. The current stage uses **one requestAnimationFrame renderer** instead of overlapping animation engines. The audio player, lyrics provider adapters, local library, Romanization, microphone, and Spotify metadata panel were preserved.

## Scene direction, timing and anti-repetition

Lyrics are analyzed **when loaded or edited**, not on every rendered frame. The existing heuristic `sceneDirector` groups lyric lines into coherent sections and estimates imagery/mood; the new `cinematic/catalog` translates them into one of thirty templates using the selected genre, target energy, scene-family variety and recent scene history.

- The scheduler generates a **deterministic timeline**. Seeking in the local player selects the appropriate scene and word.
- Consecutive templates have a three-scene anti-repetition penalty; intentional chorus callbacks and richer phrase analysis remain future work.
- Long lyrical sections can contain multiple visual templates rather than one endless repeating effect.
- Native lyric text is preserved, with separate editable approximate Romanization. Actual enhanced-LRC word timestamps are used when provided; otherwise word positions are labeled **estimated** and are not precise vocal alignment.
- Font **packs** vary by template and genre: industrial condensed, editorial serif, rounded pop, techno display, distressed, mono and literary.
- Camera options change the movement and perspective illusion. The current renderer is 2D/2.5D, so these are **camera-like transforms**, not freely movable 3D cameras.
- No lyrics? The audio-only visualizer cycles through all 30 distinctive scenes, with different variations across a track.

The design is inspired by the **architectural concepts** of https://github.com/mexicat/pdoom-video and reference images of Videobolt lyric videos. No proprietary templates, music recordings or other creators' graphical assets are embedded in the project.


## Premium image-based backgrounds — new scene pack

A new `artwork.ts` layer composites original, generated scene imagery below the existing animated narrative elements and kinetic lyrics. The **premium artwork is not coupled to the beat**: it uses subtle independent camera drift and a restrained vignette. Overlaid objects may continue to react to bass and treble. **Lyric scale, glow and word movement now follow the lyric timeline only** — no audio beat/bass pulse is applied to text.

The same bundled art is also available as **LyricFlow_26_Premium_Scene_Backgrounds.zip** in the ChatGPT project conversation. It contains 26 optimized, 1280px-wide WebP images, each **named exactly after an existing scene ID** (for example, `ocean-reverie.webp`, `rain-on-glass.webp` and `midnight-transit.webp`), and a source/assignment manifest. The pack is about 1.6 MB.

### Built into GitHub — no import required

**All 26 generated WebP files are now committed in `public/scene-art/`**, named after their scene IDs. Open LyricFlow through StackBlitz or your deployment; backgrounds download automatically from the same origin when a scene needs them. Files are optimized to about **1.6 MB total**, with a small decode cache for mobile browsers. Images and lyrics are composited independently.

**Optional custom artwork:** Under **CINEMATIC SCENE LIBRARY → PREMIUM BACKGROUND ARTWORK**, tap **Import or replace scene artwork** and select a ZIP of scene-named WebPs. This locally overrides bundled images or adds an image for one of the four missing scenes. Overrides are kept in IndexedDB on the current browser; there is no server upload, GitHub token or subscription required. Other devices continue using the 26 included images until you add overrides.

The separate downloadable ZIP remains available as a backup and as a reference of the exact scene file names. It is not required for normal use.

**Remaining four scene backgrounds:** `analog-breakdown`, `monochrome-memory`, `ransom-poetry` and `pixel-pulse`. These currently retain their original procedural visuals instead of reusing an unrelated generated image.

Images are matched by scene ID, not index or arbitrary filename. There are no hardcoded remote image URLs or embedded music recordings.

## Premium typography (self-hosted)

The legacy DM Sans, Manrope and generic system-font presets were replaced in the cinematic lyrics engine. LyricFlow bundles **19 free and open-source Fontsource families** locally, including Anton, Bebas Neue, Cormorant Garamond, Orbitron, Rubik Dirt, Unbounded, Space Mono, Bodoni Moda, Cinzel Decorative, Fraunces, Syne, Abril Fatface, Press Start 2P, Caveat, Righteous, Chakra Petch, Black Ops One, Bricolage Grotesque, and Space Grotesk for the interface. The user pays nothing for these fonts and no runtime Google Fonts request is needed.

The font registry chooses distinct packs per scene; the scene-selection engine also uses the manual genre preset. Malayalam, Tamil and Devanagari rely on a native-script font fallback when a Latin display font does not cover those scripts. The original lyrics are never replaced by Romanization.

## Main-screen order

1. Cinematic animation canvas
2. **LIVE AUDIO REACTIVITY**
3. **LYRICS & SCENE DIRECTOR**
4. **CINEMATIC SCENE LIBRARY** (all 30)
5. Local Music Player, Find Lyrics, Live Microphone, optional Spotify metadata section, and footer

The default 50% sensitivity remains user-adjustable. On a loud phone speaker, lower sensitivity or increase the distance from the tablet to avoid noisy input.

## Music input and visual response

**Local file playback** is recommended for accurate timelines. It provides real playback time, file seeking, loudness, bass/mid/treble bands, rough onset/beat estimation, estimated BPM, heuristic downbeat pulses and crude musical-section energy categories. Effects react to the measured data while their cinematic compositions change less frequently.

**Live microphone mode** separately listens to nearby music from a phone. It asks permission only when you press Start Listening, analyzes audio on the tablet without recording/uploading it, and stops and closes the microphone when listening ends. Microphone input alone cannot identify exact lyric timestamps or provide perfect beat/downbeat detection.

The **audio sensitivity defaults to 50%** and remains adjustable. Quality presets and reduced-motion mode are available. Performance depends on tablet hardware and browser.

## Lyrics and licensing

- Song title/artist may be guessed from an audio **filename**, not magically recognized from the waveform. Users should confirm them.
- The independent LRCLIB adapter searches **track metadata candidates** with match-confidence ranking; it does not automatically reproduce or cache copyrighted lyrics. Explicit user permission confirmation is needed before requesting lyric text.
- A browser-based library stores user-authorized entries and permitted corrections locally. It does not sync across devices.
- Local open-source Sanscript estimates Malayalam, Tamil and Hindi Romanization. Pronunciation should be checked manually.
- Missing lyrics keep the audio-only fallback active; missing providers do not crash the visualizer.

**Spotify:** Only a separate PKCE account / metadata panel exists. Spotify playback time, audio and track data are **not connected to this visualizer or lyric synchronization**, because Spotify's published policy prohibits synchronizing Spotify recordings with visual media without the necessary authorization. Personal, noncommercial use does not automatically override that restriction. See https://developer.spotify.com/policy.

## Development, tests and costs

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run smoke
```

The GitHub Actions build checks TypeScript, unit tests and production Vite output. A separate headless Chrome workflow checks local synthetic audio, lyric scene selection, the cinematic canvas, template differences and entering/exiting Cinema Mode.

**Important:** Browser tests do not establish visual quality or 60 FPS on a Xiaomi Pad 8. Test the new visuals and performance on the actual tablet before starting the next milestone. No credentials, server, billing account or paid service is required for the initial visualizer.

## Narrative cinematography and spatial lyric director

This milestone preserves the existing **30 cinematic scenes** and adds independent layers inspired by the presentation principles in Cotodama and SonicGlass reference footage; it does not copy their proprietary art or scene files.

**Narrative objects:** `src/visualization/cinematic/narrative.ts` chooses a symbolic illustration from lyric imagery (moon, rain, heart, flowers, flame, stars, skyline, road, bird, mountain, water, memory or abstract geometry). Lyrics take priority over scene mood; the visual remains anchored toward the side so primary lyric text retains negative space. These are original procedurally drawn Canvas 2D shapes, not photographs or video assets. Bass and treble independently modulate their size, highlight and movement; visual intensity and Reduced Motion limit their effect.

**Spatial kinetic lyrics:** `spatialTypography.ts` gives each lyric a deterministic arrangement chosen from asymmetric, diagonal, vertical, collage, orbital, poster, editorial, and echo forms. Word-level accents follow source-provided timestamps where present and otherwise use clearly estimated timings. Letter splitting is avoided for Indic scripts. Switch **Spatial kinetic lyrics** off to use the older scene-specific typography, or switch **Narrative objects** off if you prefer a cleaner background.

**Additional curated fonts:** Seven more locally bundled Fontsource families (Italiana, Gloock, Marcellus, Michroma, Poiret One, Special Elite, Bungee Shade) augment the original 19 families. Fontsource's fonts are published with permissive font licenses; licenses are still binding even for strictly personal and non-commercial projects. Do not add unlicensed font copies to this public repository. Source font license details should be checked for any future font changes.

**LIVE AUDIO REACTIVITY:** `src/audio/beatDetector.ts` uses compressed positive spectral flux, an adaptive moving noise threshold, silence rejection, hit spacing, and tempo estimation from a history of onset intervals. Beat and onset pulses stay readable across slower UI samples. The default **50% sensitivity** mainly changes visual energy; it should not manufacture extra musical beats. Downbeat pulses are heuristic four-event groups, **not** confirmed downbeats or meter inference. Tempo estimates have a confidence score and may be uncertain with drums, syncopation, room acoustics, or microphones.

Automated tests use a synthetic 120 BPM pulse train and check silence, sensitivity stability, lyric layouts, and bass/treble behavior. Real music and Xiaomi Pad 8 FPS must still be checked manually.

## Known limitations / future work

1. Sophisticated pdoom-style choreographed typography and production-ready video-quality shaders remain future work.
2. Current lyric emotion/theme analysis is a deterministic heuristic and cannot fully understand Malayalam/Tamil/Hindi lyrical context.
3. True forced vocal alignment, verified downbeat grids, and music phrase/chorus detection are not yet implemented.
4. The new renderer is Canvas 2D, not a fully 3D camera scene. Complex assets, textures and advanced postprocessing would need additional work and performance measurement.
5. Third-party provider availability, lyrics rights, Android microphone permissions and local storage persistence depend on browser and source restrictions.

This README describes the **current cinematic rebuild**; earlier prototype documentation should not be used to infer features that are no longer present.
