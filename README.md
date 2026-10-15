# LyricFlow — Cinematic Lyric Visualizer

A browser-based, locally reactive music visualizer for Android tablets. Built with **React, TypeScript, Vite, Three.js/WebGL, Canvas 2D and the Web Audio API**, without a paid graphics or AI service.

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

## Search, play and automatically synchronize

**Audio Source → Search songs** opens the search-first input sheet. Search by song
or artist, choose the exact recording, and play it through the shared player.

- **Audius** searches Audius's public catalog through its documented API; gated
  tracks are excluded. Availability and CORS depend on the provider. This is not
  a catalog of every commercially released song.
- **Connected resolver** uses the optional FastAPI/yt-dlp service in [`server`](server/README.md).
  It searches public YouTube recording metadata and resolves finite, unrestricted
  audio without cookies or Spotify extraction. It is **not hosted by default**.
  A frontend-only StackBlitz/Vercel build cannot execute the Python resolver.
- **Browser workspace with both services:** [Open GitHub Codespaces](https://codespaces.new/steveharrisantony-beep/lyricflow).
  The included devcontainer installs dependencies and starts both services; open
  port **5173** after setup. Vite forwards `/music` to the private resolver on
  port 8000. GitHub's account access, Codespaces quota and current service pricing
  apply. No local terminal installation is required. Third-party playback may
  still be blocked by the source or cloud IP address.
- To use a separately hosted resolver, save its HTTPS base URL in **Search settings**.
  On a tablet, `localhost` refers to the tablet, not another computer or server.
- Local files, microphone input and direct radio streams remain available.

In **Find Lyrics**, confirm permission to display the lyrics and enable
**Automatically load matching timed lyrics**. These choices last for the tab's
session. For each recording the app checks the permitted local library, then
LRCLIB exact lookup, then a bounded search fallback. Automatic selection requires
matching title and artist, duration within two seconds, timed lyrics, and an
unambiguous recording. Missing, instrumental, plain-only or uncertain results
continue with audio visuals and manual selection/import. Requests are cancelled
on track changes; network failures remain retryable. Automatic retrieval never
silently saves lyric text.

Line timing follows `HTMLAudioElement.currentTime` for streamed and local tracks,
including seeking and pauses; LRC offset and signed display delay are independent.
Real word timestamps are used when supplied. Estimated word positions remain
labelled estimated; this is not forced vocal alignment or live microphone song ID.
Spotify metadata does not drive synchronization. Stash's Apple/KuGou/private
YouTube lyric endpoints are not copied into this implementation.

**Spectrum gain** below the 64-band meter is independent of overall audio
sensitivity and beat detection. Its default is a calmer **35%**; zero suppresses
frequency bars and higher settings increase height. The preference is saved
locally and the same slider is available in Cinema Mode. Cinema controls also
include song play/pause and seeking.

**3D appearance and motion:** bevelled geometry, physically based materials,
procedural environment reflections, a warmer key light, restrained fill and soft
shadow reception on structural floors. High uses 1024px shadows, Balanced 512px,
and Performance disables them. Heavy forms follow bass; fine details and glows
follow treble; rings follow mids. Damped motion reduces jumps, and architectural
forms remain steadier. The two Canvas showcase scenes keep their distinct engines.

See [Stash architecture notes](STASH_RESEARCH.md) for inspected source paths,
implementation boundaries and live-service verification limits.

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

These are **implemented, procedural motion-graphic templates**, not licensed Videobolt templates or pre-rendered videos. Two showcase engines use Canvas 2D; the remaining scenes use Three.js geometry and procedural WebGL backgrounds, with a Canvas fallback when WebGL is unavailable. These do not implement volumetric ray tracing. This is an iterative foundation rather than a promise of production-quality video rendering.

The old Atmosphere / Light Trails / Geometry / Kinetic Type scenes were replaced. The current stage uses **one requestAnimationFrame scheduler**, selecting either a WebGL scene or a Canvas composition, with a separate sharp lyric canvas. The audio player, lyrics provider adapters, local library, Romanization, microphone, and Spotify metadata panel were preserved.

## Scene direction, timing and anti-repetition

Lyrics are analyzed **when loaded or edited**, not on every rendered frame. The existing heuristic `sceneDirector` groups lyric lines into coherent sections and estimates imagery/mood; the new `cinematic/catalog` translates them into one of thirty templates using the selected genre, target energy, scene-family variety and recent scene history.

- The scheduler generates a **deterministic timeline**. Seeking in the local player selects the appropriate scene and word.
- Consecutive templates have a three-scene anti-repetition penalty; intentional chorus callbacks and richer phrase analysis remain future work.
- Long lyrical sections can contain multiple visual templates rather than one endless repeating effect.
- Native lyric text is preserved, with separate editable approximate Romanization. Actual enhanced-LRC word timestamps are used when provided; otherwise word positions are labeled **estimated** and are not precise vocal alignment.
- Font **packs** vary by template and genre: industrial condensed, editorial serif, rounded pop, techno display, distressed, mono and literary.
- Camera options change the movement and perspective illusion. The Three.js scenes use a perspective camera; the two Canvas compositions use camera-like 2D transforms.
- No lyrics? The audio-only visualizer cycles through all 30 distinctive scenes, with different variations across a track.

The design is inspired by the **architectural concepts** of https://github.com/mexicat/pdoom-video and reference images of Videobolt lyric videos. No proprietary templates, music recordings or other creators' graphical assets are embedded in the project.


## Audio source chooser and fullscreen live controls

**Select Audio Source** in the upper-right corner of the visualization, or open the **Controls** drawer in Cinema Mode and choose a source.

| Input | Support | Notes |
| --- | --- | --- |
| Local music file | Supported | Load MP3/M4A/WAV/other browser-compatible files from the tablet. Beat tracking uses the actual file data and the player clock provides lyric positioning. |
| Microphone | Supported with permission | Uses Web Audio getUserMedia to analyze sound from nearby speakers. Requires HTTPS and mic permission. Does not record or upload. |
| System/tab audio | Experimental; typically desktop Chrome | Uses getDisplayMedia after a user click, requests browser screen/tab sharing *with audio*, and analyzes only if an audio track was granted. Android browsers normally do not expose other apps' audio. No screen contents are stored or uploaded. Video track remains active during capture as required by some browsers and ends on disconnect. |
| Internet radio | Conditional | Plays a direct HTTPS audio stream through a browser Audio element and Web Audio analyzer. Station must permit cross-origin loading (CORS); web pages, embedded players, DRM-protected streams and playlist URLs may not work. |
| SoundCloud | Guidance only | Unlicensed copying/decoding an embedded cross-origin player is not implemented. Open SoundCloud in its own app/page and use permitted microphone capture from a different playback device. |
| Virtual audio device | Desktop guidance only | Routing requires external operating-system audio software; a website cannot install or access a virtual device automatically. |

The source chooser gives visible errors on unsupported paths and provides a **Disconnect** action for system or radio audio. Starting local music or microphone playback switches away from other active sources. Spotify currently-playing metadata remains separate from the audio analyzer and does not drive prohibited visual or lyric synchronization.

**Cinema Mode:** tap **Cinema Mode**, then use the floating **Controls** button to open a touch-friendly drawer. You can select audio sources, manually switch scenes, toggle auto-direct, change sensitivity and motion blur, pause visuals, and adjust lyric delay. A separate **Exit cinema mode** button remains visible; tapping the artwork toggles the drawer rather than accidentally ending the presentation. Android browsers may not permit real fullscreen; the UI still enters clean presentation mode when fullscreen is blocked.

**Lyrics Delay vs. LRC Offset:** two independent controls are now available below the lyric display.

- **File timestamp offset** corrects time alignment in the actual LRC file. A positive offset advances the lyrics.
- **Lyrics Delay** shifts their display relative to playback. A **positive** delay shows words **later**; a **negative** delay shows them **earlier**. Use ±0.25-second buttons, type a signed value (−30 to +30 seconds), or reset to zero. This delay is also available in the fullscreen drawer.
- The synchronized lyric engine uses `playbackTime + fileOffset - lyricsDelay` everywhere—including the cinematic timeline—so the adjustment affects both displayed text and lyric-aware scene timing. Delay can be changed during playback.

## Three independent visual engines — first quality milestone

LyricFlow has thirty selectable scenes. **Three of these have been rebuilt as individually art-directed showcase engines** and the remaining twenty-seven still use the earlier procedural Three.js scene families. These initial showcases are deliberately different approaches, not color variations of a shared background.

1. **Crimson Impact — Precision Spectrum:** original 64-band, logarithmically spaced frequency-response sculpture. Each thin luminous frequency blade responds to its own analyzer bin, with reflections, architectural lighting, a carefully controlled dark palette, and a stable lyric area. Inspired by the design discipline of the MIT-licensed Monstercat Rainmeter visualizer, but independently implemented.
2. **Color Riot — Generative Geometry:** bold geometric graphic design with independently frequency-driven hexagonal elements, polygon fields, concentric arcs and a kinetic central structure. Inspired by the idea of multiple audio-to-geometry mappings in the original Party Mode project. It does not copy Party Mode's CC BY-NC source code.
3. **Glass Architecture — Cinematic 3D:** a hand-composed structure of edge-lit crystalline towers, orbiting rings, reflective-looking glass and controlled camera motion. Built in Three.js and GLSL.

`src/visualization/cinematic/procedural/GraphicCompositions.ts` contains the two original Canvas scene designs.
`src/visualization/cinematic/procedural/ThreeEngine.ts` contains the perspective 3D renderer. Other 3D scene families remain available for comparison.

**Rendering architecture:** two separate browser display passes. One canvas paints the 3D or 2D background directly; another transparent canvas paints sharply focused lyrics independently. No GPU-to-2D canvas image copy is performed every frame. Temporal afterimage blur applies only to background movement, not lyric typography.

**Audio:** the existing on-device Web Audio analyzer now exposes **64 smoothed logarithmic frequency bands** covering approximately 32Hz–14kHz (limited by the sample rate), in addition to loudness, bass/mids/treble, onset, beat and estimated BPM. A live 64-band display under LIVE AUDIO REACTIVITY makes analysis visible. Audio sensitivity remains **50% by default**. The 25ms audio sampling loop and beat detector run independently of the WebGL render loop.

**Controls:** motion blur (0–80%, default 30%), scene selection, adjustable sensitivity, quality, fullscreen Cinema Mode, manual scene control, and reduced-motion preference remain available. FPS is measured; the Balanced/Performance presets adapt rendering resolution after sustained low FPS. No specific FPS is guaranteed on Android tablets.

**Availability and licensing:** artwork is generated from code—no external scene images or image downloads. The audio stays on device. The Monstercat and Party Mode sources were analyzed as technical/design references, not vendored or redistributed.

### Compare the three showcase scenes

Open [LyricFlow in StackBlitz](https://stackblitz.com/github/steveharrisantony-beep/lyricflow). Upload an audio file you have permission to use, then choose **Crimson Impact**, **Color Riot**, and **Glass Architecture** from the scene library. Each card has a **SIGNATURE ENGINE** badge. Turn off **Auto-direct cinematic scenes** when comparing manually. Set motion blur to **0%** first, then try **20–35%**. The stage status reports **SPECTRUM 64B**, **GENERATIVE GEOMETRY**, **WEBGL 3D**, or **CANVAS FALLBACK**.

The other scene designs remain functional but have not yet received the same level of custom art direction. They should be evaluated against the new three before expanding the collection.

## Premium typography (self-hosted)

The legacy DM Sans, Manrope and generic system-font presets were replaced in the lyric engine. LyricFlow bundles **19 free and open-source Fontsource families** locally, including Anton, Bebas Neue, Cormorant Garamond, Orbitron, Rubik Dirt, Unbounded, Space Mono, Bodoni Moda, Cinzel Decorative, Fraunces, Syne, Abril Fatface, Press Start 2P, Caveat, Righteous, Chakra Petch, Black Ops One, Bricolage Grotesque, and Space Grotesk for the interface. The user pays nothing for these fonts and no runtime Google Fonts request is needed.

The font registry chooses distinct packs per scene; the scene-selection engine also uses the manual genre preset. Malayalam, Tamil and Devanagari rely on a native-script font fallback when a Latin display font does not cover those scripts. The original lyrics are never replaced by Romanization.

## Main-screen order

1. Cinematic animation canvas
2. **LIVE AUDIO REACTIVITY** and independent Spectrum gain
3. **MUSIC PLAYER** and **FIND LYRICS**
4. **LYRICS & SCENE DIRECTOR**
5. **CINEMATIC SCENE LIBRARY** (all 30)
6. Live Microphone, optional Spotify metadata section, and footer

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
4. Most scenes use procedural Three.js geometry; two showcase compositions and the WebGL fallback use Canvas 2D. Cinematic quality and performance require actual tablet evaluation. Soft shadow maps are disabled in Performance quality.
5. Third-party provider availability, lyrics rights, Android microphone permissions and local storage persistence depend on browser and source restrictions.

This README describes the **current cinematic rebuild**; earlier prototype documentation should not be used to infer features that are no longer present.
