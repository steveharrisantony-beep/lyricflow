# Lyric choreography references

Studied on 2 November 2026. LyricFlow keeps its Canvas 2D renderer and media clock;
these references informed an independent implementation without new runtime dependencies.

| Repository and inspected source | Useful approach | LyricFlow implementation |
| --- | --- | --- |
| [Anime.js — text split effects](https://github.com/juliangarnier/anime/blob/master/examples/text/split-effects/index.js) and [stagger example](https://github.com/juliangarnier/anime/blob/master/examples/stagger/index.js) | Nested line/word/character timing, bounded stagger ranges, centre-origin ordering, explicit easing | One deterministic cue clock; short stagger windows; centre-out lens, scatter and portal sequences; damped elastic entry |
| [Codrops LetterEffects — TextFx](https://github.com/Codrops/LetterEffects/blob/master/js/textfx.js) | Paired entrances and exits for each effect; opposing letter directions; projected folds; clipping | Twenty-five integrated intro/hold/outro choreographies. Cascade and Wave reveal through per-letter masks; Hinge unfolds and closes; Alternating Sides travels through opposite stage edges |
| [Splitting — character plugin](https://github.com/shshaw/Splitting/blob/master/src/plugins/chars.js) and [text splitting](https://github.com/shshaw/Splitting/blob/master/src/utils/split-text.js) | Stable character indexing, preserved whitespace and grapheme segmentation | Cached measured graphemes; continuous phase offsets across the phrase; connected Indic and RTL words remain shaped text runs |

## Expanded animation catalog

The first twelve designs retain their original order, motion and timings.
Thirteen additions bring the catalog to 25:

| New design | Entrance, hold and exit |
| --- | --- |
| Venetian | Horizontal-axis shutters unfold, breathe vertically and fold closed |
| Fan | Tilted letters open from a fan into a breathing arch, then lift away |
| Curtain Sweep | A sloping masked entrance rises across the line; the exit reverses its order |
| Letter Rain | Deterministic varied delays and angles gather falling letters; a windy hold leads to a falling exit |
| Concertina | Letters unstack within each word, breathe through tracking, then gather again |
| Silk Stretch | Tall, narrow letters relax into shape, stretch gently and flow downward |
| Domino | Letters pivot upright from their lower edge, rock gently and tip onward |
| Pendulum | Letters swing from upper pivots, with a coordinated swing into and out of the line |
| Helix | A travelling spiral combines vertical motion, apparent depth and rotation |
| Zipper | Opposing horizontal masks interlock; letter pairs separate at the exit |
| Iris | Centre-out oval apertures reveal each letter and close at the end |
| Rosette | A radial arrangement gathers into the phrase and blooms outward |
| Switchback | Groups of three letters enter through opposing horizontal lanes and weave gently |

The expanded study also inspected Codrops `fx12`–`fx18`: horizontal-axis folds,
fan-like offsets, diagonal ordering, varied delay, stacking and anisotropic
stretch. The new catalog adapts these approaches to lyric cue lengths and adds
original derivatives; it is not a numbered reproduction of the Codrops demo.

A versioned device migration expands a previously all-enabled set of twelve once.
Custom subsets and empty pools are retained. Selecting just the original twelve
in the new catalog remains a deliberate choice after reload.

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
`node scripts/letter-motion-smoke.mjs`, `node scripts/animation-catalog-smoke.mjs`,
and `node scripts/lyric-presentation-smoke.mjs`. The catalog check can capture a
pixel baseline with `--baseline` before modifying the original twelve designs.
Browser scripts accept `CHROME_PATH` for an installed Chromium executable.
Android APK and emulator builds require an explicit user request.
