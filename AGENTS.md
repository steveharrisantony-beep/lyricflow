# LyricFlow development

This repository contains one React/TypeScript/Vite application and its Capacitor
Android package. Keep browser development and the Android embedded backend working.

- Use npm for dependencies. Keep package-lock.json committed: every CI workflow
  uses npm ci. If package.json changes, regenerate its npm lockfile.
- Preserve android/, node-runtime/, native plugins, and .github/workflows/ when
  editing or exporting through AI Studio. Never replace them with generated web-only files.
- Keep YouTube video below the transparent lyric canvas, including interactive
  player mode. Background videos paired with separate audio must stay muted.
- Test selected YouTube videos without relying on the audio resolver's search cache.
- Do not infer advertisements solely from video IDs, video duration, or ctier query
  parameters; they also occur during normal playback.
- App updates must use HTTPS, validate checksums, app IDs, increasing version codes
  and signing identity, and leave installation approval to Android.
- Never commit signing keys, passwords, session cookies or access tokens.
- Relevant checks: npm run typecheck, npm test, npm run build, npm run build:backend,
  npm run test:backend, and the Android APK/emulator workflow.
