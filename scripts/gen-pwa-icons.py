#!/usr/bin/env python3
"""Génère les icônes PWA PNG depuis les SVG (sans cairo, PIL only).

Convertit les chemins SVG (rect + beziers cubiques + arcs approx) en
polygones PIL puis exporte aux tailles attendues par le manifest / iOS.
"""
from __future__ import annotations

import re
from pathlib import Path

from PIL import Image, ImageDraw

PUB = Path(__file__).resolve().parent.parent / "web" / "public"

TOKEN_RE = re.compile(r"[MmLlHhVvCcAaZz]|-?[\d.]+")


def _tokenize(d: str):
    for m in TOKEN_RE.finditer(d):
        t = m.group(0)
        if t in "MmLlHhVvCcAaZz":
            yield ("cmd", t)
        else:
            yield ("num", float(t))


def _flatten(d: str, samples: int = 40) -> list[tuple[float, float]]:
    """Flatten un path (M/L/C/V/H/A/Z avec répétitions implicites) en segments."""
    pts: list[tuple[float, float]] = []
    toks = list(_tokenize(d))
    i = 0
    cur = (0.0, 0.0)
    start = (0.0, 0.0)
    last_cmd = None

    def want(n: int) -> bool:
        return len(toks) - i >= n and all(k == "num" for (k, _) in toks[i : i + n])

    while i < len(toks):
        kind, val = toks[i]
        cmd = val if kind == "cmd" else last_cmd
        if kind == "num":
            # Répétition implicite : réutilise la dernière commande.
            pass
        else:
            i += 1

        if cmd is None:
            break
        rel = cmd.islower()
        upper = cmd.upper()
        if upper == "Z":
            pts.append(start)
            cur = start
            last_cmd = cmd
            continue
        if upper == "M":
            if want(2):
                x, y = toks[i][1], toks[i + 1][1]
                p = (cur[0] + x if rel else x, cur[1] + y if rel else y)
                if not pts:
                    pts.append(p)
                    start = p
                else:
                    pts.append(p)  # lineto implicite après M
                cur = p
                i += 2
        elif upper == "L":
            if want(2):
                x, y = toks[i][1], toks[i + 1][1]
                cur = (cur[0] + x if rel else x, cur[1] + y if rel else y)
                pts.append(cur)
                i += 2
        elif upper == "H":
            if want(1):
                x = toks[i][1]
                cur = (cur[0] + x if rel else x, cur[1])
                pts.append(cur)
                i += 1
        elif upper == "V":
            if want(1):
                y = toks[i][1]
                cur = (cur[0], cur[1] + y if rel else y)
                pts.append(cur)
                i += 1
        elif upper == "C":
            while want(6):
                c = [toks[i + j][1] for j in range(6)]
                if rel:
                    c = [cur[0] + c[0], cur[1] + c[1], cur[0] + c[2],
                         cur[1] + c[3], cur[0] + c[4], cur[1] + c[5]]
                x0, y0 = cur
                for k in range(1, samples + 1):
                    t = k / samples
                    bx = ((1 - t) ** 3) * x0 + 3 * ((1 - t) ** 2) * t * c[0] + 3 * (1 - t) * t * t * c[2] + t ** 3 * c[4]
                    by = ((1 - t) ** 3) * y0 + 3 * ((1 - t) ** 2) * t * c[1] + 3 * (1 - t) * t * t * c[3] + t ** 3 * c[5]
                    pts.append((bx, by))
                cur = (c[4], c[5])
                i += 6
        elif upper == "A":
            if want(7):
                rx, ry, rot, laf, sf, ex, ey = (toks[i + j][1] for j in range(7))
                end = (cur[0] + ex if rel else ex, cur[1] + ey if rel else ey)
                pts.append(end)  # approximation linéaire de l'arc (suffisant pour l'icône)
                cur = end
                i += 7
        else:
            break
        last_cmd = cmd
    return pts


def render(svg: Path, size: int, out: Path) -> None:
    text = svg.read_text()
    bg_match = re.search(r'<rect[^>]*fill="([^"]+)"', text)
    vb = re.search(r'viewBox="0 0 (\d+) (\d+)"', text)
    scale = size / float(vb.group(1)) if vb else 1.0
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if bg_match:
        draw.rectangle([0, 0, size, size], fill=bg_match.group(1))
    for path in re.finditer(r"<path\s+d=\"([^\"]+)\"[^>]*fill=\"([^\"]+)\"", text):
        poly = [(x * scale, y * scale) for x, y in _flatten(path.group(1))]
        if len(poly) >= 3:
            draw.polygon(poly, fill=path.group(2))
    for stroke in re.finditer(
        r"<path\s+d=\"([^\"]+)\"[^>]*stroke=\"([^\"]+)\"[^>]*stroke-width=\"([^\"]+)\"", text
    ):
        poly = [(x * scale, y * scale) for x, y in _flatten(stroke.group(1))]
        w = max(1, int(float(stroke.group(3)) * scale))
        draw.line(poly, fill=stroke.group(2), width=w, joint="curve")
    img.save(out, format="PNG")


ICONS = [
    (PUB / "icon.svg", 192, PUB / "pwa-192x192.png"),
    (PUB / "icon.svg", 512, PUB / "pwa-512x512.png"),
    (PUB / "icon-maskable.svg", 512, PUB / "pwa-maskable-512x512.png"),
    (PUB / "icon.svg", 180, PUB / "apple-touch-icon.png"),
]


def main() -> None:
    for svg, size, out in ICONS:
        render(svg, size, out)
        print(f"✓ {out.name} ({size}x{size})")


if __name__ == "__main__":
    main()