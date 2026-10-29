# Baseline: lyric, camera and transition analysis

Reference: https://github.com/Tunai-0511/baseline, inspected 15 October 2026.
Reference commit: `98c49f688cd01c191517536e18bb9f90423fa70f`.
This review covers the implementation, not only the README or video thumbnail.

## 1. A scene is evaluated from song time

`app/src/engine/engine.ts` builds a timeline and passes song time, scene-local time,
beat/bar phase, audio samples, seeking state and transition overlap to scenes.
`renderEntry` renders a scene at the time selected by the compositor; camera moves
are another pass over that same scene time. `compositeSeam` renders both sides of a
cut, then combines them. Neither scene completion nor camera animation completion
is used to advance playback.

Why it matters: lyrics, hits, camera motion and scene boundaries share one time
reference. A seek can reconstruct a shot rather than waiting for animations to
catch up. Baseline uses pre-aligned, pre-analyzed data for one specific song;
LyricFlow must work with supplied LRC and live audio instead.

## 2. The camera is a rig, not a random frame offset

`app/src/scenes/_wire.ts` defines camera keys (position, target, roll and FOV), shots,
interpolated moves, snap reframes and hit events. `Rig.base` selects a shot and
interpolates a reframe. `Rig.shake` applies oscillation with exponential decay to
pitch/yaw/roll plus a short focal punch. `Rig.at` combines this with restrained
handheld drift in the camera's screen plane.

`app/src/engine/seams.ts` has a related film-camera pass over the composited image.
Its hits have a timestamp, zoom, roll, shake, decay and attack; they may also drive
an expanding refraction ring. The camera calculates sufficient zoom to cover the
image edges during pan/roll, avoiding exposed borders.

`app/src/direction.ts` creates stronger hits at particular important sung words,
smaller focal pumps at detected kicks, and stronger impacts at drops. It does not
apply the same violent shake to every frame or treat all frequency energy equally.

## 3. Lyrics occupy planes in the world

`app/src/scenes/_v.ts` is a Canvas/pinhole scene kit. `text3` lays out a string on a
world-space plane, projects positions/basis vectors through the camera, and draws
glyphs with local affine transforms. Perspective changes their size and direction
as the camera moves. It culls invisible/near-camera glyphs and records bounds for
text QA. `readable` corrects plane orientation so text is not mirrored.

Scenes including `v_seq1.ts`, `v_ctx.ts`, `v_gen2.ts` and `v_eff2.ts` place phrases
on signs, surfaces, corridors and structures. Timing determines what is sung;
scene design determines where it lives. Emphasis is authored for specific words
and moments. There is no requirement to put a giant current word on top of a
second copy of the same phrase.

LyricFlow adopts projected **word** planes rather than splitting every glyph.
That preserves Malayalam/Tamil/Hindi shaping and keeps arbitrary user lyrics
legible. Every word in the active phrase is painted exactly once; emphasis changes
its size/color/depth in place. It does not add an echo or subtitle duplicate.

## 4. Transitions carry motion across a cut

`app/src/engine/seams.ts` defines zoom, whip, burn, slice, swirl, luma, flash and
push seams. The seam has a cut time, pre/post duration, centers and direction;
it can hold or continue either scene outside its interval. `direction.ts` chooses
these handoffs deliberately for the authored timeline. The renderer keeps scene
rendering, compositing and post effects separate.

LyricFlow now keeps outgoing backgrounds live, uses shorter directional/perspective
handoffs, retains at most two inactive geometry bundles, and prepares scheduled
3D worlds before cuts. Transition progress uses full real time, not a clamped
frame delta. Playback time is read again immediately before lyric rendering.
There is no transition callback that pauses or seeks the audio player.

## 5. Automatic emphasis for arbitrary songs

Baseline's important-word hits are authored for its song. LyricFlow instead scans
the complete loaded lyrics, normalizes Unicode/punctuation/case, counts words and
filters common function words. Up to twelve repeated content words receive a
bounded importance weight. Original and Romanized counts are merged by maximum,
so an identical transcription does not double-count a word. Analysis is reused
when only timing offset/display mode changes.

The weight influences type size, contrast color, word depth/entry and a small
camera accent at its timestamp. Eight deterministic phrase treatments provide
variety without changing timing. Frequency is a useful hook heuristic, not a
claim of semantic understanding or automatic vocal alignment. LRC-estimated
word timing remains estimated.

## 6. Type and verification

Thin display faces and outline lettering have been removed from the rendering
path. Heavy Latin faces and bundled 800-weight Malayalam, Tamil and Devanagari
fonts are used with solid fills and a quiet shadow. Both stage modes use the same
single-phrase renderer; disabling choreography makes it calmer, not duplicated.

Unit checks cover word counting, common-word filtering, Indic words, exact word
render counts, lack of outlines, Romanized mode, deterministic motion, camera hit
decay, reduced motion and clock/offset continuity. Browser checks exercise real
synthetic audio, camera impacts, changing scenes while playback continues, phrase
identity versus the playback clock, seeking, duplication and portrait rendering.

## Boundaries

The implementation is independent; no Baseline song, lyric content, graphical
assets or scene code has been copied. Baseline's code is MIT licensed, while its
song and lyrics have a separate license. Its hand-directed mathematical story,
offline source/stem analysis, verified word alignment and full film effects stack
are not reproduced by a generic live visualizer. The transferable mechanisms here
are projected text, authored-style camera impulses, shared timing and live cuts.
