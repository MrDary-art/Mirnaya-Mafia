# Arena Negotiations — design QA

Latest addition: [Owl v4.1 deformation, flight and perch repair](docs/design/owl-v4-repair.md), following the user's feedback on the [initial v4 integration](docs/design/owl-v4-integration.md). The [forest interface review](#forest-interface--2026-09-27) below is retained; its forest background is unchanged, with the new foreground character on authenticated Home. Earlier owl/model requirements below are historical, not current blocking findings.

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

Historical outcome: not ready for the former full-design sign-off.

The supplied STL now has a working colored armature, separated feet and stump, and visible wing-driven route animation. Its fused stylized topology still cannot provide the requested photoreal owl with individually moving feathers.

## Forest interface — 2026-09-27

### Scope and evidence

The current target is the existing «Как это работает» visual language: translucent woodland-green panels, readable warm-white typography, distinct accent panels, themed controls and a forest background without an owl. This is a style-system transfer, not a pixel-identical copy of the guide layout: working forms, history and reports retain their own information hierarchy.

- Source visual truth: `.cache/design-forest-review/guide-reference.png`, captured from `/ai/demo`.
- Rendered implementation: `.cache/design-forest-review/ai-desktop.png` and `ai-mobile.png`; full route captures in `.cache/design-audit-current/`.
- Combined source/implementation comparison: `.cache/design-forest-review/comparison.png`.
- Source and implementation originals: 1440 × 900 pixels, CSS viewport 1440 × 900, deviceScaleFactor 1. The comparison presents both at the same 50% scale, with captions, in a 1440 × 490 canvas. There is no density mismatch.
- Mobile: 390 × 844 CSS pixels and image pixels, deviceScaleFactor 1. Public landing is unauthenticated; application captures use the existing demo account and its actual data.
- The combined view is for composition and palette. Original 1:1 captures were also inspected for text, icons and dense controls: `scenario-picker-desktop.png`, `history-mobile.png`, `company-settings.png` in the forest-review directory; `assignment-picker.png`, `material-picker.png`, `report-mobile.png`, `play-mobile.png` in `.cache/design-working-review/`. A pixel-aligned focused source crop is not used because the guide has no corresponding forms/history/report; these are functional and visual-consistency checks, not exact-layout comparisons.

### Findings and iteration history

All actionable findings listed here were corrected and checked in revised browser captures.

1. **P1 — Working screens retained opaque navy cards.** These did not follow the translucent green guide. Shared surfaces now use green gradients, moss borders, backdrop blur and restrained inset highlights; primary practice, interview, scenario and company panels have distinct accents. An overly specific generic selector initially suppressed the accent rules; its complex entries were moved into `:where(...)`. Final evidence: `comparison.png`, `ai-desktop.png`, `training-desktop.png`, `company-desktop.png`.
2. **P1 — Long history verdict overlapped the title/action columns.** The verdict is now part of the description, with a short, separate action label. Desktop tracks use a shrinkable content column; mobile actions sit below the description. Long summaries are limited to two preview lines, with the full result in the report. Browser bounding-box checks find no desktop text/action overlap. Revised evidence: `history-desktop.png`, `history-mobile.png`, including the reported «Конфликт приоритетов между командами» entry.
3. **P1 — Public landing lacked the requested forest; authenticated Home had a rectangular top overlay.** Landing now uses the existing responsive forest image. The first scene no longer fades its top into a flat background, and the redundant hero pseudo-element overlay is removed. Revised evidence: `landing-desktop.png`, `landing-mobile.png`, `home-desktop.png`, `home-mobile.png`.
4. **P2 — Open dropdown menus were outside the theme.** Global native-select styling now covers both the closed control and the opened `::picker(select)` in supporting browsers, including selected, hover, focus and disabled states. Native keyboard and form semantics remain intact. Revised evidence: `scenario-picker-desktop.png`, `.cache/design-working-review/assignment-picker.png`, `material-picker.png`, `analytics-picker.png`, `interview-picker.png`. Company tabs and their visible enabled selectors were opened/closed in the browser.
5. **P2 — Account controls floated over mobile content while scrolling.** The controls now scroll with the page instead of overlaying text. Revised evidence: `history-mobile.png` at the scrolled list position.
6. **P2 — Report contents occupied too much mobile space.** Contents links now form one horizontally scrollable row, with consistent green outlined controls. Long conclusion headings use responsive type and line spacing. Revised evidence: `.cache/design-working-review/report-mobile.png`.
7. **P2 — Interface emoji and transliterated corporate copy were inconsistent.** Interface emoji/star/check/send glyphs were replaced with the existing icon library, StarRating component or textual currency labels. Company labels now have explicit Russian phrases and corrected punctuation. Existing purchased avatar illustrations were preserved; they are user-selected profile assets, not Unicode interface emoji. Source scan found no characters in U+1F300–U+1FAFF or U+2600–U+27BF in frontend JS/JSX/CSS. Revised evidence: profile, friends, shop and company captures.

### Required fidelity surfaces

- **Fonts and typography:** locally bundled Manrope, including Cyrillic; warm-white headings, readable muted labels, coherent weights. Long history titles and verdicts wrap without entering the action column. Report mobile headings were checked with a real long conclusion.
- **Spacing and layout rhythm:** consistent upper Back controls, rounded cards, form spacing, calendar controls and responsive grids. The 19-route desktop/mobile matrix has no document-level horizontal overflow. Intended internal scrolling remains for wide tables, report contents and navigation.
- **Colors and tokens:** translucent green surfaces follow the guide. Olive/gold, moss and teal accents distinguish important areas without changing semantic success/error states. Selected controls have a stronger fill and visible focus treatment.
- **Image quality:** existing desktop/mobile WebP forest assets are reused, with responsive cropping and no owl in the background. Public and authenticated first screens were visually checked; the top flat strip is removed. Existing icon assets are retained instead of improvised emoji.
- **Copy and content:** corporate text and labels corrected; backend-provided results remain unchanged. The historical verdict is relocated, not rewritten. Currency labels use «зв.» or the existing star icon.
- **Interactions and motion:** themed native dropdowns open and close; scenario selection responds to keyboard navigation. Company navigation, expanded forms, history-to-report, history-to-active-session and booking calendar render correctly. Motion is restrained and reduced-motion preferences are respected.

### Implementation and verification

- Shared design: `frontend/src/design/site-polish.css`, `form-controls.css`, imported in `src/main.jsx`.
- Layout fixes: `pages/History.jsx`, `pages/AiMode.jsx`, `pages/LandingPage.jsx`, `pages/landing.css`, `environment2d/environment2d.css`.
- Copy/icons: `pages/Company.jsx`, `Friends.jsx`, `Profile.jsx`, `Shop.jsx`, `Login.jsx`, `Home.jsx`, `LearningPath.jsx`, `ChapterPath.jsx`, `Room.jsx`, `RoomHub.jsx`; `components/SocialProfile.jsx`, `components/cosmetics/CosmeticVisual.jsx`.
- `npm.cmd run build`: passed. Existing Three.js chunk-size warning remains; no new dependency or backend contract change was introduced by this design pass.
- `node --test src/design/pageRegistry.test.mjs src/environment2d/environment2d.test.mjs src/experience/homeWorldModel.test.mjs`: 12/12 passed.
- `node scripts/design-audit-current.mjs`: 19 routes × desktop/mobile; checks document overflow, runtime and console errors.
- `node scripts/design-forest-review.mjs`: public/authenticated Home, guide comparison, main modes, company subpages/settings/selectors, booking calendar, history overlap and keyboard checks.
- `node scripts/design-working-review.mjs`: actual report and active negotiation, profile editor, analytics/interview, opened assignment and material forms, desktop/mobile. Passed without runtime/console errors. Forms were inspected without submitting corporate changes.
- `git diff --check -- frontend/src`: passed (only Git line-ending notices).

### Remaining scope limits

- Verification used local Chrome through user-approved Playwright, not every browser or physical device. Browsers without `appearance: base-select` retain native popup behavior and the themed closed control/options; operating-system popup rendering is browser-controlled.
- Existing data and empty states were inspected. This visual pass did not create new AI sessions, submit company forms, buy cosmetics or retest every backend workflow.
- Existing historical QA notes above refer to a superseded owl concept, not current blocking findings. No actionable P0/P1/P2 visual issue remains in the inspected current states.

final result: passed
