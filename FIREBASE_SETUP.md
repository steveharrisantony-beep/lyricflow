# Shared settings and community corrections

The web and Android repositories use the **same Firebase project and Firestore database**. Guest mode needs no Firebase configuration. The dashboard is deferred: suggestions stay pending until a developer explicitly publishes a correction.

## Set up using a browser

1. Open [Firebase Console](https://console.firebase.google.com/). Create a project (or use your existing LyricFlow project). The Spark plan is sufficient to start within its quotas; this implementation needs no Cloud Functions or Cloud Storage.
2. In **Build → Authentication → Get started → Sign-in method**, enable **Email/Password**. Optionally enable **Google** for the website. Add your deployed website domain under Authentication's authorized domains.
3. In **Build → Firestore Database**, create a Standard database in production mode. Use the default database unless you deliberately configure another ID.
4. In the Firestore **Rules** tab, replace the rules with the contents of this repository's `firestore.rules`, then click **Publish**. Publish once for the shared project, not a separate database per app. `DRAFT_firestore.rules` is a compatibility copy, not a separate configuration.
5. In **Project settings → General → Your apps**, register a **Web app** named LyricFlow. Both current bundles use the Firebase JavaScript SDK, including email/password inside the Android WebView. Copy its `apiKey`, `projectId`, `appId`, and `authDomain`.
6. In **each GitHub repository → Settings → Secrets and variables → Actions → Variables**, add these repository variables:

   | Variable | Firebase config field |
   | --- | --- |
   | `VITE_FIREBASE_API_KEY` | `apiKey` |
   | `VITE_FIREBASE_PROJECT_ID` | `projectId` |
   | `VITE_FIREBASE_APP_ID` | `appId` |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
   | `VITE_FIREBASE_DATABASE_ID` | Optional; leave absent for `(default)` |

   These Firebase web config values are public build configuration. Database Rules protect the data. Never put a service-account JSON, Admin SDK private key, or provider secret into these variables or the APK.
7. Re-run the Android APK workflow after setting variables. For your website host, set the same environment variables in its build settings and redeploy. Changing GitHub variables alone does not configure a separately hosted website.
8. Open **Sign in / sync** in LyricFlow. Create an email account and use it on both devices. Verify the email to submit corrections. Private settings sync does not require verification.

Google popup sign-in is available on the website. The Android package does not yet have native Google sign-in: use email/password there. If you first signed in with Google on the website, open **Account & sync → Add a password for Android**. This links a password to the same Firebase user ID, preserving the shared account. Then sign into Android with that email/password. Enable Email/Password in Firebase before doing this.

## Data and precedence

| Path | Access and contents |
| --- | --- |
| `profiles/{uid}` | Owner-only preferences, including theme palettes, camera shake, font sizes, display modes, reduced motion and volume |
| `profiles/{uid}/songMappings/{recordingKey}` | Owner-only per-song lyrics source file reference, selection, lyrics delay, YouTube video ID and video delay |
| `songMappings/{recordingKey}` | Complete developer-published song mappings; exact reads available to guests |
| `profiles/{uid}/corrections/{correctionId}` | Owner-only timing, lyrics selection and background-video overrides |
| `profiles/{uid}/customLyrics/{recordingKey}` | Owner-only saved custom lyrics; never copied into public suggestions |
| `correctionSubmissions/{uid}/items/{proposalId}` | Verified users submit; only the submitter and developer can read |
| `approvedCorrections/{correctionId}` | Anyone can read an exact document, including guests; developer-only writes |
| `admins/{uid}` | Optional developer allowlist. Provision through the Console/Admin SDK only; no client may read/write roles |

Personal override → active approved correction → automatic result. A personal **zero-second** offset is still an explicit override. “Use default” removes the personal override and resumes the approved/automatic value. Live listeners deliver updates and revoke withdrawn approvals. An on-device cache makes previously downloaded approvals available offline; a device cannot obtain new approvals without internet.

Recording keys now use normalized **track title + artist/author + rounded duration** (r4 keys). Provider IDs and album labels remain descriptive metadata and no longer prevent the same song matching across catalogs. Version words in titles are retained. Different durations or live/remix titles remain separate. Timing corrections additionally include a fingerprint of the precise timed lyrics and source URL, so an updated lyrics revision does not inherit an incompatible delay.

Choosing a lyrics engine, subtitle track or alternative LRCLIB candidate saves its selection. The shared record contains IDs, not copied lyrics. A background-video replacement never changes the audio track. It is enabled only when audio is separate; the current YouTube-only player also supplies audio and cannot safely replace just its video.

## Local storage, migration and offline sync

Small settings/fix records use versioned local storage; Firestore uses persistent IndexedDB caching where supported, with memory fallback. Writes are outside the animation loop. Preference cloud writes are debounced, and pending changes are recorded on device before the debounce finishes. Per-context correction records avoid unrelated songs overwriting one another. Concurrent changes to the same profile or correction follow Firestore's last-accepted-write behavior, not a claim of automatic field-by-field merging.

Guest and every account have separate local namespaces. Sign-out remounts the application in guest mode and stops private listeners. Guest data is not uploaded automatically: the account panel has an explicit **Use this device’s guest settings and fixes** action. It replaces corresponding account values with the guest values. Other account data is retained. Locally saved full library entries and filename metadata remain device-local and are isolated by account; saved custom lyric overrides use the private cloud path above.

Existing v2 guest preferences and device lyrics/filename libraries remain readable. A legacy song delay is migrated once when its title, artist, duration and active lyrics are available; it is never promoted to a public correction. Cloud v2 records at `userPreferences` remain intact under their existing rules; this version writes new state to `profiles` and does not destructively migrate old server records. Clearing browser/app data or uninstalling removes unsynced guest data. Account data already accepted by Firebase can be restored after login. If storage or permission fails, the UI reports the problem rather than declaring it synced.

## Review now; dashboard later

In the Firebase Console, inspect `correctionSubmissions → user UID → items`. The suggestion records contain metadata and one proposed change, without the submitter's email or lyric text. Never copy whole submission documents into the public collection.

To approve manually with the trusted Console:

1. Verify the exact recording and lyrics/video version by playing it.
2. The destination document ID is `recordingKey + '_' + kind + '_' + (lyricsKey or 'recording')`. The submission ID adds a final proposal hash; omit that final hash for the published document.
3. In `approvedCorrections/{correctionId}`, copy only `recordingKey`, `identity`, `kind`, `lyricsKey`, `delaySeconds`, `selection`, `youtubeVideoId`, `videoDelaySeconds`, and `lyricsSource`.
4. Add `active: true` (boolean), `revision: 1` (number, increment on later changes), and `updatedAt` (timestamp). Do not copy `uid`, `status`, `proposalKey`, custom lyrics, or any account information.
5. Mark the original suggestion `approved` or `rejected` separately. This status alone **does not publish** anything.
6. Set the published document's `active` to `false`, or delete it, to withdraw a bad approval. Connected clients remove it from their caches; personal overrides still win.

Console project owners can already perform these administrative actions. The future dashboard will use a trusted `admin` custom claim or a Console-provisioned `admins/{uid}` document. No admin credential is shipped to users. Rate controls/App Check and moderation tooling should be added before inviting large-scale public submissions; this first version deduplicates identical proposals per user and keeps publication manual.

## Verification

`npm test` covers recording/revision boundaries, personal-over-public priority, account isolation, queued edits, revocation, verified submissions, and the actual manual-lyrics timing UI. `npm run build` checks the complete bundle. To test the database rules without production data:

```sh
npx firebase-tools@14.22.0 emulators:exec --project demo-lyricflow --only firestore 'npm run test:rules'
```

The isolated rules test refuses to run without a local emulator. The demo-only `VITE_FIREBASE_EMULATORS=true` switch connects browser tests to localhost Auth (9099) and Firestore (8080), and is ignored for non-demo projects. Leave it unset in release builds.

Before release, verify on Xiaomi Pad 8: account creation/verification, email login, account switching, settings changes across two devices, offline edit/restart/reconnect, provider-selected lyrics restoration, approval/revocation, and video replacement while the original audio continues. Automated fixtures do not prove live provider availability or Android hardware behavior.


## Per-song source files and video mappings

A song mapping stores **both references**, even when their delays are zero. `lyrics.sourceFile` contains the resolved source name, URL/file reference and exact revision fingerprint; `lyrics.selection` identifies the engine and LRCLIB/subtitle ID where available; `lyrics.delaySeconds` is independent of `video.youtubeVideoId` and `video.delaySeconds`. Missing sources stay absent until matched or selected; the app never fabricates an ID. Provider lyric text is not republished. Saved custom files remain in the user's private custom-lyrics data.

Resolved mappings save automatically on device, and privately in `profiles/{uid}/songMappings/{r4Key}` after login. Developer-approved combined mappings can be published at `songMappings/{r4Key}` by copying only `identity`, `lyrics`, and `video` from a reviewed private mapping, then adding `active`, `revision` and `updatedAt`. Do not copy local `dirty` markers or user identity. Public rules restrict publication to developers. Personal correction overrides still take priority. Existing cached r3 personal fixes/custom files migrate when their title, artist, duration and lyrics revision match; conflicting old variants are left intact. Old public r3 approvals need republishing under r4 keys.

For JioSaavn or another separate audio stream, **Find YouTube video background** searches without replacing the audio. The saved **Preferred YouTube background** setting chooses either `title + author + music video` or `title + author + lyrics video`. Results show title, author and duration for explicit selection. Choosing a result switches the stage to video mode, saves the YouTube ID, and keeps it muted. Saved video selection and delay restore on later playback; unavailable providers can be retried or a video URL pasted manually.

Both offsets are signed. A lyrics delay of +2 displays lyrics two seconds later, and -2 displays them earlier. A video delay of +2 holds the video until audio reaches two seconds and then uses `videoTime = audioTime - 2`; -2 advances video to `audioTime + 2`. Video bounds are -300 to +300 seconds; lyrics retain -30 to +30 seconds. Changing video delay never changes lyric delay or the music clock. Background-video end/position events cannot end, seek or advance the audio source. Republish the updated `firestore.rules` when upgrading to this schema.
