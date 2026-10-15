# Stash reference review and LyricFlow implementation

Inspected https://github.com/rawnaldclark/Stash on 15 October 2026.
No Stash source code is copied or vendored. Stash is GPL-3.0 licensed; the files
added here independently implement the architecture using browser APIs and
provider adapters.

## What the reference does

- README describes Spotify/YouTube library metadata, native yt-dlp audio
  resolution, optional lossless sources and a JioSaavn fallback. Its Android
  process has capabilities unavailable to a static browser app.
- `data/lyrics/.../source/LrclibLyricsSource.kt` performs a single exact lookup
  using title, artist and recording duration, followed by fuzzy search on a miss.
  It distinguishes a definitive miss from a provider/network failure.
- `data/lyrics/.../LyricsRepository.kt` owns the ordered lyric-source chain,
  concurrent lookup sharing and cached lyric results. Its sources include Apple
  TTML through third-party endpoints, LRCLIB, KuGou and YouTube Music fallback.
- `feature/nowplaying/.../NowPlayingViewModel.kt` exposes the actual player
  position separately from general UI state and applies the lyric timing offset.
  Lyrics therefore follow playback, rather than a guessed music/beat clock.

## What was adapted

LyricFlow now separates search metadata, playback resolution and timed lyric
lookup. Public Audius search is available without the optional resolver; broader
YouTube Music, SoundCloud and JioSaavn search uses the included Python service. The browser never runs
native extraction code. An exact LRCLIB lookup and unambiguous search fallback
feed the existing line/word timestamp renderer. Permission-confirmed local
library entries are preferred. Playback, seek, pause and lyric delay use the same
media clock. Uncertain lyric matches require selection.

LyricFlow does not implement Stash account-cookie login, Spotify playback
extraction, Qobuz downloads, Apple lyric proxy endpoints,
KuGou access or YouTube private lyric APIs. No claim is made that a public API or
search result grants permission to synchronize a recording or reproduce lyrics.
Use sources/recordings for which you have the necessary permissions.

## Running and verification

- `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.
- `python -m pip install -r server/requirements.txt` then
  `python -m unittest server.test_app` verifies resolver contracts without network.
- `npm run dev:full` starts Vite plus the private resolver; the devcontainer starts
  it in a browser Codespace. Frontend-only hosting must connect a separate server.
- `npm run smoke:music` exercises search → source resolution → real browser media
  playback → analyzer → automatic timed lyrics → seek/delay → cinema controls,
  using original synthetic audio and mocked external API responses. This tests
  integration contracts, not current third-party service uptime or catalog rights.
- `npm run smoke` covers existing local audio, scenes and canvas output.

Live Audius/LRCLIB/YouTube availability, production cross-origin behavior, source
extraction and Xiaomi Pad 8 performance need testing from the deployed origin.
A local or fixture-based pass cannot establish those outcomes. Search cannot
promise "any song"; sources can miss, restrict, remove or block recordings.
