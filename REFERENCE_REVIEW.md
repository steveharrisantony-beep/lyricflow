# Motion graphics and music-source reference review

Reviewed source on 15 October 2026. Implementations in LyricFlow are independent;
no reference music, fonts, artwork or scene source has been copied.

## mexicat/pdoom-video

Reference: https://github.com/mexicat/pdoom-video (MIT).

Inspected `app/src/engine/audio.ts`, `engine/engine.ts`, `engine/scene.ts`,
`engine/util.ts`, `timeline.ts` and scene modules including `scenes/shoggoth.ts`.
Its music video is authored for one recording, with precomputed envelopes,
separate kick/snare/hat events, stem features, aligned word timings and a beat grid.
The timeline anchors scene changes to particular lyrics and beats. Rendering
passes local time, beat phase, transition overlap and the previous scene texture
to composed scene modules. Spring responses and decaying hits make accents crisp.

Adapted: separate instrument roles and transient response, deliberately arranged
layers, lyric-section direction and actual background compositing on scene changes.
LyricFlow computes live frequency envelopes instead of offline stems, uses its
existing LRC/media clock and applies generative themes to arbitrary recordings.
It does not reproduce pdoom's song-specific story, scene assets or alignment model.

## preziotte/party-mode and vizz.fm

Reference: https://github.com/preziotte/party-mode and https://vizz.fm/.

Inspected party-mode `js/main.js`, including `getByteFrequencyData`, normalization,
`kickDetect`, and the circle/chop/grid/equal/spin/hexbin/voronoi visualizer routing.
It maps sampled audio values into different families of visual marks. The public
vizz.fm product describes per-visualizer controls, sensitivity/gain adjustment,
audio mapping and multiple input choices; no claim is made to have reviewed its
private/current implementation.

Adapted: ten separate Canvas drawing grammars, explicit source choices, independent
spectrum gain, theme filtering and stronger independent frequency-driven elements.
This does not port the old d3 runtime or reproduce vizz's effects stack.

## rawnaldclark/Stash

Reference: https://github.com/rawnaldclark/Stash (GPL-3.0).

Inspected `data/lyrics/.../LrclibLyricsSource.kt`, `LyricsRepository.kt`, and
`data/download/.../jiosaavn/JioSaavnClient.kt`. Stash separates catalog matching,
stream resolution and lyric lookup. Its LRCLIB source distinguishes transport
errors from definitive misses, uses exact get then search, and tolerates small
recording-duration differences. Its Saavn adapter uses public catalog search and
validates source media. It also has native capabilities absent from a static page.

Adapted: public YouTube Music search via ytmusicapi, SoundCloud search via yt-dlp,
JioSaavn public catalog search and yt-dlp song resolution in the optional Python
service. Browser playback accepts progressive and HLS audio through validated
proxy resources. Metadata and source identity are preserved. Lyric requests use
bounded network retries without the custom header that required CORS preflight;
already-returned timestamps avoid another retrieval. Upload-wrapper metadata is
cleaned without deleting live/remix version markers.

No Stash source code or encryption/decryption routine is copied. No cookie login,
Spotify audio extraction, restricted-content bypass or private lyric proxy is added.
Live source availability still depends on the provider and deployed network.

## Verification boundaries

TypeScript/unit/contract tests and browser fixtures cover the implemented flow.
Synthetic audio verifies media playback, analyzer output, timestamped lyrics,
seek/delay, HLS, transition completion, distinct scene pixels and tablet layout.
Live YouTube Music search returned 12 results. Other provider attempts in this
environment encountered TLS/DNS restrictions;
fixture passes must not be described as proof that each live catalog works from
all cloud hosts. Verify a permitted recording from the selected deployment.
