# YouTube video matching

Automatic background discovery uses YouTube web search through Innertube.
Existing account headers are supported and anonymous search is available.
The default search region is India and can be changed
with `YOUTUBE_REGION` in the embedded/backend environment.

## Matching and selection

- Search once using the song source's title, first credited artist, and the word
  `video`. Require every normalized song-title word and the primary artist in
  the video's title. Punctuation, the order of the song words, and extra words
  in the video title do not affect its rank.
- Exclude known audio, static and blocked uploads. Request player details for
  every remaining candidate to retrieve its view count. When the request fails,
  use the search view count if available.
- Wait for the searches and view lookups to finish, then choose the highest-viewed
  candidate with a known count. In Lyrics video mode, require `lyric`, `lyrics`,
  or `lyrical` in the title. Personal mappings take precedence. Recovery uses the
  same order and skips failed videos.

## Mapping picker

Show preloaded videos filters for the current recording before sorting by views.
The status shows both the search pool size and the number of relevant choices.
The list follows the active video preference. Search online starts a fresh
YouTube search with the current song title in an editable field. Relevance shows
the provider order and Views shows the most-viewed results first. Sorting uses the
current online results. The background changes when the user selects Use video.
Known static and blocked videos are excluded in both lists. Full video titles
are used when available.

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

