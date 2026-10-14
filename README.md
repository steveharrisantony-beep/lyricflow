# LyricFlow — Stage 1

Premium browser-based visualizer prototype for touchscreens, built with **React + TypeScript + Vite + Canvas 2D**.

## Open in StackBlitz
https://stackblitz.com/github/steveharrisantony-beep/lyricflow

The StackBlitz editor will normally install dependencies and start a preview. If it does not, open the editor's terminal and run:
```
npm install
npm run dev
```

## Stage 1 features
- Four animated scenes: atmosphere, flowing light trails, geometry, kinetic typography
- Demo mode with simulated music energy
- Scene selection, intensity and speed controls
- High, Balanced and Performance settings
- Fullscreen (where supported), pause/resume and reduced motion
- Approximate FPS readout, tablet-responsive touchscreen controls
- Scene rendering isolated from React rerenders via requestAnimationFrame

**Stage 1 is a demo:** microphone listening, lyric synchronization, track identification, Spotify, external APIs and backend storage are not implemented. All visualization happens locally in the browser. Canvas 2D does not require WebGL.

## Build
```
npm run typecheck
npm run build
```

The GitHub files were uploaded for direct StackBlitz import. Production build and Android device behavior still need to be verified in a browser environment.

## Cost
All included packages are open-source and no paid services or API keys are required.


## Local music player (new preview feature)
Use **Choose MP3 / Audio** in the application to pick an MP3, WAV, M4A, OGG, or another browser-decodable audio file from your tablet. Tap Play; the scenes respond to analyzed playback energy. Pause, seek, adjust volume, or remove the file at any time.

The player uses `URL.createObjectURL`, `HTMLAudioElement`, `AudioContext`, `MediaElementAudioSourceNode`, and `AnalyserNode`. The original file does not leave the device, and no recording or upload endpoint exists. Playback requires a user gesture. Browser codec support varies.

**Spotify synchronization is deliberately not implemented.** Spotify's current Developer Policy prohibits synchronizing recordings with visual media without appropriate authorization. Do not attach the Spotify player or playback state to visuals.

When the local track is paused or removed, demo mode returns to simulated energy (when enabled).

## Current verification
Eight prior Stage 1 tablet interaction tests were user-verified. The local player is newly implemented and still requires a fresh StackBlitz build plus on-tablet playback test. No claim of completed microphone, lyrics, AI, Spotify, or deployment features is made.


## Spotify metadata discovery (optional; NO synchronization)
The Spotify discovery panel can connect to a Spotify developer application using OAuth 2.0 PKCE (no client secret). It requests `user-read-currently-playing` and refreshes the token when needed. Track name, artist, album, and track URL are shown **only in a separate metadata panel**. Player time, Spotify audio, and Spotify metadata are **not connected to the lyrics timeline or visualizer engine**.

To configure:
1. Create a Spotify app using the official Spotify developer dashboard, subject to account and development-mode eligibility.
2. Open LyricFlow as a standalone page. Copy the **exact redirect URI** displayed in its Spotify section into your application's Redirect URIs on the Spotify developer dashboard. Spotify applies redirect URI security restrictions; localhost may be treated differently from HTTPS remote sites.
3. Paste **only the public Client ID** into the LyricFlow field. Never paste a Client Secret, access token, or refresh token.
4. Choose Connect Spotify; sign in and consent. The PKCE callback returns to the same URL.
5. If the API denies access, check eligibility, scopes, user allowlist, account tier, and approved redirect URIs.

OAuth session data is held in browser **sessionStorage** and will normally disappear when the tab's session ends; the integration does not use a backend. Do not embed or transmit credentials in source code.

Relevant policy: https://developer.spotify.com/policy and https://developer.spotify.com/compliance-tips. Spotify expressly prohibits synchronizing Spotify recordings with other recordings, lyrics or visual media, even for a noncommercial developer project without authorization.

## Manual LRC lyrics
In the **Local Timed Lyrics** section, click Edit Lyrics, enter user-authorized lines in `[mm:ss.xx]Text` format, and optionally supply corresponding romanized lines separately. The local MP3 playback clock selects each line. Adjust the offset manually if your timestamps need correction. A clearly original demo sample is included. No online lyrics are fetched; lyrics are kept in memory for this prototype and vanish after a refresh.

LRCLIB has an official CORS-capable, freely accessible lyrics API (https://lrclib.net/docs). However, its free API access does not necessarily grant public-display, reproduction, or caching rights for every third-party copyrighted lyric. We have **not** wired it to automatic display until rights and acceptable usage are established. JioSaavn community proxies and unofficial Google GTX endpoints are similarly not wired in. Automatic Indian-language romanization has **not** been implemented; the Romanized field accepts manual corrections without altering the original lyrics.

## Verification status
The Spotify OAuth flow and local LRC editor were committed to GitHub, but have **not yet been verified** with actual Spotify credentials, Android browser testing, or a successful production build. Test in StackBlitz before relying on them.
