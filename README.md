# LyricFlow — Stage 1

Premium browser-based visualizer prototype for touchscreens, built with **React + TypeScript + Vite + Canvas 2D**.

## Open in StackBlitz
https://stackblitz.com/github/steveharrisantony-beep/lyricflow

The StackBlitz editor will normally install dependencies and start a preview. If it does not, open the editor's terminal and run:
```
npm install
npm run dev
```

## Stage 1 features
- Four animated scenes: atmosphere, flowing light trails, geometry, kinetic typography
- Demo mode with simulated music energy
- Scene selection, intensity and speed controls
- High, Balanced and Performance settings
- Fullscreen (where supported), pause/resume and reduced motion
- Approximate FPS readout, tablet-responsive touchscreen controls
- Scene rendering isolated from React rerenders via requestAnimationFrame

**Stage 1 is a demo:** microphone listening, lyric synchronization, track identification, Spotify, external APIs and backend storage are not implemented. All visualization happens locally in the browser. Canvas 2D does not require WebGL.

## Build
```
npm run typecheck
npm run build
```

The GitHub files were uploaded for direct StackBlitz import. Production build and Android device behavior still need to be verified in a browser environment.

## Cost
All included packages are open-source and no paid services or API keys are required.


## Local music player (new preview feature)
Use **Choose MP3 / Audio** in the application to pick an MP3, WAV, M4A, OGG, or another browser-decodable audio file from your tablet. Tap Play; the scenes respond to analyzed playback energy. Pause, seek, adjust volume, or remove the file at any time.

The player uses `URL.createObjectURL`, `HTMLAudioElement`, `AudioContext`, `MediaElementAudioSourceNode`, and `AnalyserNode`. The original file does not leave the device, and no recording or upload endpoint exists. Playback requires a user gesture. Browser codec support varies.

**Spotify synchronization is deliberately not implemented.** Spotify's current Developer Policy prohibits synchronizing recordings with visual media without appropriate authorization. Do not attach the Spotify player or playback state to visuals.

When the local track is paused or removed, demo mode returns to simulated energy (when enabled).

## Current verification
Eight prior Stage 1 tablet interaction tests were user-verified. The local player is newly implemented and still requires a fresh StackBlitz build plus on-tablet playback test. No claim of completed microphone, lyrics, AI, Spotify, or deployment features is made.


## Spotify metadata discovery (optional; NO synchronization)
The Spotify discovery panel can connect to a Spotify developer application using OAuth 2.0 PKCE (no client secret). It requests `user-read-currently-playing` and refreshes the token when needed. Track name, artist, album, and track URL are shown **only in a separate metadata panel**. Player time, Spotify audio, and Spotify metadata are **not connected to the lyrics timeline or visualizer engine**.

To configure:
1. Create a Spotify app using the official Spotify developer dashboard, subject to account and development-mode eligibility.
2. Open LyricFlow as a standalone page. Copy the **exact redirect URI** displayed in its Spotify section into your application's Redirect URIs on the Spotify developer dashboard. Spotify applies redirect URI security restrictions; localhost may be treated differently from HTTPS remote sites.
3. Paste **only the public Client ID** into the LyricFlow field. Never paste a Client Secret, access token, or refresh token.
4. Choose Connect Spotify; sign in and consent. The PKCE callback returns to the same URL.
5. If the API denies access, check eligibility, scopes, user allowlist, account tier, and approved redirect URIs.

OAuth session data is held in browser **sessionStorage** and will normally disappear when the tab's session ends; the integration does not use a backend. Do not embed or transmit credentials in source code.

Relevant policy: https://developer.spotify.com/policy and https://developer.spotify.com/compliance-tips. Spotify expressly prohibits synchronizing Spotify recordings with other recordings, lyrics or visual media, even for a noncommercial developer project without authorization.

## Manual LRC lyrics
In the **Local Timed Lyrics** section, click Edit Lyrics, enter user-authorized lines in `[mm:ss.xx]Text` format, and optionally supply corresponding romanized lines separately. The local MP3 playback clock selects each line. Adjust the offset manually if your timestamps need correction. A clearly original demo sample is included. No online lyrics are fetched; lyrics are kept in memory for this prototype and vanish after a refresh.

LRCLIB has an official CORS-capable, freely accessible lyrics API (https://lrclib.net/docs). However, its free API access does not necessarily grant public-display, reproduction, or caching rights for every third-party copyrighted lyric. We have **not** wired it to automatic display until rights and acceptable usage are established. JioSaavn community proxies and unofficial Google GTX endpoints are similarly not wired in. Automatic Indian-language romanization has **not** been implemented; the Romanized field accepts manual corrections without altering the original lyrics.

## Verification status
The Spotify OAuth flow and local LRC editor were committed to GitHub, but have **not yet been verified** with actual Spotify credentials, Android browser testing, or a successful production build. Test in StackBlitz before relying on them.


## 3D Lyric Cinema (incremental prototype)
This release introduces a **Three.js WebGL overlay** with depth-layered kinetic typography, three smoothly interpolated camera paths, original/romanized timed lyric cues, estimated word emphasis, and a deterministic vocabulary of visual moods. It uses the local playback clock; manual timed lyric input is needed. Audio sensitivity is adjustable (default 35%) and affects the local frequency/RMS signal only. Enable **Auto scenes from lyrics** to map lyric mood to the existing background scene families.

**Cinema Mode** enters fullscreen where supported and hides the entire interface except the rendered effects and 3D lyrics. Tap anywhere on the canvas to leave it (or use the Android Back key / Escape). If fullscreen permission is unavailable the same clean presentation is used in the tab.

This is an original, reusable prototype inspired by the *architectural ideas* in https://github.com/mexicat/pdoom-video, not a copy of its song-specific scenes. It does **not** yet offer automatically sourced lyrics, verified word alignment, intelligent contextual AI interpretation, high-end shader postprocessing, exact musical downbeat detection, or 4K60 guarantees. Word timings are currently proportionally **estimated** between supplied line timestamps. WebGL is required for the true 3D overlay; existing Canvas visuals still work if it is unavailable.

Recommended tablet acceptance checks: open local audio, add timestamped lyric lines, enable auto-scene selection, seek through sections, compare camera perspectives, lower Audio sensitivity to 15-30% if the visualizer overreacts, and activate Cinema Mode. Confirm the user can tap to exit.


---

# LyricFlow — Lyric Director & Local Discovery Upgrade (October 2026)

This section describes the **current** implementation and supersedes older statements in this README saying microphone listening, automatic discovery, or Romanization are entirely absent.

## From MP3 filename to permitted lyric scenes

1. Choose a local MP3 (or supported audio) from the Xiaomi Pad 8.
2. LyricFlow guesses the title and artist from the filename, removes common bitrate/tags, and shows the estimate as **unverified**.
3. The **Find Lyrics** panel searches LRCLIB track *candidate metadata* using its documented browser API. It ranks matching results by normalized title, artist and recorded duration. Nothing is selected automatically.
4. Correct the artist/title if necessary; these corrections persist locally for that filename in `localStorage`.
5. Confirm the exact song version and provide the separate permission confirmation before retrieving a selected record's lyric text. Provider lyrics are only held in memory, not automatically saved to a library.
6. Alternatively, import your permitted `.lrc` or `.txt`, use a saved user-owned library entry, or paste lyrics manually. If only plain lyrics are available, you may explicitly create **approximate** timestamps; this does not mean the vocals were accurately aligned.
7. The separate **Local Timed Lyrics** editor supports native-script, Romanized, and combined display. It uses open-source Sanscript locally for rough Malayalam/Tamil/Devanagari romanization, without sending text to any AI service. It preserves original lyrics and allows corrections. The result is not a phonetic guarantee.
8. Enhanced LRC word timing tags like `<00:12.34>` are read when provided; otherwise per-word timing is marked *estimated* from line duration.
9. You can optionally save lyrics to the browser library **only after affirming you have permission to store them**. Library entries are searchable by matching title/artist on the device and do not synchronize across devices.

Provider: https://lrclib.net/docs. LRCLIB's free API is *not a universal reproduction license*. The application does not scrape Spotify, JioSaavn, Google GTX, or other sites.

## Contextual scenes and typography

- Lyric analysis groups consecutive lines into sections, applies contextual theme and mood scoring, and favors continuity instead of switching for every keyword.
- Visual families include rain/water, stars/space, flame/embers, celebrations, nature, memory, warmth, solitude and abstract music-only output.
- Three.js renders persistent particles, lines, rings and large animated typography in 3D space, with multiple interpolated camera paths.
- **Camera view** in the scene selector: Automatic, Front, Orbit, Side or Top.
- **Genre presets**, when selected by the user, change typography: editorial serif (ballad/classical/cinematic), strong expressive display (rock/metal), mono (hip-hop) and clean grotesk (pop/electronic).
- Rendering is based on the local media playback time when available. Lyric line/word timing remains approximate unless trustworthy timestamps are supplied. Auto lyric analysis happens on lyric changes, not inside animation frames.
- The original 2D scene renderer remains available as an audio-only / WebGL fallback.

This is an original, reusable real-time engine inspired by **concepts** from https://github.com/mexicat/pdoom-video. It is **not** a full port, not identical to pdoom-video, and does not contain its copyrighted song, lyrics or scene artwork.

## Independent microphone mode

Use **Start Listening** on the tablet to analyze nearby sounds from another device. The microphone requires HTTPS and a user gesture, and may be blocked inside an embedded StackBlitz preview; opening the preview in its own tab can help. **Stop Listening** stops microphone tracks and closes its AudioContext. There is no recording, storage, upload or connection to the speaker output.

The analyser provides rough loudness, bass/mid/treble, onset, beat, grouped downbeat pulses, estimated BPM with confidence, and broad quiet/steady/building/energetic energy sections. Microphone timing is *not* accurate song-position or word-level lyric synchronization. Local MP3 audio takes priority over microphone input.

**Spotify**: The account panel remains separate and metadata-only. Per Spotify's Developer Policy https://developer.spotify.com/policy, LyricFlow does not use Spotify sound recordings, progress, or metadata to synchronize visuals or lyrics without the required permission. A personal, non-commercial project is not exempt.

## Settings

- Default audio sensitivity: **14%**, adjustable from 0% to 100%.
- Scene intensity and animation speed remain separate controls.
- Quality: High/Balanced/Performance. A reduced-motion option remains available.
- **Cinema Mode** hides all UI controls, showing motion graphics and timed lyrics; tap the visualizer to exit.

## Verification

GitHub Actions runs `npm run typecheck`, `npm test` (Vitest utility tests), then `npm run build`. Runtime performance, microphone permissions, font fallback and actual cinematic quality still require on-device testing on the Xiaomi Pad 8.

## Known limitations

- Audio onset/tempo/section identification is approximate and not offline beat-grid or stem analysis.
- Forced alignment from recorded vocals to word timings is **not implemented**. User-provided enhanced LRC gives better precision.
- Semantic analysis is a local deterministic heuristic, not true multilingual natural-language understanding.
- Sanscript phonetic approximations need user correction for real Manglish, Tanglish and Hinglish.
- Third-party lyrics are only retrieved after explicit permission confirmation, and are not automatically cached.
- Spotify currently-playing progress is not connected to lyrics or visual scenes.
- Browser local libraries are per-browser and may be erased by clearing site data; no account sync.
- True cinematic quality comparable to pdoom-video will require further authored scene templates, musical analysis and real tablet performance profiling.

### Testing on Android

1. Open https://stackblitz.com/github/steveharrisantony-beep/lyricflow (refresh or reopen to get the latest commit).
2. Choose an MP3. Check that its guessed title appears in **Find Lyrics**, correct the artist, and inspect the match candidates.
3. Only select lyrics you have permission to use. Otherwise import your own LRC via **Edit / import lyrics**.
4. Add line or enhanced word timestamps; enable automatic scenes and choose a genre preset if known.
5. Press Play and observe the FPS/audio metrics, different themed scenes, camera view options and Cinema Mode.
6. Lower sensitivity further if motion is excessive. To try nearby music, pause local playback, click **Start Listening**, and play audio through a separate phone's speakers.
7. If WebGL or microphone permissions fail in StackBlitz's embedded preview, open the preview as a standalone browser tab.

No paid provider, API token, credit card, database or backend is required for the locally controlled features in this upgrade.
