"""Export the checked-in forest masters as optimized desktop/mobile WebP assets.

Run with a Python installation that has Pillow: python scripts/export-forest2d.py
"""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "assets" / "forest2d-source"
OUTPUT = ROOT / "public" / "assets" / "forest2d"

# Focal points are hand selected so each portrait scene keeps its water geography.
MOBILE_FOCAL_X = {
    "hero": 0.73,
    "ai": 0.70,
    "rooms": 0.52,
    "scenarios": 0.36,
    "learning": 0.65,
    "history": 0.66,
    "friends": 0.34,
    "profile": 0.59,
}


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, focal_x in MOBILE_FOCAL_X.items():
        with Image.open(SOURCES / f"{name}.png") as source:
            poster = source.convert("RGB")
            poster.save(OUTPUT / f"{name}.webp", "WEBP", quality=83, method=6)
            crop_width = round(poster.height * 0.66)
            center_x = round(poster.width * focal_x)
            left = max(0, min(poster.width - crop_width, center_x - crop_width // 2))
            portrait = poster.crop((left, 0, left + crop_width, poster.height))
            portrait.save(OUTPUT / f"{name}-mobile.webp", "WEBP", quality=80, method=6)
    with Image.open(SOURCES / "branch.png") as source:
        source.convert("RGBA").save(OUTPUT / "branch.webp", "WEBP", quality=86, method=6)


if __name__ == "__main__":
    main()
