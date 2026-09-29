"""Encode frames rendered from the GLB into transparent browser-native animations.

Authoring dependency: Pillow. The deployed application only uses the WebP files.
"""

from pathlib import Path
import json
import sys

from PIL import Image


frames_dir, output_dir, revision, fps = sys.argv[1:]
frames_dir, output_dir, fps = Path(frames_dir), Path(output_dir), int(fps)
margin = 10
dimensions = {}
for clip in ("Idle", "HeadTilt", "Takeoff", "FlyLoop", "Glide", "Landing", "Stump"):
    selected = [Image.open(path).convert("RGBA") for path in sorted(frames_dir.glob(f"{clip}-*.png"))]
    if not selected:
        raise RuntimeError(f"Missing {clip} frames")
    boxes = [image.getchannel("A").getbbox() for image in selected]
    boxes = [box for box in boxes if box]
    if not boxes:
        raise RuntimeError(f"Empty {clip} frames")
    box = (
        max(0, min(b[0] for b in boxes) - margin),
        max(0, min(b[1] for b in boxes) - margin),
        min(selected[0].width, max(b[2] for b in boxes) + margin),
        min(selected[0].height, max(b[3] for b in boxes) + margin),
    )
    selected = [image.crop(box) for image in selected]
    dimensions[clip] = {"width": selected[0].width, "height": selected[0].height, "box": box}
    name = output_dir / f"owl-{clip.lower()}-{revision}.webp"
    selected[0].save(name, format="WEBP", save_all=True, append_images=selected[1:],
                     duration=round(1000 / fps), loop=0, quality=78, method=6,
                     lossless=False, exact=True)
    print(f"{name.name}: {name.stat().st_size} bytes, {len(selected)} frames, {box}")
(output_dir / f"owl-{revision}-dimensions.json").write_text(json.dumps(dimensions, indent=2) + "\n")
