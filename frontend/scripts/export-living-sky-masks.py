"""Author transparent sky windows against the existing registered forest plates.

The envelope points are intentionally conservative. Pixel classification preserves
most treeline/branch silhouettes; the original source never gets overwritten.
"""

from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "forest2d-source"
OUTPUT = ROOT / "public" / "assets" / "forest2d"

# Normalized upper-sky envelopes, traced on the shared 1672 × 941 source canvas.
PROFILES = {
    "hero": [(0.31, 0), (0.40, .10), (.50, .20), (.61, .28), (.72, .31), (.83, .30), (1, .24)],
    "ai": [(.42, 0), (.48, .10), (.59, .22), (.71, .30), (.84, .34), (1, .31)],
    "rooms": [(.53, 0), (.60, .11), (.71, .25), (.81, .30), (1, .28)],
    "scenarios": [(.19, 0), (.30, .14), (.43, .25), (.56, .30), (.66, .27), (.76, 0)],
    "learning": [(.18, 0), (.31, .17), (.47, .28), (.58, .35), (.67, .36), (.77, .32), (.88, .12)],
    "history": [(.39, 0), (.49, .15), (.60, .27), (.72, .32), (.84, .31), (1, .25)],
    "friends": [(0, .10), (.12, .20), (.27, .29), (.40, .35), (.52, .36), (.59, .28), (.65, 0)],
    "profile": [(.44, 0), (.52, .13), (.64, .27), (.76, .32), (.89, .31), (1, .24)],
}
MOBILE_FOCAL = {"hero": .73, "ai": .70, "rooms": .52, "scenarios": .36,
                "learning": .65, "history": .66, "friends": .34, "profile": .59}


def envelope_at(x, points):
    if x < points[0][0] or x > points[-1][0]:
        return -1
    for (left, top), (right, bottom) in zip(points, points[1:]):
        if left <= x <= right:
            amount = (x - left) / max(1e-8, right - left)
            return top * (1 - amount) + bottom * amount
    return -1


def export(scene, profile):
    image = Image.open(SOURCE / f"{scene}.png").convert("RGB")
    width, height = image.size
    alpha = Image.new("L", image.size)
    pixels = image.load()
    mask = alpha.load()
    for x in range(width):
        bottom = int(envelope_at(x / width, profile) * height)
        for y in range(max(0, bottom)):
            red, green, blue = pixels[x, y]
            luminance = red * .24 + green * .56 + blue * .20
            # Green leaves and dark trunks stay as natural occluders.
            if blue < green * .70 or red < green * .72:
                continue
            edge = min(1.0, (bottom - y) / 11)
            mask[x, y] = round(min(255, max(0, (luminance - 77) * 5)) * edge)
    alpha = alpha.filter(ImageFilter.GaussianBlur(.65))
    result = Image.new("RGBA", image.size, (0, 0, 0, 0))
    result.putalpha(alpha)
    target = OUTPUT / f"sky-mask-{scene}.png"
    result.save(target, optimize=True)
    print(f"{target.relative_to(ROOT)}: {target.stat().st_size:,} bytes")
    mobile_width = round(height * .66)
    left = max(0, min(width - mobile_width, int(width * MOBILE_FOCAL[scene] + .5) - mobile_width // 2))
    mobile_target = OUTPUT / f"sky-mask-{scene}-mobile.png"
    result.crop((left, 0, left + mobile_width, height)).save(mobile_target, optimize=True)
    print(f"{mobile_target.relative_to(ROOT)}: {mobile_target.stat().st_size:,} bytes")


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, shape in PROFILES.items():
        export(name, shape)
