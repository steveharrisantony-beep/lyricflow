# YouTube video matching

Background discovery uses unofficial Innertube search from YouTube Music's
**videos** catalogue and YouTube web search. It does not call YouTube Data API
search or need a YouTube API key. Existing account headers are supported; anonymous
search remains available. The default search region is India and can be changed
with `YOUTUBE_REGION` in the embedded/backend environment.

## Matching and selection

- Identify a YouTube Music catalogue song by title, artist, album and recording
  duration. Look for its linked video in the Song/Video switcher. Use catalogue
  audio only as a recording reference.
- Pool and deduplicate artist, short-title and album/movie video searches.
  Preserve credited artists, uploader channel IDs, badges, video type, views
  and known embedding restrictions. Keep account-specific lookups separate.
- Match the title and version. When the artist is known, require a full artist
  match or a distinct album/movie match, and reject conflicting recording credits.
  Sort only the remaining videos by views. Duration filters obvious clips and
  compilations.
- Wait for the search pool to finish and play the first preloaded choice.
  Personal mappings take precedence. Published delays apply only to the video
  they describe. Recovery skips failed videos in the same preloaded list.

## Mapping picker

Show preloaded videos filters for the current recording before sorting by views.
The status shows both the search pool size and the number of relevant choices.
Both music and lyric videos can appear in this list. A new search for the
current song replaces the shared picker and playback results together. A custom online query can
still search for a different recording. Known static and blocked videos are
excluded in both cases. Full video titles are used when available.

## Video-only backgrounds

Topic/art tracks, official audio, album/cover art, known static-image uploads,
photo backgrounds, visualizers and podcasts are excluded from background
candidates, including pasted links. Thumbnails remain previews in the picker;
they are never promoted to stage backgrounds. Existing procedural themes remain
the fallback while searching or when no suitable video is available.

Innertube metadata identifies known static uploads and music-video types; it
cannot prove frame-by-frame motion in every misleadingly labelled third-party
upload. A known static classification always wins when merging duplicate data.

## Reference implementations

The matching and parsing are implemented in TypeScript for the on-device Node
runtime, using these approaches without embedding their Python apps or downloaders:

- [sigma67/ytmusicapi](https://github.com/sigma67/ytmusicapi): filtered video search,
  structured artist credits, video types and metadata extraction (MIT).
- [Tyrrrz/YoutubeExplode](https://github.com/Tyrrrz/YoutubeExplode): video-only web
  search, video ID deduplication and alternative uploader channel fields.
- [spotDL/spotify-downloader](https://github.com/spotDL/spotify-downloader): match
  check recording identity before considering popularity.
- [music-assistant/server](https://github.com/music-assistant/server): recording
  identity/version checks and explicit match-confidence levels.

No GPL downloader implementation is copied into the app. There are no new runtime
dependencies, media downloads, recording, or external backend requirements.

## Verification

`src/tests/video-ranking-regressions.test.ts` covers all permutations of the old
sort cycle, the 79.7K/18M case, misleading publisher names, intro tolerance,
recording versions, static rejection and late candidates. `server/youtubeSearch.test.ts`
covers catalogue counterpart discovery, uploader metadata, complete-pool
merging, account isolation and retries. `src/tests/video-relevance.test.ts`
checks relevance and view order. The normal app and embedded-backend
checks also apply. Live service availability and Xiaomi playback require device testing.

