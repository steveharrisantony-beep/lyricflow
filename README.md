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
