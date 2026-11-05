# YouTube video matching

The automatic background search preserves the source song title and appends the
first primary artist and `Music Video`, or `Lyric Video` when lyrics videos are
preferred. If any complete word of that artist
already appears in the title, ignoring symbols and case, the artist is omitted.
Featured artists are kept when present in the source title. They are not appended
from artist metadata. The browser and embedded backend use the same query builder.
The picker keeps the first page in the returned relevance order.

If an autoplay search returns zero results, it retries immediately, then after
1 second, then after 2 seconds (at most four attempts). Retries repeat the same
query with a fresh YouTube search. The first nonempty response ends retries;
filtering failures do not trigger another search. Changing songs cancels pending
requests and retry delays. Every attempt logs its exact query, attempt number,
retry delay and result count. If all four attempts return zero results, autoplay
stays off and a separate search-failure entry is recorded. Manual online searches
remain single searches.

Autoplay checks the first 20 results in order, takes the first five videos that
pass the filters, and chooses the one with the most views. If fewer than five
pass, it chooses from those available. Ties preserve relevance order, and missing
view counts rank below known counts. The video title must share at least one
complete word with the song title, ignoring symbols and case. Videos with invalid IDs, explicit embedding
blocks, static content, audio-track classifications, Topic channels, or an
`Audio Track` album are rejected. Titles containing `jukebox`, `cover`,
`reaction`, `karoke`, `reply`, or `audio` are rejected unless the word is in the song
title. Both preferences use these same filters. Lyrical mode does not require
`lyric`, `lyrics`, or `lyrical` in the video title.

After ranking that first-five shortlist by views, autoplay checks channel names
in that order. A channel containing any complete phrase below, ignoring case, is
rejected: `7clouds`, `DopeLyrics`, `LatinHype`, `The Vibe Guide`, `SyrebralVibes`,
`Vibe Music`, `Shadow Music`, `Cakes & Eclairs`, `Unique Vibes`, `Taj Tracks`,
`Dan Music`, `WaveMusic`, `BangersOnly`, `Royal Music`. Each phrase must occur
contiguously in the channel name; individual words do not trigger rejection.
The next most-viewed video in the same shortlist is checked until one passes.
Rejected rows show `Blocked channel: <matched phrase>` in the preloaded list,
which retains relevance order. The shortlist is not refilled after a channel
rejection. If every shortlisted video is blocked, autoplay stays off.

A personal mapping takes priority. If no result passes, the app leaves autoplay
off. Playback discoveries such as an embedding block are recorded for the
current song, and the next eligible result comes from the same first 20 rows.

**Show preloaded videos** displays the full page in relevance order and lists
the reasons each candidate was rejected. **Search online** is a separate manual
search with an editable query and Relevance and Views sort options.
