# Artwork and sound for Arena Serial

- `backgrounds-atlas.webp`: four original illustrated locations, generated for this project with OpenAI ImageGen. Layout: school rehearsal room, family kitchen, courtyard café, shared office; 2×2 tiles, each 724×543 pixels. Art brief: warm hand-painted visual-novel environments, Russian everyday life, believable lighting, no text or logos.
- `characters-atlas-v5.png`: twenty-four original fictional characters refined with OpenAI ImageGen for clearer eyes, hair and clothing detail. Layout: 6×4 cells in a 1536×1024 atlas. The interface clips it with the cleaned alpha from `characters-atlas-v4.webp`, preserving precise cutout edges without frames or colored halos. Art brief: consistent realistic visual-novel portraits; distinct teenagers, parents, teachers, friends, students and colleagues; varied appearances and natural clothing; no text or logos.
- `quiet-evening.wav`: original locally synthesized ambient music. Reproduce with `python frontend/scripts/create-serial-score.py`. No downloaded samples. Playback starts only after the user turns music on.
- `literata.ttf`: Literata variable font from the official Google Fonts repository (`ofl/literata/Literata[wght].ttf`), licensed under SIL Open Font License 1.1. See `OFL-Literata.txt`.

Raster files are encoded as WebP for the browser. Keep the atlas geometry in sync with `SerialBackdrop` and `SerialPortrait`. Source generation and encoding intermediates remain in the local `.cache/arena-serial/` directory and are not required at runtime.
