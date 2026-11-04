# YouTube video matching

The automatic background search submits the song title, first primary artist,
first featured artist when credited, and the word `video` to YouTube web search
through Innertube. A feature credit in the source title is extracted before the
query is built. The picker keeps
the first page in the returned relevance order.

Autoplay checks the first 20 results in order and selects the first video that
passes. The video title must share at least one complete word with the song
title, ignoring symbols and case. Videos with invalid IDs, explicit embedding
blocks, static content, audio-track classifications, Topic channels, or an
`Audio Track` album are rejected. Titles containing `jukebox`, `cover`,
`reaction`, `karoke`, or `reply` are rejected unless the word is in the song
title. Lyrical mode additionally requires `lyric`, `lyrics`, or `lyrical` in the
video title.

A personal mapping takes priority. If no result passes, the app leaves autoplay
off. Playback discoveries such as an embedding block are recorded for the
current song, and the next eligible result comes from the same first 20 rows.

**Show preloaded videos** displays the full page in relevance order and lists
the reasons each candidate was rejected. **Search online** is a separate manual
search with an editable query and Relevance and Views sort options.
