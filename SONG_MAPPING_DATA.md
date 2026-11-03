# Song mapping and preparation

Songs match by normalized title, then artist and total duration rounded to whole
seconds. Music provider, catalog ID and album are metadata, not identity. Version
words such as live, remix and acoustic are retained.

## Temporary session data

`temporarySongs.ts` holds at most ten songs in memory: the current song, the last
two played songs and upcoming queue entries. Up to seven upcoming songs are
prepared, nearest first, with two background workers. Prepared lyric text and
YouTube search results are shared with foreground playback; video bytes are not
downloaded or cached. A prepared video may still need to buffer in YouTube.

Closing/restarting the page or Android webview destroys this memory. Nothing in
this cache is included in exports. Queue removal and song transitions evict work
outside the retained window. Account switches and mapping reset clear the cache.

## Save-only custom database

Selections, manual lyric edits, timing changes and hide/show switches apply as
session drafts. They do not write personal mappings or Firebase. Pressing
**Save mapping for current song** commits the entire current song snapshot to
the existing scoped device/browser storage, then queues an account upload.
The button displays **Saved** for two seconds. Storage errors are shown without
claiming success. Saving a replacement retires older aliases for that recording.

The persistent database consists of the existing `songMappings`, `corrections`
and `customLyrics` stores. This preserves compatibility with existing installations
and version-1 JSON backups. Exports contain only persistent custom data. Imported
records replace conflicting incoming fields while unrelated songs are preserved.

## Firebase synchronization

At startup/sign-in/reconnect, `songDatabaseSync.ts` downloads the three private
collections in bulk. Song changes only read local data; they open no Firestore
listeners and make no Firestore requests. Playback does not wait for startup sync.

Normal synchronization prefers Firebase when the same stored record conflicts.
New offline songs without a cloud counterpart are uploaded. Import records are
marked for priority upload before the cloud download, so imported values win.
Failed imports remain pending across restarts. Explicit Save/import uploads begin
immediately; local playback and file import remain usable while offline.

Reset still deletes all three private Firebase collections, including documents
not yet seen on this device. Its pending marker survives offline operation and
blocks stale downloads/acknowledgements. A cloud download already in flight cannot
restore pre-reset data or overwrite a newer save/import.

Approved public mappings/corrections are warmed at startup with bounded queries
for active records. Deploy the accompanying `firestore.rules` to enable these
public queries; private collection access uses the existing owner rules.

## Saved lyric recovery

Use a valid saved lyric snapshot, otherwise try the saved file link. A broken
link retries the named original provider before the general automatic chain.
Provider-specific recovery routes support lrc.red, Binimum, Paxsenix, LRCLIB,
YouTube subtitles, MusixMatch and KuGou. Recovery results remain temporary; only
the Save button can replace the saved lyric reference. Lyrics and video resolve
independently, and hidden components skip preparation.

Prepared data carries its lookup options and mapping revision. Save, import and
cloud changes invalidate obsolete results. Cancelled, evicted and superseded
requests cannot publish results into a different recording.
