"""Make lightweight transparent web cloud layers from project-owned masters."""

from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "living-v8-source"
OUTPUT = ROOT / "public" / "assets" / "forest2d"

if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name in ("sky-cloud-far", "sky-cloud-near"):
        image = Image.open(SOURCE / f"{name}.png").convert("RGBA")
        # Generated cutouts have a light/blue matte at near-transparent edges.
        alpha = image.getchannel("A").filter(ImageFilter.MinFilter(3))
        alpha = alpha.point(lambda value: min(255, max(0, round((value - 18) * .86))))
        image.putalpha(alpha)
        image.thumbnail((1400, 800), Image.Resampling.LANCZOS)
        target = OUTPUT / f"{name}.webp"
        image.save(target, "WEBP", quality=86, method=6)
        print(f"{target.relative_to(ROOT)}: {image.size}, {target.stat().st_size:,} bytes")
