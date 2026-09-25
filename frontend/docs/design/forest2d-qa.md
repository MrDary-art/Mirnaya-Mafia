# Forest 2D v6 — verification and handoff

Branch: `feature/forest-2d-v6`. No backend, database, API contract, dependency or owl-asset changes. No commit or deployment was made.

## Visual evidence

- Desktop and portrait Home chapters: [`forest2d-qa`](../../../docs/design/forest2d-qa/), including `desktop-hero.png`, `desktop-scenarios.png`, `desktop-ai.png`, `desktop-rooms.png`, `desktop-learning.png`, `desktop-profile.png` and corresponding mobile images.
- Transition stills: `boundary-ai.png`, `boundary-scenarios.png`, `boundary-profile.png`; the lower-water bridge hides the doubled horizon visible in the first pass.
- Droplet sequence: `droplet-forming.png`, `droplet-falling.png`, `droplet-ripple.png`. The source sits under the foreground leaf; the impact sits on the uncovered river to the left of the stump. The macro-droplet is disabled for the narrow portrait crop.
- Product and auth pages: [`forest-final`](../../../docs/design/design-pass-v4/forest-final/) has login, AI, setup, scenarios, training, rooms and profile screenshots at desktop and mobile sizes.
- Motion recordings: `ambient-forest-25s.webm` (27.40 s, river/drop/waterfall/reverse scroll) and `navigation-and-reverse.webm` (25.96 s, menu, product routes, reverse scroll and browser Back).
- Previous design evidence: [`forest-baseline`](../../../docs/design/design-pass-v4/forest-baseline/). This was a visual baseline, not an instrumented performance baseline.

## Functional and accessibility checks

Chrome headless with SwiftShader, local Vite frontend and backend, authenticated demo account:

| Check | Result |
|---|---|
| All nine Home sections, scroll down/up, browser Back, direct `/#scenarios` | Passed; direct anchor reached scrollY 2684 at 390 × 844 |
| 390 × 844, 768 × 1024, 1440 × 900, 1920 × 1080 | No horizontal document overflow |
| 720 × 450 CSS viewport as a 200%-zoom layout proxy | No horizontal overflow; this is not a literal browser zoom test |
| Mobile `Ещё` motion selector | Visible and changes mode to `static` |
| Reduced-motion context before page load | Defaults to `static` |
| Static mode | Canvas pixel `[0,0,0,0]`; no new animated layer |
| Focused `/admin` route | Poster renders in `static` mode; no visible motion control or browser errors |
| Forest WebP requests blocked | Home heading and primary link remain visible |
| Canvas 2D unavailable | Home heading and primary link remain visible |
| Browser page errors on captured core routes | None observed |

The background canvas and image layers have `pointer-events: none`; functional links and forms remain DOM. CSS mist/branch and Canvas effects pause while the tab is hidden. Auth's calm decoration has the same persistent motion control in the form.

## Performance and package checks

- `node --test` from `frontend`: 32 passed, 0 failed, including retained owl tests and new scene/projection/route/preference tests.
- `.venv/Scripts/python.exe -m pytest -q` from `backend`: 69 passed; one pre-existing Starlette/httpx deprecation warning.
- `npm.cmd run build`: passed. Vite reports the existing large-bundle warning; no new dependency was added.
- New hero artwork transfer: desktop poster 170,722 B + branch 195,220 B; mobile poster 76,040 B + branch 195,220 B. Excludes the preserved owl GLB and existing application code.
- New 2D Canvas is viewport-sized; DPR cap is 1.5 desktop and 1.25 mobile. At 1440 × 900 @ DPR 1, it is 1440 × 900 pixels. In Chrome headless with WebGL disabled, observed new-effect p95 was 0.4 ms full / 0.5 ms calm; static schedules no effect frames. With the existing owl under headless SwiftShader, new-effect p95 varied around 1.1–1.9 ms in settled desktop runs; software WebGL achieved only 4–6 total FPS. Effect time now follows elapsed wall time when frames are slow, so the 27-second droplet cycle does not stretch in software rendering. During automated mobile scrolling and screenshot capture, transient p95 spikes reached 15–33 ms. A sustained effect-frame overrun reduces the new 2D layer to calm cadence automatically; this is not a substitute for real-device profiling. These are environment-specific observations, not a claim of 60 FPS on user hardware. The old 3D baseline was not instrumented, so a numerical before/after FPS comparison is unavailable.

## Preserved owl boundary

Protected Git blob hashes before and after are identical:

| File | Git blob hash |
|---|---|
| `OwlController.js` | `139a6d30b23765a16a628ed294d17878389c928d` |
| `homeFlightMotion.js` | `7aafb3c307aa6e28c96e9f6e96d82508d0713df3` |
| `homeFlightPaths.js` | `8086fe0475681f47193e883d29ad7c1a72c5f723` |
| `routeVisuals.js` | `d59c8b04a89c67f4a90576b99c72e63a40da8462` |
| `owl-rigged-high.glb` | `7cea50301b834a0b2edbba9c3684dc364f187c0c` |
| `owl-rigged-low.glb` | `e343dc2cabf20e0393c5ed4c01f0ee749d9ce102` |

`ExperienceCanvas.jsx` was edited only to stop creating and rendering the independent old 3D decoration and to show the owl fallback only on an actual failure. Preserved renderer/camera settings: alpha + antialias + high-performance, SRGB, ACES Filmic exposure 1.02, PerspectiveCamera 42° at z=10. Preserved lights: hemisphere 0.85, key 2.15, face fill 0.65, green rim 2.8, violet point 1.6. Owl rig, path, action logic, stump, material setup and model files were not altered.

## Remaining limits

The generated PNG masters and transparent branch are useful editable sources, but not hand-retouched multi-plane paint files. Their shorelines are blended across section joins rather than drawn as one physically continuous panorama; close inspection can still reveal a soft double exposure during a transition. At 768 px, the pre-existing desktop owl position leaves part of its body outside the right edge; changing that protected pose was deliberately excluded. Real hardware FPS, literal 200% browser zoom, on-screen keyboard, live WebRTC/recording and long-session memory profiling remain unverified here. None of these should be represented as passed checks.
