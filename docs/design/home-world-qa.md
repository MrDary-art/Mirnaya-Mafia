# Continuous Home World — QA, 2026-09-25

The current implementation is an interactive foundation for the new Home concept, not final visual or animation sign-off.

## Verified

- One long Home route with Hero, AI, 1×1, Scenarios, Learning, History, Friends, Profile and a closing chapter. The existing product pages remain reachable from chapter CTAs.
- The left rail and mobile navigation move within Home, update their active marker from scroll, support direct `/#section` entry, and return from another route to the chosen Home chapter. Programmatic travel is capped at 1.5 s and yields to manual wheel/touch/keyboard input.
- One persistent WebGL canvas and one owl rig are used across chapters and route changes. The stump is attached to Hero only; the former page-specific perches were removed.
- Scroll intent drives the owl target; the rig catches up independently. Fast scrollbar movement from Hero to Profile was within 0.33 world units of the current target after 1.2 s in local Chrome, with no frame-to-frame position jump over 0.33 world units. Flight wings continue moving when scrolling stops. Reverse travel has a different lateral arc.
- Procedural 3D scene proxies enter early and overlap: AI orb, paired participant cores, scenario totems, learning constellation, history ribbon, friends network and profile helix. A single luminous spatial thread interpolates its shape between those worlds. Only nearby chapters are rendered; far proxies are hidden.
- Reduced-motion direct entry skips long travel. Desktop and mobile navigation, Hero return, AI route entry, and route-to-Home navigation passed the browser check with no page/console errors.
- The rig verification still passes: 36 joints, four clips, real wing tracks, stable head, separated stump/feet, blink morphs. Eleven seconds of seated observation showed no raised-wing bind-pose flash.
- A capped physical-feather particle can shed rarely in flight and continue drifting across a section boundary. It is disabled for reduced motion and limited to three feathers per mounted session.

## Browser evidence

[Hero](qa/home-world-hero.png) · [AI](qa/home-world-ai.png) · [1×1](qa/home-world-rooms.png) · [Scenarios](qa/home-world-scenarios.png) · [Learning](qa/home-world-learning.png) · [History](qa/home-world-history.png) · [Friends](qa/home-world-friends.png) · [Profile](qa/home-world-profile.png) · [Hero return](qa/home-world-return.png) · [Mobile Hero](qa/home-world-mobile-hero.png) · [Mobile AI](qa/home-world-mobile-ai.png)

Run locally: `cd frontend && node scripts/verify-home-world.mjs`. This script requires a running Vite server at `127.0.0.1:5173` and local Chrome. Unit checks: `node --test src/experience/*.test.mjs src/experience/owl/*.test.mjs`.

## Not yet at master-spec acceptance

- The user-provided STL is a fused, stylized sculpture with wings modeled open. Even with the rig's held rest pose, the Hero silhouette does **not** show anatomically fully folded wings or photoreal feathers. The enlarged, darkened stump is the same source sculpt, not a final premium wood asset. A production character and environment art pass remains necessary.
- The scene objects are procedural proxies. Their shared thread morphs, but the major sculptures do not yet transform into one another at authored cinematic quality. The Negotiation Core is still the earlier torus approximation.
- There are four authored rig clips, not the full requested bank/climb/descent/slow/fast set. Procedural motion varies by section and speed, but dedicated animation blending, hand-polished turn and landing variants, independent layered feather cards, convincing feather aerodynamics and the daily scroll-delivery sequence remain outstanding.
- General DOM forbidden-zone avoidance, spline/zone visualization in Owl Lab, every-route motion QA, low-end device profiling, and a fully authored camera/occlusion system are not complete. The 1×1 owl position was adjusted after screenshot review to avoid its headline and CTA.
- The production bundle still warns about large JS chunks. Further route code-splitting and asset streaming should precede low-end production rollout.

Result: **functional continuous-world prototype; not full master-spec or character-art sign-off.**
