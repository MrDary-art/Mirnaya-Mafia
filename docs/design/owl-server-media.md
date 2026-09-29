# Owl media delivery

The Home owl uses six transparent animated WebP files and one static stump image
in `frontend/public/assets/owl/media/`.
The animations are rendered at 24 frames per second. The Idle loop plays its
inner frames back in reverse to avoid a visible jump from the last pose to the
first. Asset filenames also include the frame rate, so browsers refresh the
animations when the encoding changes.
They are rendered from the repaired GLB during asset preparation. The production server
serves the finished images as static files; visitors do not download the GLB or run
Three.js/WebGL for the owl. The browser only moves the decoded image in response to
the existing Home scroll snapshot. Weak devices, reduced-motion users, and media load
failures use the static poster.

To regenerate after an owl model change:

1. Update `OWL_SHA256` in `frontend/src/experience/owl/owlV4.js` after verifying the GLB.
2. Install the authoring tools: Chrome, Python 3 with Pillow, and the existing frontend
   npm dependencies. Pillow is only used by the media encoder, not by the app or server.
3. From `frontend/`, run `node scripts/prepare-owl-media.mjs`. On Windows it uses `py -3`;
   set `ARENA_PYTHON` or `ARENA_CHROME_PATH` if the tools are elsewhere.
4. Run `npm run build` and `node scripts/verify-server-owl.mjs` against a local frontend
   and backend. Deploy the new frontend build together with the generated media files.

The generator checks the GLB hash and writes source dimensions to
`frontend/src/experience/owl/owlMedia.json`. Asset filenames include the source hash
so clients fetch the new animation after deployment.
