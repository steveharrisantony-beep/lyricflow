# LyricFlow — Cinematic Lyric Visualizer

A browser-based, locally reactive music visualizer for Android tablets. Built with **React, TypeScript, Vite, Canvas 2D and the Web Audio API**, without a paid graphics or AI service.

## Open on Xiaomi Pad 8

**[Launch in StackBlitz](https://stackblitz.com/github/steveharrisantony-beep/lyricflow)**

1. Open the link in your tablet's browser and wait for the project to build.
2. In **Local Music Player**, choose an MP3 from your tablet and press Play.
3. In **Find Lyrics**, review the filename-derived title/artist and correct them if necessary. You may inspect LRCLIB metadata candidates; choose only the correct version and retrieve text only if you have permission.
4. Alternatively, use **Edit / import lyrics** to import an authorized `.lrc`/text file or load the clearly labeled original sample.
5. Choose **Auto-direct cinematic scenes** to build a storyline from lyric sections, or tap one of the twelve templates for a manual override.
6. Use **Cinema Mode** for a full-window performance without controls; tap the stage to exit.
7. Check the **Song Storyboard** beneath the lyric panel for planned scene names, transitions, typography and timings.

The music player, microphone, visualizer and manual lyric entry all continue to work without a backend.

## Twelve original cinematic templates

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

These are **implemented, procedural motion-graphic templates**, not licensed Videobolt templates or pre-rendered videos. The effects draw using native Canvas 2D to stay lightweight on Android; some are stylized 2.5D perspective effects, not full 3D meshes or volumetric ray tracing. This is an iterative foundation rather than a promise of production-quality video rendering.

The old Atmosphere / Light Trails / Geometry / Kinetic Type scenes and former Three.js overlay were removed. The current stage uses **one requestAnimationFrame renderer** instead of overlapping animation engines. The audio player, lyrics provider adapters, local library, Romanization, microphone, and Spotify metadata panel were preserved.

## Scene direction, timing and anti-repetition

Lyrics are analyzed **when loaded or edited**, not on every rendered frame. The existing heuristic `sceneDirector` groups lyric lines into coherent sections and estimates imagery/mood; the new `cinematic/catalog` translates them into one of twelve templates using the selected genre, target energy, scene-family variety and recent scene history.

- The scheduler generates a **deterministic timeline**. Seeking in the local player selects the appropriate scene and word.
- Consecutive templates have a three-scene anti-repetition penalty; intentional chorus callbacks and richer phrase analysis remain future work.
- Long lyrical sections can contain multiple visual templates rather than one endless repeating effect.
- Native lyric text is preserved, with separate editable approximate Romanization. Actual enhanced-LRC word timestamps are used when provided; otherwise word positions are labeled **estimated** and are not precise vocal alignment.
- Font **packs** vary by template and genre: industrial condensed, editorial serif, rounded pop, techno display, distressed, mono and literary.
- Camera options change the movement and perspective illusion. The current renderer is 2D/2.5D, so these are **camera-like transforms**, not freely movable 3D cameras.
- No lyrics? The visualizer cycles among distinctive audio-reactive instrumental scenes instead of stopping.

The design is inspired by the **architectural concepts** of https://github.com/mexicat/pdoom-video and reference images of Videobolt lyric videos. No proprietary templates, music recordings or other creators' graphical assets are embedded in the project.

## Music input and visual response

**Local file playback** is recommended for accurate timelines. It provides real playback time, file seeking, loudness, bass/mid/treble bands, rough onset/beat estimation, estimated BPM, heuristic downbeat pulses and crude musical-section energy categories. Effects react to the measured data while their cinematic compositions change less frequently.

**Live microphone mode** separately listens to nearby music from a phone. It asks permission only when you press Start Listening, analyzes audio on the tablet without recording/uploading it, and stops and closes the microphone when listening ends. Microphone input alone cannot identify exact lyric timestamps or provide perfect beat/downbeat detection.

The **audio sensitivity defaults to 14%** and remains adjustable. Quality presets and reduced-motion mode are available. Performance depends on tablet hardware and browser.

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

## Known limitations / future work

1. Sophisticated pdoom-style choreographed typography and production-ready video-quality shaders remain future work.
2. Current lyric emotion/theme analysis is a deterministic heuristic and cannot fully understand Malayalam/Tamil/Hindi lyrical context.
3. True forced vocal alignment, verified downbeat grids, and music phrase/chorus detection are not yet implemented.
4. The new renderer is Canvas 2D, not a fully 3D camera scene. Complex assets, textures and advanced postprocessing would need additional work and performance measurement.
5. Third-party provider availability, lyrics rights, Android microphone permissions and local storage persistence depend on browser and source restrictions.

This README describes the **current cinematic rebuild**; earlier prototype documentation should not be used to infer features that are no longer present.
