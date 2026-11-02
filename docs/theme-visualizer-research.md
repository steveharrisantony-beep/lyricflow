# Music-reactive theme refresh

Reviewed on 3 November 2026. The active catalog contains 24 distinct scenes and 99 palettes.

## Repository research

These are technique references. The new scenes are original Canvas implementations;
no third-party renderer, shader, preset pack, artwork, or source code was bundled.

| Repository and inspected source | Useful technique | Application in LyricFlow |
| --- | --- | --- |
| [Butterchurn](https://github.com/jberg/butterchurn), [audioLevels.js](https://github.com/jberg/butterchurn/blob/master/src/audio/audioLevels.js) | Separate bass, mids and treble; normalize attack/release smoothing to frame rate | Keep the existing shared analyzer and envelopes; assign mass to bass, motion to mids, detail to treble, and accents to beats. Procedural travel uses elapsed time. |
| [audioMotion-analyzer](https://github.com/hvianna/audioMotion-analyzer), [analyzer source](https://github.com/hvianna/audioMotion-analyzer/blob/master/src/audioMotion-analyzer.js) | Logarithmic frequency bands, per-band geometry, sensitivity and smoothing | Pass the app's existing logarithmic 64-band buffer into the motion renderer. Interpolate adjacent bands for each ribbon, ridge, flower, crystal, ray or cell. No second audio context. |
| [Party Mode](https://github.com/preziotte/party-mode), [main.js](https://github.com/preziotte/party-mode/blob/master/js/main.js) | Different geometries interpret the same spectrum differently | Keep scene-specific forms instead of recolouring the same animation. Retain independent palette selection, preview and theme transitions. The current vizz.fm rewrite is separate from this older SVG project. |
| [Visual Audio](https://github.com/josephyu12/visual-audio), [app.js](https://github.com/josephyu12/visual-audio/blob/main/app.js) | Typed particle buffers, bounded pools, depth layers, frame-rate-aware movement | Reuse point buffers in Star Map and Celestial Orbit. Precompute deterministic particle seeds and network topology. Scale new scene density with quality and the stage's adaptive render scale. |
| [Void Visualizer](https://github.com/TheOmegaFett/void-visualizer), [sketch.js](https://github.com/TheOmegaFett/void-visualizer/blob/main/src/scripts/sketch.js) | Layered flow fields and particles | Fluid Ink uses layered deformable membranes. This reference generates sound from its visuals; its oscillator system is not a live music input and was not adopted. |

## Theme changes

- Removed Gilded Whirlpool, Chroma Moire Voids and Signal Chamber from the scene catalog, selection, previews and narrative mapping. Existing saved selections are sanitized against the active catalog. An old Color Riot palette ID resolves to the first new palette.
- Pixel Garden has curved stems, tapered leaves, five- or eight-petal flowers, centers, depth layers and round pollen. Bass controls height, mids control sway, and treble/per-flower bands open the blooms.
- Color Riot replaces every previous palette with Peach Sorbet, Lavender Milk, Pistachio Cloud, Powder Sky, Rosewater and Buttercream. Its plates, lattice and extruded stack follow the selected pastel surfaces. Its background gradient is opaque, avoiding dark regions where a transparent stop exposed the backing canvas. Lyric foreground remains dark and is independently contrast-corrected.
- Existing motion scenes now receive individual spectrum bands. Crystal Resonance has shaded facets; Neon Metal Matrix has extruded cells; Star Map connects nearby stars; Aurora Field has translucent light volumes. Natural and flowing scenes no longer inherit the architectural grid.
- Supported scene densities and path tessellation follow High, Balanced and Performance quality; the adaptive scale can lower them further. No dependencies were added.

## New scenes

| Scene | Geometry | Audio roles |
| --- | --- | --- |
| Fluid Ink | Nested translucent liquid membranes and droplets | Bass expands mass; mids deform membranes; highs ripple edges; beats strengthen outlines. |
| Spectral Terrain | Perspective ridges with opaque depth occlusion and horizon fog | Spectrum bins displace different points; bass raises the surface; beats sharpen contours. This is a current-spectrum landscape, not a historical spectrogram. |
| Resonance Plate | Deterministic grains projected toward standing-wave nodes with an analytic gradient | Bass and mids morph modal patterns; treble adds flutter; beats enlarge grains. This is an artistic nodal visualization, not a physical plate simulator. |
| Mycelium Network | A bounded branching tree with curved filaments and travelling light | Bass expands branches; mids sway tips; band energy changes thickness; treble lights travelling signals. |

Each has four palettes. Reduced motion freezes travel in all four new scenes and attenuates audio displacement.

## Verification

- TypeScript check, all 252 tests, production web build, embedded-backend bundle and embedded route tests pass.
- Raster checks execute the actual Canvas painters with Skia Canvas 2D: all 24 scenes and 99 palettes render at silence, with audio, and with reduced detail/motion (297 combinations). Eighteen additional landscape/portrait/palette renders support visual inspection. Every palette has a changed pixel result when audio changes; Canvas transforms are restored after painting.
- Separate checks confirm the new scenes use fewer drawing calls at Performance detail, freeze travel under reduced motion, and sample low/high frequency bins independently. Saved retired theme IDs fall back safely.
- Browser UI and real audio capture were not exercised in this environment because a Chromium executable was unavailable. Existing React integration tests pass. Xiaomi Pad 8 / Android WebView frame rate, microphone behaviour and visual smoothness remain device checks. No APK or emulator workflow was run.

Device check: Settings → Background → enable the desired new themes, or use each theme's preview. Try all quality presets, silence versus music, portrait/landscape, scene transitions and reduced motion. Color Riot's old saved palettes should display Peach Sorbet until a new palette is selected.
