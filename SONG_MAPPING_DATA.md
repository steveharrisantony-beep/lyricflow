# Song Mapping and local data in LyricFlow

This document describes the **current local-only** mapping system. The older
Firebase synchronization design was removed; there is no active Firestore
connection, account-wide cloud database or remote public-mapping service.

## How a song is identified

LyricFlow matches a recording by normalized **song title, artist and duration
rounded to whole seconds**. The provider and album are supporting metadata,
not independent recording identifiers. Different versions may need separate
mappings.

The app keeps lyrics and video selections independent. Fixing the video does not
require replacing the lyrics, and editing lyrics does not require changing the
video.

## Temporary search and preloading

`src/data/temporarySongs.ts` holds short-lived, in-memory results for the current
song, recently played songs and upcoming tracks. Queue preparation fetches
potential lyric and video *metadata* in advance; it does not download and store
YouTube video files.

Temporary candidates and session drafts are **not** permanent song mappings.
Closing the app or clearing the page removes this cache. The next playback may
search again.

## Saving a custom mapping

During playback:

1. Open **Settings → Song Mapping**.
2. Select a preferred lyric candidate or import/edit a lyrics file.
3. Select a preferred background video, change the lyric/video timing, or choose
   whether lyrics/video should be hidden for the recording.
4. Select **Save mapping for current song**.

Saving records the current song's choices in device/browser storage. A **Saved**
confirmation is displayed after a successful write. Storage errors should not
be treated as successful saves.

The saved entry takes priority over automatic search on future plays. New saves
replace older selections for that recording; saving a new lyric reference
invalidates incompatible earlier timing corrections.

## Where the data is kept

Local preferences and mappings use browser/app storage. The key stores include:

- `songMappings` for lyric/video choices and hide preferences.
- `corrections` for manual timing or mapping-related corrections.
- `customLyrics` for user-supplied lyrics snapshots and edits.

Some of these utilities still live in a folder named `src/firebase/`. The name
is historical: these files now implement local persistence and backward-
compatible data formats, **not Firebase SDK calls**. The browser and Android app
do not synchronize user mappings with one another automatically.

## Backup, restore and reset

Use **Settings → Others → Import & export data** for a JSON backup. Settings and
Song Mapping backups are separate. The exported mapping data contains *saved*
personal records, not temporary prefetch candidates.

Import merges saved data with the current device's records; imported conflicts
can replace older matching entries while unrelated songs are kept. Keep the
original JSON file somewhere safe before uninstalling, clearing storage or
moving to another device.

**Reset song mapping data** clears saved mappings on the current app/browser
installation. It does not make a remote Firebase request because there is no
Firebase account connection in this version.

## Recovery and selection

When a saved lyrics snapshot is valid, LyricFlow can reuse it immediately.
Otherwise it can attempt a saved provider link before falling back to automatic
lyric search. Source adapters include lrc.red, Binimum, Paxsenix, LRCLIB and
YouTube subtitle lookup. Availability varies.

For automatic discovery, a suitable word-synced result is preferred. A matching
alternative recording with the same whole-second duration can be accepted for
word- or line-synced lyrics; a preferred word-synced match can end subsequent
search stages. Imported or explicitly saved lyrics still take priority.

Song changes, mapping saves and new manual choices invalidate obsolete
in-flight results so a previous track's lyrics or video should not replace the
current one.

For an everyday introduction, return to [README.md](README.md).
