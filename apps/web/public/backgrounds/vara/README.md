# VARA spiral reference

Source: https://www.vara.ae/en/ (retrieved 2026-09-23).

- `source.glb`: original geometry from https://www.vara.ae/VARA_PATTERN_9.glb
- `environment.jpg`: original lighting panorama from https://www.vara.ae/dubai4.jpeg
- `material.png`: base-color texture extracted from `source.glb`.
- `spiral.bin.gz`: lossless decoded positions, normals, UVs and triangle indices.

The model and panorama originate from VARA. They are not original Arena artwork.
The renderer, controls, alternative backgrounds and color customization are implemented in this project.

Regenerate the runtime mesh after `npm ci` using `node scripts/prepare-spiral.mjs`.
The binary format is a 16-byte header (`ARNA`, uint32 version 1, vertex count,
index count), followed by float32 positions, float32 normals, float32 UVs and
uint32 indices, all little-endian, compressed with gzip. No geometry simplification
is performed. The original rotation rate is 0.15 radians per second.

All runtime resources are served locally; no request to VARA or a decoder CDN is needed.
