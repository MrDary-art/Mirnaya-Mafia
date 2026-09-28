# Public landing design QA

## Result

**Passed.** The public `/` page follows the supplied landing reference and prompt: forest hero, compact sticky navigation, no sign-in form displayed by default, and sign-in/registration in a modal over the same page. Repeated explanations were removed and remaining copy shortened across the hero, sections, cards, demo, and footer. The authenticated `/app` page was left unchanged.

The three main page sections now follow the requested reading order: Description → Modes → About.
The comparison/branching pitch, sample report and company teaser, final promotional panel, and interactive demo shown in the follow-up screenshots have been removed from the public page. The description section keeps its short four-step overview; footer links no longer point to removed blocks.

## Visual evidence

- Source of truth: the screenshot attached to the user request in this conversation (about 1298 × 839 px; it is not available as a local raster file).
- Compared implementation capture: `.cache/landing-qa/minimal-hero.png` (1300 × 840 px, initial landing state).
- Focused captures: `.cache/landing-qa/minimal-modes.png`, `.cache/landing-qa/final-desktop-auth.png`, and `.cache/landing-qa/final-mobile-auth.png`.
- Desktop hero comparison: the forest and river remain visible, the hero copy sits on the left, navigation stays in a compact top bar, and there is no default auth card. The modal dims and blurs the same background.
- Mobile review: the navigation collapses into a menu and the auth modal becomes a bottom sheet that fits a 390 × 844 viewport.

## Interaction checks

- Top navigation reaches `#about`, `#description`, and `#modes`; tested anchor position is 92 px below the viewport top so the sticky header does not cover the section.
- IntersectionObserver updates the active navigation item. The modes anchor was retested after correcting selection when adjacent sections are visible together.
- Auth modal opens from the header, hero, and mode actions; mode actions select registration. Escape, close button, browser Back/Forward, focus trapping, focus restoration, and scroll locking were checked.
- Login through the modal with the existing local demo account reaches `/app`. Registration mode opens and the existing API returns an inline validation message for an already-used account; no test account was created.
- Direct `/login` and `/register` routes redirect to the public page and open the matching auth modal. The legacy standalone auth screen has been removed. `/demo/rooms` and `/report/example` still render their public pages.
- Mobile menu opens, closes after choosing an anchor, and returns focus to its menu button after opening and closing auth.
- Footer is present at the end of the page; the sticky header remains at the top during a long scroll.
- No browser runtime errors in the tested flows.
- Logging out from `/app` or site administration returns to the clean public landing with no auth modal; it does not reopen the legacy screen.

## Responsive viewports

Checked for horizontal overflow at 375 × 667, 390 × 844, 430 × 932, 768 × 1024, 1280 × 720, 1440 × 900, and 1920 × 1080. None was found.

## Build

`npm run build` passes. Vite reports its existing large Three.js chunk warning (746.95 kB); this task did not change chunking or add dependencies.

## Verification limit

The successful registration-to-`/app` case was not run because it would create a persistent account in the local development database. The shared registration API path, registration UI, and duplicate-account validation were verified instead.
