# Spectrum analyzer themes and automatic selection

The catalog now contains 28 themes in eight categories, with 115 palette options.

## Reference repositories

| Repository / inspected source | Technique studied | Original implementation here |
| --- | --- | --- |
| [audioMotion-analyzer](https://github.com/hvianna/audioMotion-analyzer), [analyzer source](https://github.com/hvianna/audioMotion-analyzer/blob/master/src/audioMotion-analyzer.js) | Logarithmic frequency bands, radial displays, peak hold and release | Use the existing 64 logarithmic bands; add frame-rate-aware display envelopes and 350 ms peak hold. No new audio graph or FFT. |
| [CAVA](https://github.com/karlstav/cava), [Winamp spectrum shader](https://github.com/karlstav/cava/blob/master/output/shaders/winamp_spectrum.frag), [spectrogram shader](https://github.com/karlstav/cava/blob/master/output/shaders/spectrogram.frag) | Segmented spectrum bars, falling peak caps, spectral history | Spectrum Prism uses Canvas lamps and reflections; Radial Spectrum maps the bands around a circle. The history engine uses a typed ring buffer instead of shader feedback. |
| [WebAudioSpectrum](https://github.com/deftio/WebAudioSpectrum), [audioSpectrum.js](https://github.com/deftio/WebAudioSpectrum/blob/main/audioSpectrum.js) | Filled spectrum curves and bounded time/frequency history | Spectrum Ribbons mirrors three frequency envelopes. Spectrum Waterfall stores 96 snapshots at 24 Hz, approximately four seconds. |
| [audio-analyzer](https://github.com/fagci/audio-analyzer), [canvas.js](https://github.com/fagci/audio-analyzer/blob/master/canvas.js) | Peak emphasis and offscreen waterfall rendering | Rasterize the small 64 × 96 history image only when samples or palette settings change, then scale it for display. |

The new painters are original code. No third-party analyzer library, shader, preset,
audio capture code, or artwork was copied or added as a dependency. The palettes
control every theme's background, spectrum and highlights.

## Selection behaviour

- The **Randomize enabled themes** and **Auto-randomize colour palette** switches are removed.
- One enabled theme stays fixed. Two or more enabled themes rotate automatically. Duration still uses lyric lines when available and seconds otherwise.
- Every theme's palette choices use independent checkbox switches. One selected palette stays fixed; multiple selected palettes run through a shuffled rotation. Only selected palettes can appear.
- A single enabled theme can still rotate its multiple palettes. Palette changes use the existing theme transition layer; lyrics remain on their own canvas.
- Palette order is deterministic for the song, theme, selected set and section. Seeking back restores the same choice; no frame-by-frame random flicker. Selection-list order does not change the result.
- The last enabled theme and last selected palette cannot be removed. This preserves a usable fallback without silently selecting an unmarked option.
- Legacy single palette strings migrate to one-element arrays. Unknown/removed palette IDs and duplicates are discarded. Existing single choices remain pinned. The old randomization flags no longer govern playback.
- Multiple selections persist through device preferences and the existing account preference map. No new Firestore document type or security-rule deployment is required.

## Rendering and lifecycle

Each active/outgoing analyzer has its own bounded state. Band envelopes use fast
attack and slower release normalized to elapsed wall time; caps hold briefly and
then fall. Changing animation speed does not change history sampling speed. Silence
decays rather than generating synthetic frequencies. Demo bands are supplied only
by the existing demo/preview path.

Waterfall state stays in memory, with no audio recording. It is cleared on track
changes and released with the renderer. Transitions copy display state so the
outgoing waterfall retains its history. Video background mode does no analyzer
theme work. Reduced motion freezes waterfall scrolling and attenuates the other
analyzer geometries; the latest stationary history stripe can still respond to
sound. Performance quality reduces bar/ray counts; the history raster stays small
at every quality setting.

## Verification scope

All 279 tests pass, alongside TypeScript, the production web build, the embedded backend bundle and the embedded route checks.

Automated coverage checks preference migration, multiple palette persistence and
independent toggles, removal of both controls, derived theme rotation, selection
order/seek stability, independent spectrum bins, invalid input, frame-rate-aware
envelopes, peak decay, bounded history, reduced-motion scrolling and transition
state isolation. The full TypeScript/test/build/backend suite is also run.

Canvas raster QA executes all four new painters in all 16 palettes at silence,
with audio, and with reduced detail/motion (48 combinations), plus four portrait
renders. These are raster checks, not Android GPU benchmarks. Chromium was not
available here; real Xiaomi Pad 8 / Android WebView audio capture, frame rate and
smoothness remain device checks. No APK or emulator workflow was run.
