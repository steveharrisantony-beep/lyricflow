# LyricFlow — Music and lyric motion graphics

A browser visualizer built with React, TypeScript, Vite, Three.js/WebGL, Canvas 2D
and Web Audio. Audio analysis runs on your device. The scene library contains
**40 themes: 28 WebGL worlds and 12 Canvas compositions**, including ten new 2D
motion themes. No paid graphics or AI service is required.

## Open in your browser

- **Frontend:** [Open StackBlitz](https://stackblitz.com/github/steveharrisantony-beep/lyricflow).
  Local music, microphone, permitted direct streams, lyrics and scenes work here.
- **Frontend and music resolver:** [Open GitHub Codespaces](https://codespaces.new/steveharrisantony-beep/lyricflow).
  The devcontainer installs dependencies and starts both services. Open forwarded
  port **5173** after setup. Vite proxies `/music` to the resolver on port 8000.
  Your GitHub access and Codespaces usage limits apply.

Choose **Audio Source**, then load a local file or search a connected catalog.
Choose a scene in **All 40**, **2D motion** or **3D worlds**. **Auto-direct** follows
lyric sections when available and cycles through all themes otherwise. Cinema
Mode provides a controls drawer with scene selection, playback, seeking,
sensitivity, spectrum gain, blur and lyric delay.

## Music search and playback

| Source | Connection | Mechanism |
| --- | --- | --- |
| YouTube Music | Music resolver | Public song search with ytmusicapi; yt-dlp resolves the selected recording |
| SoundCloud | Music resolver | yt-dlp catalog search and playback resolution; progressive or HLS audio |
| JioSaavn | Music resolver | Public catalog search; yt-dlp resolves the selected song page |
| YouTube | Music resolver | yt-dlp public recording search and playback resolution |
| Audius | Direct browser API | Public Audius catalog; gated/unstreamable results excluded |
| Local file | No server | Browser-supported audio from your device |
| Microphone | HTTPS and permission | Nearby sound analysis; no recording or upload |
| System/tab audio | Browser-dependent | Shared audio with permission; generally unavailable on Android |
| Internet radio | Direct HTTPS stream | Source must permit browser playback and Web Audio access |

**The resolver is included as code, not a deployed service.** Use Codespaces with
both services, or host [`server`](server/README.md) and save its HTTPS URL under
**Audio Source → Search settings**. A frontend-only host cannot execute Python.
On a tablet, `localhost` means the tablet, not a remote server.

Search metadata and audio resolution are separate. Playback uses one media
player, so the analyzer, seek control and lyrics follow the same audio clock.
HLS support loads on demand. Source availability varies by country, recording,
server IP and provider changes. A search result does not guarantee playable audio.
No login cookies, Spotify audio extraction or restricted-content bypass is used.

## Lyrics and synchronization

1. Correct the selected recording's title and artist under **Find Lyrics**.
2. Confirm permission to display the lyrics and enable **Automatically load
   matching timed lyrics**, or choose a candidate manually.
3. Import an authorized LRC file under **Edit / import lyrics** if no match exists.

Automatic matching checks the permitted local library, then LRCLIB exact lookup,
then search. It requires matching title/artist, timed lyrics and recording length
within five seconds. Different versions still require confirmation. Upload labels
such as `(Official Audio)` and artist `- Topic` suffixes are cleaned; live/remix
markers are preserved. Transient network/5xx errors retry with bounded backoff.
Rate limits remain visible. Search payloads containing timestamps are reused,
avoiding a redundant fetch. Requests are cancelled when recording or mode changes.
Fetched text is held in memory for the session and is only saved when requested.

Line timing uses `HTMLAudioElement.currentTime`, including pause and seek.
**Lyrics delay** and LRC file offset are independent. Real word timestamps are
used when supplied; estimated word timings are labelled. Microphone input does
not identify songs or automatically recover a recording's vocal timing.
Original, Romanized and combined display modes remain available. Local Sanscript
provides approximate Malayalam, Tamil and Hindi transliteration; corrections and
permitted lyric entries can be stored in the local browser library.

## Motion, materials and transitions

- Adaptive band envelopes preserve new hits after sustained, compressed music.
  Bass moves and expands large forms; mids turn rings; treble animates small
  details and particles; separate beat accents expand edge rings and markers.
- Damped spring motion has stronger visible travel while architectural forms
  stay grounded. Visual intensity limits the response; spectrum gain controls
  only 64-band bar height and does not alter beat detection.
- 3D scenes use arranged arcs, layered groups and aligned architectural rows,
  leaving room for lyrics. Materials include procedural grain/gradient maps,
  bump detail, bevels, environment reflections and physical shading.
- Structural floors receive soft shadows: High uses 1024px maps, Balanced 512px,
  and Performance disables shadow maps. Quality also limits pixel count and detail.
- Scene changes composite the outgoing background with wipes, dissolves, ink/glitch
  strips, radial reveals or zooms. Lyrics stay on their own sharp canvas. Reduced
  Motion removes these transitions and reduces scene movement.
- Lyric colors sample the rendered background beneath each text anchor and choose
  readable light/dark ink. A fine opposite-color outline helps over mixed surfaces.
  Text on poster panels uses the panel's own color for contrast.

### Ten new 2D themes

| Theme | Composition |
| --- | --- |
| Paper Cut | Layered paper forms with cast shadows |
| Orbital Score | Elliptical orbits with treble satellites |
| Silk Waves | Broad, flowing frequency ribbons |
| Bauhaus Beat | Balanced circles, blocks and rhythmic bars |
| Star Map | Connected constellation points and bass orbit |
| Halftone Club | Frequency-driven dot fields and beat rings |
| Ribbon Dance | Fine, layered wave ribbons |
| Vinyl Groove | Concentric record grooves and radial accents |
| Pixel Garden | Bass-driven pixel stems and treble blooms |
| Contour Flow | Nested topographic curves with independent ripples |

The original thirty themes remain available. Crimson Impact uses a dedicated
64-band spectrum composition; Color Riot uses a generative geometric poster.
The other original themes use procedural WebGL geometry, with a Canvas fallback
when WebGL is unavailable. The lyric director generates stable section-based
schedules and avoids recent scene repetition. Mood/imagery analysis is a local
heuristic; no lyric text is sent to an AI service.

See [reference analysis](REFERENCE_REVIEW.md) for pdoom-video, party-mode, vizz.fm
and Stash code paths, adapted concepts and differences.

## Development and verification

```bash
npm ci
npm run dev                         # frontend
python -m pip install -r server/requirements.txt
npm run dev:full                    # frontend + Python resolver; Node 22+
npm run typecheck
npm test
python -m unittest server.test_app
npm run build
```

With the dev server running and Chrome available:

```bash
npm run smoke          # local audio, forty themes, lyrics, controls
npm run smoke:music    # search -> playback -> analyzer -> lyrics -> seek/delay
npm run smoke:motion   # ten 2D outputs, transitions, 3D rendering, tablet layout
npm run smoke:hls      # generated AAC/HLS playback and cleanup; requires ffmpeg
```

Browser checks use original synthetic audio and fixture provider responses.
Resolver tests check adapters, URL validation, range forwarding and HLS rewriting.
These establish integration behavior, not live provider uptime. Actual Xiaomi
Pad 8 FPS, touch feel, permissions and music availability require testing on the
tablet and chosen deployment. Software WebGL FPS is not a tablet benchmark.
The bundled fonts and Three.js make the initial build substantial; HLS loads in
a separate chunk only when needed.

## Permissions and limitations

Use recordings and lyrics you are authorized to play and display. Search results
are not proof of rights. Only explicitly saved permitted lyrics enter the browser
library; local storage does not sync between devices. Spotify's separate metadata
panel does not supply audio or drive visualization/lyric timing. No private Apple,
KuGou or YouTube lyric endpoint is used.

This is live, generative motion graphics. pdoom's hand-authored storyline, offline
stem separation, verified beat grids, forced vocal alignment and video export are
not implemented. See [Stash notes](STASH_RESEARCH.md) and the resolver setup for
source boundaries and deployment details.
