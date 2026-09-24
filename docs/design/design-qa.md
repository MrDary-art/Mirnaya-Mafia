# Arena visual QA — 2026-09-25

Reference: [selected concept](home-reference.png). Browser captures: [desktop comparison](qa/home-comparison.png), [mobile Home](qa/home-mobile.png), [AI entry](qa/ai-entry-desktop.png), [transition](qa/ai-transition-early.png), [mobile More](qa/more-mobile.png), [STL angles](qa/mesh-angles.png). The detailed current QA gate is at [project root](../../design-qa.md).

## Verified

- Home typography, dark palette, lime CTA, slim desktop rail, four format links, and responsive mobile navigation follow the chosen composition.
- Home → AI entry and browser back work with the existing routes and API contracts.
- One WebGL canvas remains mounted across route changes (`canvasPersisted: true`). The owl changes position, scale and presence by route.
- Local Chrome/Playwright: desktop and mobile captures, no page or console errors, 1 WebGL canvas, 0 fallback images while WebGL is available.
- The user-provided STL is now used as the owl source. It is converted into front-facing high/low GLBs; the owl and stump are separate meshes, and the unused cartoon model has been removed.
- The supplied sculpt now has an editable Blender rig: 36 joints, including three neck controls, eyes, chest, clavicles, wings, eight feather controls, tail and both leg chains. A brighter graphite/emerald palette with violet iridescence, warm chest markings and amber eyes, plus Idle/Takeoff/Glide/Land clips, is exported to high/low GLBs. Small pupil meshes and morphing upper/lower eyelid approximations are bound to the eye bones.
- The feet and talons now belong to the owl mesh (minimum height 0.775), not the stump mesh (maximum height 0.929). Browser captures show a visible gap after takeoff and the stump held still on Home through the departure.
- The exported GLB rotation samples are checked for large left/right wing strokes and a stable head. The owl has a narrower folded resting pose; the initial Home reveal no longer plays a takeoff stroke.
- Post-rig Playwright QA: no page or console errors, no WebGL fallback, and one persistent canvas across Home → AI. Rig stills and browser captures are in `docs/design/qa/owl-rig-*.png`.
- Route transitions now have focus, preparation, takeoff, powered flight, glide, brake and landing phases, with wing strokes, banking, secondary feather lag and reduced-motion support. The owl flies away with its legs and talons; the independent stump stays stationary through departure before fading out.
- Idle behaviour has eight weighted variations with a three-action anti-repeat history and 2-9 second gaps; it is suspended during travel and for reduced motion. Gaze leads a small distributed X/Z neck/head movement; there is no pointer-driven Y rotation of the head or whole owl.
- Three.js strips punctuation from loaded GLB node names; the runtime now resolves the sanitized names, so eye, wing, feather, tail and leg controls are actually attached in the browser. Browser QA forces a blink and checks all four morph targets, in addition to 36 joints, four clips, no animated stump, a persistent canvas and no page/console errors.
- A raised-wing flash was traced to resetting mixer-driven bones before sampling: Three.js skipped writing an unchanged track, leaving the spread-wing bind pose visible. The runtime now subtracts only its own procedural offsets and holds the folded idle pose. A browser regression sampled 130 visible frames over 11 seconds with no spread-wing frame.
- Six stationary semantic supports are now built for AI, rooms, scenarios/history, learning, report, and profile/shop. The Home stump remains a separate, stationary source mesh.
- `npm run build` passes; route/motion unit tests pass (17/17), including first-frame folded wings with reduced motion. Desktop and mobile captures were refreshed; browser QA also captures the reduced-motion state.

## Open findings

| Priority | Finding | Required resolution |
| --- | --- | --- |
| P0 | The supplied STL is a stylized, fused statue with already-open wings. Procedural weights and four clips improve movement, but there are no independently layered feathers or fully separated wing anatomy. Morphing eyelid overlays close the eyes, yet still look like overlays in a close-up, not anatomy of the photoreal owl in the selected concept. | Production character-art pass: retopologize/segment or replace the sculpt with a properly licensed realistic model; model wing/feather/eyelid geometry, UV and paint PBR maps, hand-paint skin weights, and approve the silhouette in every animation extreme. |
| P1 | The motion bible's full Owl Lab UI, environmental reactions, route-specific narrative scenes, individual feather shed/transform events, richer path planner, and optional sound sync are not yet implemented. The new perches are procedural stand-ins, not final authored scene assets. The Home scene still uses the independently stationary stump required by the earlier brief. | Agree whether the latest Ring Perch replaces the earlier stump requirement, then author the missing assets, event hooks and scene-specific animation/QA. |
| P1 | The 3D negotiation core is a simple torus, not the sculptural, layered core in the selected concept. | Model and light the final core asset. |
| P1 | The wider app still uses existing page compositions under the new shell. | Redesign AI setup/live/report, scenarios, learning, rooms, profile and admin views in phases while preserving backend contracts. |
| P1 | The production build still warns about large main (~925 kB) and Three.js (~747 kB) chunks. | Split legacy page bundles and profile WebGL loading on lower-end devices. |
| P2 | Motion QA does not yet cover every route, WebGL loss, keyboard paths, or low-end mobile performance. | Extend visual and interaction coverage after the production owl is integrated. |

Final result: **not ready for full-design sign-off**. The raised-wing flash is fixed and browser-tested; feet/stump separation, richer plumage colours, wing-driven phased flight, distributed neck/gaze controls, blinking overlays, varied idle and semantic supports work. Production-quality realism and the complete scene/motion bible still require a different character-art source and a dedicated animation/visual QA pass.
