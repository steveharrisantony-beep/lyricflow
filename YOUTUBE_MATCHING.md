# YouTube video matching

Background discovery uses unofficial Innertube search from YouTube Music's
**videos** catalogue and YouTube web search. It does not call YouTube Data API
search or need a YouTube API key. Existing account headers are supported; anonymous
search remains available. The default search region is India and can be changed
with `YOUTUBE_REGION` in the embedded/backend environment.

## Matching and selection

- Pool artist-qualified, short-title and album/movie queries. Deduplicate complete
  query/source pools before ranking; explicit-video results are not discarded
  just because a base query filled its first page.
- Retain actual artist credits, channel IDs, verification badges, video type,
  duration and views. Fill missing statistics using unofficial player metadata
  for a bounded shortlist. Missing metadata stays unknown rather than becoming
  invented evidence. Search requests and metadata lookups are cached briefly and
  partitioned by account; identical in-flight requests share their work.
- Match title, artist, album/movie and version first. A publisher's display name
  or the words "Full Song" cannot excuse an artist/album mismatch. Generic names
  containing "Records" do not establish affiliation. Verified or structured
  artist evidence is stronger than an unverified display-name match.
- Compute an identity shortlist once, then use one consistent score and a stable
  video-ID tie-break. Popularity helps choose between credible recordings. Video
  intros and movie edits have a softer duration penalty than short clips or
  unrelated recordings. Music/lyrical preference is preserved.
- Automatic playback requires a confidence threshold. A manual custom query may
  offer another recording as an explicit user choice, but it cannot bypass
  video-suitability checks. Latest saved personal mappings continue to override
  automatic discovery.

## Mapping picker

The Lyrics/Music video preference is in Song Mapping. Automatic selection uses
the recording and release checks above. The preloaded/manual picker retains the
complete pool of video results independently of the automatic shortlist, rejects
known static/audio uploads, and sorts every available choice by descending views.
Its status distinguishes total search results from videos available to choose;
there is no hidden 15-result display cap. Full YouTube titles are retained when
the YouTube Music catalogue supplies a shorter title, including lyric-video labels.

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
- [spotDL/spotify-downloader](https://github.com/spotDL/spotify-downloader): match
  recording identity first, shortlist close matches, then consider popularity.
- [music-assistant/server](https://github.com/music-assistant/server): recording
  identity/version checks and explicit match-confidence levels.

No GPL downloader implementation is copied into the app. There are no new runtime
dependencies, media downloads, recording, or external backend requirements.

## Verification

`src/tests/video-ranking-regressions.test.ts` covers all permutations of the old
sort cycle, the 79.7K/18M case, misleading publisher names, intro tolerance,
recording versions, static rejection and late candidates. `server/youtubeSearch.test.ts`
covers unofficial requests, metadata parsing/hydration, complete-pool merging,
account isolation and transient retry behavior. The normal app and embedded-backend
checks also apply. Live service availability and Xiaomi playback require device testing.
