#!/usr/bin/env python3
"""Build a single EPUB 3 from the FEED concept-package markdown deliverables.
No external epub tooling required — assembles the OCF zip by hand."""
import os, re, zipfile, html, datetime
import markdown

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "FEED-concept-package.epub")

# Reading order: (relative path, section title). None path = generated title/part page.
CHAPTERS = [
    ("README.md", "How to Read This Package"),
    ("01-market-evaluation/executive-summary.md", "Executive Summary"),
    ("01-market-evaluation/thriller-subset-market-evaluation.md", "Thriller Subset Market Evaluation"),
    ("01-market-evaluation/skeptic-and-reconciliation.md", "Adversarial Challenge & Final Subgenre Decision"),
    ("02-reader-analysis/reader-demand-analysis.md", "Reader Demand Analysis"),
    ("02-reader-analysis/genre-subgenre-trope-category-analysis.md", "Genre, Subgenre, Trope & Category Analysis"),
    ("02-reader-analysis/comparable-titles-and-series-analysis.md", "Comparable Titles & Series Analysis"),
    ("02-reader-analysis/reader-language-bank.md", "Reader Language Bank"),
    ("03-concept-tournament/concept-tournament-and-scores.md", "Concept Tournament & Scores"),
    ("04-final-concept/final-concept.md", "Final Concept — FEED"),
    ("04-final-concept/commercial-positioning-and-pitch.md", "Commercial Positioning & Pitch"),
    ("04-final-concept/series-bible-and-book-one-outline.md", "Series Bible & Book One Outline"),
    ("04-final-concept/sample-opening-chapter.md", "Sample Opening Chapter"),
    ("05-production-package/metadata-categories-keywords.md", "Metadata, Categories & Keywords"),
    ("05-production-package/cover-direction-brief.md", "Cover Direction Brief"),
    ("05-production-package/blurb-back-cover-copy.md", "Blurb / Back-Cover Copy"),
    ("05-production-package/pricing-and-format-strategy.md", "Pricing & Format Strategy"),
    ("06-launch-monetization/kindle-unlimited-direct-audiobook-assessment.md", "KU / Direct / Audiobook Assessment"),
    ("06-launch-monetization/release-cadence-and-backlist-strategy.md", "Release Cadence & Backlist Strategy"),
    ("06-launch-monetization/reader-magnet-newsletter-arc-launch-plan.md", "Reader Magnet, Newsletter, ARC & Launch Plan"),
    ("06-launch-monetization/long-term-monetization-plan.md", "Long-Term Monetization Plan"),
    ("07-governance/risk-register.md", "Risk Register"),
    ("07-governance/decision-log.md", "Decision Log"),
    ("07-governance/final-completeness-review.md", "Final Completeness Review"),
]

CSS = """
body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.5; margin: 5% 6%; color:#1a1a1a; }
h1 { font-family: 'Helvetica Neue', Arial, sans-serif; font-size:1.6em; line-height:1.2; margin:1.2em 0 .5em; border-bottom:2px solid #222; padding-bottom:.2em; }
h2 { font-family: 'Helvetica Neue', Arial, sans-serif; font-size:1.28em; margin:1.4em 0 .4em; color:#111; }
h3 { font-family: 'Helvetica Neue', Arial, sans-serif; font-size:1.1em; margin:1.2em 0 .3em; color:#333; }
p, li { font-size:1em; }
blockquote { border-left:3px solid #999; margin:1em 0; padding:.2em 1em; color:#333; background:#f6f6f6; font-style:italic; }
code { font-family: 'SF Mono', Consolas, monospace; background:#f0f0f0; padding:.05em .3em; border-radius:3px; font-size:.9em; }
pre { background:#f4f4f4; padding:.8em; overflow-x:auto; border-radius:4px; font-size:.82em; line-height:1.35; }
pre code { background:none; padding:0; }
table { border-collapse:collapse; width:100%; margin:1em 0; font-size:.8em; }
th, td { border:1px solid #ccc; padding:.35em .5em; text-align:left; vertical-align:top; }
th { background:#eee; font-family:'Helvetica Neue',Arial,sans-serif; }
hr { border:none; border-top:1px solid #ccc; margin:1.6em 0; }
a { color:#7a1f2b; text-decoration:none; }
.tp-title { font-family:'Helvetica Neue',Arial,sans-serif; font-size:2.6em; letter-spacing:.15em; text-align:center; margin-top:22%; font-weight:800; }
.tp-sub { text-align:center; font-size:1.15em; color:#555; margin-top:.6em; font-style:italic; }
.tp-meta { text-align:center; color:#777; margin-top:3em; font-size:.9em; font-family:'Helvetica Neue',Arial,sans-serif; }
"""

md = markdown.Markdown(extensions=["extra", "tables", "sane_lists", "toc"])

def convert(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        text = f.read()
    md.reset()
    return md.convert(text)

def xhtml_doc(title, body):
    return ('<?xml version="1.0" encoding="utf-8"?>\n'
            '<!DOCTYPE html>\n'
            '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">\n'
            f'<head><meta charset="utf-8"/><title>{html.escape(title)}</title>'
            '<link rel="stylesheet" type="text/css" href="style.css"/></head>\n'
            f'<body>\n{body}\n</body></html>')

# --- Title page ---
today = "July 2026"
title_body = (
    '<div class="tp-title">FEED</div>'
    '<div class="tp-sub">Book One: <em>FOR YOU</em></div>'
    '<div class="tp-sub" style="margin-top:1.4em;font-size:1em;">A Complete Indie Thriller Series Concept &amp; Go-to-Market Package</div>'
    f'<div class="tp-meta">Market-to-Manuscript Concept Dossier<br/>Prepared {today}<br/><br/>'
    'An Obsession Thriller · Psychological / Domestic · KU-native<br/>'
    '<em>"A new obsession every book, same dread."</em></div>'
)

files = []  # (id, filename, title, xhtml)
files.append(("titlepage", "titlepage.xhtml", "FEED — Concept Package", xhtml_doc("FEED", title_body)))

for i, (path, title) in enumerate(CHAPTERS, 1):
    body = f'<h1>{html.escape(title)}</h1>\n' + convert(path) if not path.lower().endswith("readme.md") else convert(path)
    fname = f"ch{i:02d}.xhtml"
    files.append((f"ch{i:02d}", fname, title, xhtml_doc(title, body)))

# --- nav.xhtml (EPUB3 TOC) ---
nav_items = "\n".join(
    f'      <li><a href="{f[1]}">{html.escape(f[2])}</a></li>'
    for f in files[1:]
)
nav_body = ('<h1>Contents</h1>\n<nav epub:type="toc" id="toc">\n  <ol>\n' + nav_items + '\n  </ol>\n</nav>')
nav_doc = ('<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n'
           '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">\n'
           '<head><meta charset="utf-8"/><title>Contents</title>'
           '<link rel="stylesheet" type="text/css" href="style.css"/></head>\n'
           f'<body>\n{nav_body}\n</body></html>')

# --- content.opf ---
uid = "urn:uuid:feed-concept-package-2026-07"
manifest = ['    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
            '    <item id="css" href="style.css" media-type="text/css"/>']
spine = []
for fid, fname, title, _ in files:
    manifest.append(f'    <item id="{fid}" href="{fname}" media-type="application/xhtml+xml"/>')
    spine.append(f'    <itemref idref="{fid}"/>')
opf = ('<?xml version="1.0" encoding="utf-8"?>\n'
       '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="en">\n'
       '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n'
       f'    <dc:identifier id="bookid">{uid}</dc:identifier>\n'
       '    <dc:title>FEED — Indie Thriller Series Concept &amp; Go-to-Market Package</dc:title>\n'
       '    <dc:creator>FEED Concept Dossier</dc:creator>\n'
       '    <dc:language>en</dc:language>\n'
       '    <dc:description>Complete market-to-manuscript concept package for FEED (Book 1: FOR YOU), an Obsession Thriller series for a solo indie author.</dc:description>\n'
       f'    <meta property="dcterms:modified">{datetime.datetime(2026,7,10,12,0,0).strftime("%Y-%m-%dT%H:%M:%SZ")}</meta>\n'
       '  </metadata>\n'
       '  <manifest>\n' + "\n".join(manifest) + '\n  </manifest>\n'
       '  <spine>\n' + "\n".join(spine) + '\n  </spine>\n'
       '</package>')

container = ('<?xml version="1.0" encoding="utf-8"?>\n'
             '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
             '  <rootfiles>\n    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n  </rootfiles>\n'
             '</container>')

# --- assemble zip ---
if os.path.exists(OUT):
    os.remove(OUT)
with zipfile.ZipFile(OUT, "w") as z:
    # mimetype MUST be first and STORED (uncompressed)
    z.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
    z.writestr("META-INF/container.xml", container, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr("OEBPS/content.opf", opf, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr("OEBPS/nav.xhtml", nav_doc, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr("OEBPS/style.css", CSS, compress_type=zipfile.ZIP_DEFLATED)
    for fid, fname, title, doc in files:
        z.writestr(f"OEBPS/{fname}", doc, compress_type=zipfile.ZIP_DEFLATED)

print("Wrote", OUT)
print("Sections:", len(files))
print("Size:", round(os.path.getsize(OUT)/1024, 1), "KB")
