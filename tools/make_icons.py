#!/usr/bin/env python3
"""Draw the Radiotext home-screen icons: the radio mast from js/mosaic.js (ANTENNA)
on a blue Teletext band, black all round. Flat 8-colour Teletext palette, no smoothing.

Run from the repo root:  python3 tools/make_icons.py
"""
import re
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
GRID = 31  # square grid of cells; the mast is 19 wide, so 6 cells of black either side
PALETTE = {
    "K": (0, 0, 0), "R": (255, 0, 0), "G": (0, 255, 0), "Y": (255, 255, 0),
    "B": (0, 0, 255), "M": (255, 0, 255), "C": (0, 255, 255), "W": (255, 255, 255),
}

# Read the mast straight from the site's own mosaic so the two never drift apart.
src = (ROOT / "js" / "mosaic.js").read_text()
block = re.search(r"export const ANTENNA = \[(.*?)\];", src, re.S).group(1)
ANTENNA = re.findall(r"'([^']+)'", block)

# Mast in yellow, signal arcs in cyan, red beacon on top (white in the grid becomes yellow).
RECOLOUR = {"W": "Y"}


def draw(size):
    cell = size // GRID
    art = GRID * cell
    grid = Image.new("RGB", (GRID, GRID), PALETTE["K"])
    px = grid.load()
    band_top, band_h = 8, 14  # rows 8..21: the mast (12 rows) with one blue row above and below
    for y in range(band_top, band_top + band_h):
        for x in range(3, GRID - 3):
            px[x, y] = PALETTE["B"]
    ox = (GRID - len(ANTENNA[0])) // 2
    oy = band_top + 1
    for j, row in enumerate(ANTENNA):
        for i, ch in enumerate(row):
            if ch != ".":
                px[ox + i, oy + j] = PALETTE[RECOLOUR.get(ch, ch)]
    scaled = grid.resize((art, art), Image.NEAREST)
    out = Image.new("RGB", (size, size), PALETTE["K"])
    out.paste(scaled, ((size - art) // 2, (size - art) // 2))
    return out


if __name__ == "__main__":
    for name, size in (("icon-512.png", 512), ("icon-192.png", 192), ("apple-touch-icon.png", 180)):
        draw(size).save(ROOT / "icons" / name, optimize=True)
        print("wrote icons/" + name)
