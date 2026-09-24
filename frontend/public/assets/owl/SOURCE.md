# User-provided owl sculpture

`owl-sculpture-high.glb` and `owl-sculpture-low.glb` are optimized, front-facing,
Y-up conversions of the user-provided `owl_on_treestump.stl` (received 2026-09-24).
The source STL is not copied into the repository or modified. The conversion script
is `frontend/scripts/prepare-owl-stl.py`.

The sculpture GLBs separate the owl, including its legs and talons, from the stationary
stump. `build-owl-rig.py` imports them into Blender 5.2+, paints charcoal plumage
with muted teal/violet accents and darker wood, builds a 14-joint armature,
weights the single owl mesh, and exports `owl-rigged-high.glb` and
`owl-rigged-low.glb`. The editable high-resolution source is
`frontend/assets/owl-rig.blend`. Clips: Idle, Takeoff, Glide, Land. The app uses the
rigged assets; the sculpture GLBs remain reproducible inputs. The NLA strips must remain
unmuted during GLB export or Blender writes static wing tracks; `verify-owl-rig.mjs`
checks the exported rotation samples, not only the clip names.

This is an articulated version of the supplied sculpt, not a photoreal bird. Because
the STL is one fused, stylized print with raised wings and no UVs or separate feather
meshes, feather controls deform weighted regions; they do not individually articulate
every feather. Production character-art sign-off still requires manual retopology,
separate feather cards/meshes, UV/PBR texture maps, eyelid geometry, and review of the
folded resting silhouette. The current folded pose is a weighted approximation that
keeps the wings narrow on Home; the previous CC0 low-poly prototype is not used.
