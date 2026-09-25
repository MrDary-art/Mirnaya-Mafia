# Forest 2D route coverage

`full` and `calm` refer only to the new background. The existing owl behavior and functional timers remain independent. All active communication and timed exercise routes override the stored preference to `static` for the new 2D environment; the motion selector is hidden on those focused routes and returns with the user's saved choice elsewhere.

| Route or state | Landscape | New ambient motion | UI/state handling |
|---|---|---|---|
| `/login`, registration | Hero riverbank, dark form side | One slow branch and distant mist; selectable off | Existing auth form unchanged |
| Home sections `hero` → `finale` | Nine overlapping locations, river → cascade → lake | Clipped water, one rare leaf droplet, waterfall spray, occasional leaves, mist, small parallax | Existing scrolling controller, menu and owl retained |
| `/ai`, `/setup` | Quiet source pool | Calm water, no macro-droplet | Existing format/setup form unchanged |
| `/ai/job`, `/practice` | Source pool | Static | Input/chat/recording unaffected |
| `/scenarios`, dossier modal | Rock cascade | Calm waterfall on catalogue only | Cards, filters and modal remain DOM |
| `/play/:id` | Cascade frame | Static | Choices and timer unaffected |
| `/report/:id` | Mirror lake | One entry ripple, then quiet water | Actual report data unchanged |
| `/rooms`, `/rooms/demo` | Confluence | Calm water | Existing room creation/demo unchanged |
| `/room/:id` lobby, active, feedback, processing, finished | Confluence | Static throughout route | Video, readiness and backend status unaffected; no decorative fake progress |
| `/training`, `/training/path`, chapter | Terraced riverbank | Calm water | Existing path data and locks unchanged |
| `/theory`, `/theory/:lessonId`, `/training/path/level/:id`, attempt and review | Terraced riverbank | Static | Reading and exercises remain primary |
| Legacy `/learn` and `/training/errors` | Terraced riverbank | Static on active training/error routes | Legacy behavior unchanged |
| `/history` | River bend | Calm water | Real history unchanged |
| `/people`, `/people/:username` | Open bank | Calm water outside cards/chat | No leaves through messages |
| `/profile` | Mirror lake | Rare ripple | Actual profile/rewards unchanged |
| `/shop`, `/analytics` | Mirror lake | Calm water | Product data and prices unchanged |
| `/admin` | Mirror lake, heavily darkened | Static | Existing admin configuration unchanged |
| Unknown/404 | Hero forest fallback | Calm unless reduced-motion or user static | Existing 404 message and actions unchanged |

The background artwork is deliberately not a source of score, availability, AI status or user progress. The route matcher and exact scene coordinates are in `src/environment2d/sceneDefinitions.js`.
