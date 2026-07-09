"""Generate clearly-labelled DEMO placeholder book covers + a demo catalogue.

These are NOT real books — they exist only to demonstrate the pin templates.
Each cover is stamped "DEMO PLACEHOLDER". Replace demo/covers with your own
cover files and run `pinfactory init` to build your real catalogue.
"""
from __future__ import annotations

import csv
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

from pinfactory.themes import hex_to_rgb, _cached_font

HERE = Path(__file__).resolve().parent
FONTS = HERE.parent / "fonts"
COVERS = HERE / "covers"
COVERS.mkdir(parents=True, exist_ok=True)

DEMO = [
    dict(slug="the-thornwood-vow", title="The Thornwood Vow", author="A. DEMO",
         pen_name="Example Dark Romance Pen", subgenre="dark romance",
         tropes="enemies to lovers; morally gray hero; forced proximity",
         tagline="He was her enemy. Now he is her vow.",
         top="#3A0E1E", bottom="#0B0407", accent="#B54A4A", ink="#F3E4DE"),
    dict(slug="lighthouse-lane", title="Lighthouse Lane", author="B. DEMO",
         pen_name="Example Small-Town Pen", subgenre="contemporary romance",
         tropes="grumpy sunshine; small town; second chance",
         tagline="Some tides always bring you home.",
         top="#274A45", bottom="#0F1E1B", accent="#E0A45C", ink="#F6F1E7"),
    dict(slug="a-crown-of-embers", title="A Crown of Embers", author="C. DEMO",
         pen_name="Example Fantasy Pen", subgenre="fantasy romance",
         tropes="fated mates; court intrigue; enemies to lovers",
         tagline="Two thrones. One forbidden bond.",
         top="#1C1B33", bottom="#08070F", accent="#C7A24A", ink="#F1ECFF"),
]


def _grad(size, top, bottom):
    w, h = size
    t, b = hex_to_rgb(top), hex_to_rgb(bottom)
    img = Image.new("RGB", size)
    d = ImageDraw.Draw(img)
    for y in range(h):
        f = y / (h - 1)
        d.line([(0, y), (w, y)], fill=(int(t[0] + (b[0] - t[0]) * f),
                                       int(t[1] + (b[1] - t[1]) * f),
                                       int(t[2] + (b[2] - t[2]) * f)))
    return img


def make_cover(spec):
    W, H = 800, 1200
    img = _grad((W, H), spec["top"], spec["bottom"])
    # soft glow blob for depth
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse([W * 0.1, H * 0.05, W * 0.9, H * 0.5], fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    tint = Image.new("RGB", (W, H), hex_to_rgb(spec["accent"]))
    img = Image.composite(Image.blend(img, tint, 0.35), img, glow)
    d = ImageDraw.Draw(img)
    ink = hex_to_rgb(spec["ink"])
    acc = hex_to_rgb(spec["accent"])

    # author kicker
    af = _cached_font(str(FONTS / "WorkSans-Bold.ttf"), 30)
    txt = spec["author"].upper()
    tw = d.textlength(txt, font=af)
    d.text(((W - tw) / 2, H * 0.16), txt, font=af, fill=acc)

    # title (wrap)
    tf = _cached_font(str(FONTS / "Gloock-Regular.ttf"), 86)
    words, lines, cur = spec["title"].split(), [], ""
    for wd in words:
        trial = (cur + " " + wd).strip()
        if d.textlength(trial, font=tf) <= W * 0.82:
            cur = trial
        else:
            lines.append(cur); cur = wd
    lines.append(cur)
    y = H * 0.24
    for ln in lines:
        lw = d.textlength(ln, font=tf)
        d.text(((W - lw) / 2, y), ln, font=tf, fill=ink)
        y += 96

    # DEMO stamp so nobody mistakes these for real books
    sf = _cached_font(str(FONTS / "WorkSans-Bold.ttf"), 26)
    stamp = "DEMO PLACEHOLDER"
    sw = d.textlength(stamp, font=sf)
    d.rectangle([(W - sw) / 2 - 16, H * 0.9 - 8, (W + sw) / 2 + 16, H * 0.9 + 40],
                fill=(0, 0, 0))
    d.text(((W - sw) / 2, H * 0.9), stamp, font=sf, fill=(255, 255, 255))

    out = COVERS / f"{spec['slug']}.png"
    img.save(out)
    return out


def main():
    for spec in DEMO:
        print("cover:", make_cover(spec).name)
    # catalogue CSV
    cat = HERE / "catalog.csv"
    with cat.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["slug", "title", "pen_name", "series", "subgenre", "tropes",
                    "tagline", "destination_url", "priority", "cover_path"])
        for s in DEMO:
            w.writerow([s["slug"], s["title"], s["pen_name"], "", s["subgenre"],
                        s["tropes"], s["tagline"], "", 0,
                        str(COVERS / f"{s['slug']}.png")])
    print("catalogue:", cat)


if __name__ == "__main__":
    main()
