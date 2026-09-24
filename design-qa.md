# Arena Negotiations — design QA

Historical QA for the previous Home composition. The current continuous-world review is [docs/design/home-world-qa.md](docs/design/home-world-qa.md).

Date: 2026-09-25.

## Evidence and normalization

- Source visual truth: `docs/design/home-reference.png` (selected concept 1, 1487 × 1058 px) and the user-provided `owl_on_treestump.stl`.
- Rendered implementation: `docs/design/qa/home-desktop.png` (1440 × 1024 px), `home-mobile.png` (390 px CSS width, full-page capture), `ai-entry-desktop.png`, and `ai-transition-early.png`.
- Full-view side-by-side: `docs/design/qa/home-comparison.png`. The source is fitted to 1440 × 1024 beside an implementation capture of the same CSS viewport at deviceScaleFactor 1; aspect ratios differ by less than 0.1%.
- State: authenticated Home at rest; Home → AI entry transition; mobile Home/More. The source concept does not specify a mobile frame or AI-entry frame, so those are functional checks rather than pixel-fidelity comparisons.
- Focused comparison: `docs/design/qa/mesh-angles.png` shows all four sides of the converted STL. The source and rendered owl are large enough to evaluate their subject, pose and material in the full-view comparison; a tighter crop would not change the findings.
- Browser checks: Chrome via Playwright, no page/console errors, one persistent WebGL canvas, no fallback image while WebGL is available. Navigation to AI, browser back and mobile More were exercised.
- Latest live preview check: `docs/design/qa/home-comparison.png` places the selected reference and the current 1440 x 1024 browser capture together at the same viewport; `home-mobile.png` and `ai-entry-desktop.png` show the responsive and navigation states. The real backend was running for the capture, with the demo account.
- Post-rig evidence: `docs/design/qa/owl-rig-rest.png`, `owl-rig-takeoff.png`, `owl-rig-stump-only.png`, `owl-rig-body-only.png` (Blender renders), plus `owl-rig-home.png`, `owl-rig-takeoff-browser.png`, `owl-rig-flight.png`, `owl-rig-land.png` and eye close-ups (browser captures). `node scripts/verify-owl-rig.mjs` verifies 36 skin joints, four animated clips, actual wing rotation samples, stable head, separated feet/stump, blinking morphs, successful browser rendering and persistent canvas. `node scripts/diagnose-owl-motion.mjs` checks for the raised-wing idle flash over 11 seconds.

## Findings

| Priority | Surface | Evidence and impact | Fix |
| --- | --- | --- | --- |
| P0 | Image quality | The source concept shows a natural, feathered owl with folded wings; the supplied STL remains a stylized sculpture with no UVs or independently modeled feathers. The 36-joint rig, vertex colours and overlaid morphing eyelids improve it, but the base shape and close-up eyelid anatomy cannot match the photoreal concept. | Manually retopologize/segment or replace the sculpt, add layered feathers and anatomical eyelids, UV/PBR maps, and refine the rig/weights against the concept. Keep the current rig as the functional integration baseline. |
| P1 | Image quality and composition | The sculpt's broad wings and small body change the hero silhouette substantially. The source owl fills the right side with a folded, perched profile; the implementation still reads as a frontal statue, despite the narrower rest pose. | Author a production character model with a natural perched profile and approve its flight silhouettes. |
| P1 | Spacing / core imagery | The source has a layered sculptural Negotiation Core; implementation uses a dark two-torus approximation that occupies a similar region but lacks the surface detail. | Replace with a modeled core and purpose-built material/lighting. |
| P1 | App coverage | The new visual system and 3D scene wrap existing routes, but AI, scenarios, report and other pages still retain legacy page composition. | Redesign each route against the master spec without changing backend contracts. |
| P1 | Performance | Build warns about a ~936 kB main JS chunk and ~747 kB Three.js chunk. Rigged GLBs are ~5.3 MB desktop and ~2.4 MB mobile; low-end-device frame rate is not yet measured. | Split legacy page bundles and run real-device performance profiling. |

## Required fidelity surfaces

- Fonts / typography: locally bundled Manrope keeps the source's geometric sans direction; the implementation headline fits two desktop lines. Weight and fine optical spacing are still not exact.
- Spacing / layout rhythm: rail, hero/text split, CTA and four-format strip follow the concept; mobile stacking is readable, but the desktop owl's silhouette is necessarily different.
- Colors / tokens: dark graphite, warm-white text, lime CTA and green rim light align with the concept. The rigged owl now uses a brighter graphite/emerald palette, violet iridescence, warm chest markings, amber eyes and darker wood, but not UV/PBR feather textures.
- Image quality: the STL gives genuine 3D volume and detailed relief, with high/low LODs and animated wings. It cannot match the photoreal bird depicted in the concept, which remains the blocking gap.
- Copy / content: hero headline, subline, CTA and secondary link match the master spec; no fictitious usage statistics were inserted.

## Comparison history

1. Initial capture showed a low-poly cartoon GLB, oversized on mobile. It was removed and replaced by the user's STL. Browser screenshot evidence: current side-by-side plus `docs/design/qa/mesh-angles.png` for source geometry.
2. First STL capture showed a pale, side-facing statue and misaligned owl/stump. The mesh was rotated to face forward, split into independently animated owl/stump meshes, given darker vertex colors and adjusted lighting. The high/low GLBs were simplified for runtime delivery.
3. Second capture showed a too-small mobile owl and overlap at AI entry. Mobile scale and AI position were corrected; `home-mobile.png` and `ai-entry-desktop.png` are post-fix evidence.
4. Motion was changed from frame-dependent damping to a 950 ms eased route arc. Unit tests verify midpoint, landing and reduced-motion snap. `ai-transition-early.png` is transition evidence.
5. Blender rig added with 14 joints and four clips; route travel now takes 1600 ms to stage takeoff, glide and landing. Workbench and EEVEE renders exposed an initial wing-axis error, which was corrected before the final browser smoke test. Plumage/wood vertex colors replaced the neutral stone finish.
6. The first added eye geometry looked unnaturally protruding in `owl-rig-rest.png`, so it was removed and the existing eye relief was painted instead. The subsequent browser comparison exposed the remaining stylized silhouette.
7. A geometry cut had left the talons on the stump; the regenerated owl mesh now includes both feet, and the stump remains independent. Muted NLA strips had exported static wing tracks even though Blender previews moved; the export was corrected and binary rotation samples are now asserted. A narrower swept rest pose, stronger shoulder/feather flight strokes and cooler charcoal lighting were verified in browser captures. Initial Home load now fades in perched rather than playing a takeoff.

## Verification and next checklist

- `npm run build`: passed.
- `node --test src/experience/routeVisuals.test.mjs src/experience/owl/*.test.mjs`: 17/17 passed, including held idle wings, first-frame reduced-motion pose, semantic supports, no pointer-driven Y-axis rotation and no accumulated head tilt.
- `node scripts/capture-design.mjs`: passed; no console/page errors, canvas persisted across navigation.
- `node scripts/verify-owl-rig.mjs`: passed; 36 joints, non-static wing clips, stable head, separated feet/stump, blinking morphs, canvas persistence and no page/console errors.
- `node scripts/diagnose-owl-motion.mjs`: passed; 130 visible samples over 11 seconds, no raised-wing bind-pose frame.
- `node scripts/capture-design.mjs` against the running frontend and backend: passed again after lighting/eye changes, with one persistent canvas, no fallback image and no browser errors.
- Remaining: production-grade owl topology/individual feathers/UV-PBR/eyelids and natural perched profile, core model, route-by-route redesign, real-device motion/performance and WebGL-loss QA.

final result: not ready for full-design sign-off

The supplied STL now has a working colored armature, separated feet and stump, and visible wing-driven route animation. Its fused stylized topology still cannot provide the requested photoreal owl with individually moving feathers.
