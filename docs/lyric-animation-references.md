# Lyric choreography references

Studied on 2 November 2026. LyricFlow keeps its Canvas 2D renderer and media clock;
these references informed an independent implementation without new runtime dependencies.

| Repository and inspected source | Useful approach | LyricFlow implementation |
| --- | --- | --- |
| [Anime.js — text split effects](https://github.com/juliangarnier/anime/blob/master/examples/text/split-effects/index.js) and [stagger example](https://github.com/juliangarnier/anime/blob/master/examples/stagger/index.js) | Nested line/word/character timing, bounded stagger ranges, centre-origin ordering, explicit easing | One deterministic cue clock; short stagger windows; centre-out lens, scatter and portal sequences; damped elastic entry |
| [Codrops LetterEffects — TextFx](https://github.com/Codrops/LetterEffects/blob/master/js/textfx.js) | Paired entrances and exits for each effect; opposing letter directions; projected folds; clipping | Twelve integrated intro/hold/outro choreographies. Cascade and Wave reveal through per-letter masks; Hinge unfolds and closes; Alternating Sides travels through opposite stage edges |
| [Splitting — character plugin](https://github.com/shshaw/Splitting/blob/master/src/plugins/chars.js) and [text splitting](https://github.com/shshaw/Splitting/blob/master/src/utils/split-text.js) | Stable character indexing, preserved whitespace and grapheme segmentation | Cached measured graphemes; continuous phase offsets across the phrase; connected Indic and RTL words remain shaped text runs |

## Behaviour

- Each line animation owns its intro and outro. There is no lyric transition
  selection, random transition overlay or crossfade between two copies of a line.
- Entry and exit durations scale down for short cues. Stagger is bounded by the
  cue duration, including long lines. All poses are computed from media position,
  so pause, seek and replay are deterministic and do not change lyric timestamps.
- Motion continues during the readable hold. The stage clips the drawing to its
  safe region. Connected scripts move as shaped words rather than broken letters.
- Five word styles are static: Capsule, Double Underline, Marker Ribbon, Oval Halo
  and Focus. Their geometry and opacity do not depend on word progress. They
  inherit the line's entrance/exit visibility when line choreography is enabled.
- Lift, Glow and Zoom are a separate word-animation pool with an independent
  master switch and individual preview/toggle rows. Each enabled pool chooses one
  effect per line. Empty pools stay empty after reload.
- Both word layers require sourced word timing and matching display tokens.
  Reduced motion disables glyph motion and animated glow while retaining static
  decoration. Switching all three layers off leaves steady plain lyrics.
- A line keeps one vibrant sung accent from the album palette. New effects do not
  introduce a different colour for each word. Theme transitions remain separate.

The reference repositories identify their source code as MIT licensed (the
Codrops source header also identifies Codrops' copyright). No source was vendored.

## Validation

`npm run typecheck`, `npm test`, `npm run build`, the embedded backend checks,
`node scripts/letter-motion-smoke.mjs`, and `node scripts/lyric-presentation-smoke.mjs`.
Browser scripts accept `CHROME_PATH` for an installed Chromium executable.
Android APK and emulator builds require an explicit user request.
