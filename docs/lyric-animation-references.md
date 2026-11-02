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
| Venetian | A travelling vertical shutter pulse folds and unfolds the held letters |
| Fan | A visible tilted arch opens and relaxes throughout the hold, then lifts away |
| Curtain Sweep | A sloping entrance becomes a whole-line banner pan with reserved travel room |
| Letter Rain | Varied entrances lead to independent, visible wind flutter and a falling exit |
| Concertina | Word anchors and glyph spacing expand and contract together, with steady glyph size |
| Silk Stretch | A travelling vertical stretch keeps the lower letter edge on its baseline |
| Domino | One-way lower-pivot kicks ripple through the held letters before toppling onward |
| Pendulum | Coherent groups swing both ways from upper pivots |
| Helix | A depth spiral moves larger and smaller letters through the held line |
| Zipper | Horizontal masks interlock; alternating upper/lower teeth breathe apart during the hold |
| Iris | Oval apertures reveal a slow whole-composition lens zoom, then close |
| Rosette | Letters bloom along fixed radial rays during the hold, then disperse outward |
| Switchback | Groups of three weave sideways with opposing slants and no vertical bob |

The expanded study also inspected Codrops `fx12`–`fx18`: horizontal-axis folds,
fan-like offsets, diagonal ordering, varied delay, stacking and anisotropic
stretch. The new catalog adapts these approaches to lyric cue lengths and adds
original derivatives; it is not a numbered reproduction of the Codrops demo.

A versioned device migration expands a previously all-enabled set of twelve once.
Custom subsets and empty pools are retained. Selecting just the original twelve
in the new catalog remains a deliberate choice after reload.

## Distinct motion during the readable hold

The first expansion differentiated many entrances more clearly than their holds.
Several new designs settled into very small sine-based floating motions. The new
thirteen now have separate composition, spacing, scale, pivot and lane behaviours,
listed above. The approved original twelve keep their previous rendering.

Identity tests check those visible behaviours throughout the hold, in addition to
checking that numerical poses differ. Browser comparisons still cover all 125
animation/style combinations, connected-script shaping and the original twelve's
pixel baselines. The banner reserves space before bounds fitting, and the Iris
lens stays at or below the fitted phrase size.

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
