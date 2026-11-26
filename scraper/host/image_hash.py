"""Reads a product photo and prints its perceptual hash and a small thumbnail.

The host sends both to the Worker. The hash collapses a re-encoded copy of one
photo, and the thumbnail gives the review screen a small picture.

Usage: python image_hash.py <image file>
"""

import base64
import io
import json
import sys

from PIL import Image


def perceptual_hash(image: Image.Image) -> str:
    """The difference hash: one bit for each of the 64 steps between pixels."""
    gray = image.convert("L").resize((9, 8))
    pixels = list(gray.getdata())
    bits = 0
    for row in range(8):
        offset = row * 9
        for column in range(8):
            bits = (bits << 1) | (1 if pixels[offset + column] > pixels[offset + column + 1] else 0)
    return format(bits, "016x")


def thumbnail(image: Image.Image) -> str:
    """A small JPEG of the picture, as a data URL."""
    small = image.convert("RGB").resize((96, 96))
    buffer = io.BytesIO()
    small.save(buffer, format="JPEG", quality=70)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: image_hash.py <image file>", file=sys.stderr)
        return 2
    with Image.open(sys.argv[1]) as image:
        print(json.dumps({"phash": perceptual_hash(image), "thumb": thumbnail(image)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
