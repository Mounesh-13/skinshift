"""Generates SkinShift's original icon artwork (no third-party logos).

Run: python3 tools/make-icons.py   (requires Pillow)
Design: violet->teal rounded square with two offset wave strokes ("the shift").
"""
import math
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "icons")


def icon(size: int) -> Image.Image:
    s = size * 4  # supersample for clean edges, then downscale
    grad = Image.new("RGBA", (s, s))
    px = grad.load()
    c1, c2 = (124, 92, 255), (0, 201, 180)
    for y in range(s):
        for x in range(s):
            t = (x + y) / (2 * s)
            px[x, y] = tuple(int(c1[i] * (1 - t) + c2[i] * t) for i in range(3)) + (255,)

    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=255)
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    img.paste(grad, (0, 0), mask)

    draw = ImageDraw.Draw(img)
    width = max(2, int(s * 0.075))
    for k, alpha in ((0, 255), (1, 150)):
        pts = []
        for i in range(101):
            x = s * 0.18 + s * 0.64 * i / 100
            y = s * (0.5 + 0.12 * math.sin(i / 100 * 2 * math.pi + k * math.pi / 2)) + (k - 0.5) * s * 0.14
            pts.append((x, y))
        draw.line(pts, fill=(255, 255, 255, alpha), width=width, joint="curve")
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for size in (16, 32, 48, 128):
        icon(size).save(os.path.join(OUT, f"icon{size}.png"))
    print("icons written to", os.path.abspath(OUT))
