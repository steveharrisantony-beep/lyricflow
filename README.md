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
