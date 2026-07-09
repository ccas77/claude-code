#!/usr/bin/env python3
"""Dependency-free assembly of the book-concept package into one print-ready HTML,
then rendered to PDF by Chromium. Handles the Markdown subset used in the package:
headings, bold/italic/code, links, blockquotes, ordered/unordered (nested) lists,
GitHub pipe tables, horizontal rules, and paragraphs."""
import html, re, os

BASE = "/home/user/claude-code/book-concept"

# (filename, section title, part-of-package label)
DOCS = [
    ("README.md", "Guide to This Package", "Front matter"),
    ("00-executive-summary.md", "Executive Summary", "Front matter"),
    ("01-market-research.md", "Market Research", "Discovery"),
    ("02-concept-tournament.md", "Concept Tournament", "Discovery"),
    ("03-concept-dossier.md", "Concept Dossier", "The Concept"),
    ("04-market-evidence.md", "Market Evidence Report", "The Concept"),
    ("05-book-proposal.md", "Book Proposal", "The Concept"),
    ("06-annotated-toc-and-sample.md", "Annotated TOC + Sample", "The Concept"),
    ("07-part-III-playbook-sample.md", "Part III Playbook Sample", "The Concept"),
    ("08-author-platform-and-economics.md", "Author Platform & Economics", "The Concept"),
    ("09-adversarial-review.md", "Adversarial Review", "Validation"),
    ("10-completeness-review.md", "Completeness Review", "Validation"),
    ("pitch-materials/sell-sheet.md", "Sell Sheet", "Pitch Materials"),
    ("pitch-materials/back-cover-copy.md", "Back-Cover Copy", "Pitch Materials"),
    ("pitch-materials/title-and-positioning-workshop.md", "Title & Positioning Workshop", "Pitch Materials"),
    ("pitch-materials/agent-query-letter.md", "Sample Agent Query Letter", "Pitch Materials"),
]

def inline(t):
    # escape first, then re-introduce markup
    t = html.escape(t)
    t = re.sub(r'\[([^\]]+)\]\((https?://[^)\s]+)\)', r'<a href="\2">\1</a>', t)
    t = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'(?<!\*)\*(?!\s)([^*]+?)\*', r'<em>\1</em>', t)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    return t

def conv(md):
    lines = md.split("\n")
    out, i, n = [], 0, len(lines)
    def close_lists(stack):
        while stack:
            out.append("</%s>" % stack.pop())
    list_stack = []  # (tag, indent)
    while i < n:
        line = lines[i]
        raw = line.rstrip("\n")
        stripped = raw.strip()

        # blank line
        if not stripped:
            close_lists([t for t,_ in list_stack]); list_stack=[]
            i += 1; continue

        # horizontal rule
        if re.match(r'^---+$', stripped) or re.match(r'^\*\*\*+$', stripped):
            close_lists([t for t,_ in list_stack]); list_stack=[]
            out.append("<hr>"); i += 1; continue

        # heading
        m = re.match(r'^(#{1,6})\s+(.*)$', stripped)
        if m:
            close_lists([t for t,_ in list_stack]); list_stack=[]
            lvl = len(m.group(1)); out.append("<h%d>%s</h%d>" % (lvl, inline(m.group(2)), lvl))
            i += 1; continue

        # table (header line followed by |---| separator)
        if stripped.startswith("|") and i+1 < n and re.match(r'^\s*\|?[\s:|-]+\|[\s:|-]*$', lines[i+1].strip()) and '-' in lines[i+1]:
            close_lists([t for t,_ in list_stack]); list_stack=[]
            def cells(row):
                row = row.strip()
                if row.startswith("|"): row = row[1:]
                if row.endswith("|"): row = row[:-1]
                return [c.strip() for c in row.split("|")]
            header = cells(lines[i]); i += 2
            out.append('<table><thead><tr>' + ''.join("<th>%s</th>"%inline(c) for c in header) + '</tr></thead><tbody>')
            while i < n and lines[i].strip().startswith("|"):
                out.append("<tr>" + ''.join("<td>%s</td>"%inline(c) for c in cells(lines[i])) + "</tr>")
                i += 1
            out.append("</tbody></table>"); continue

        # blockquote
        if stripped.startswith(">"):
            close_lists([t for t,_ in list_stack]); list_stack=[]
            buf=[]
            while i < n and lines[i].strip().startswith(">"):
                buf.append(inline(re.sub(r'^\s*>\s?','',lines[i]))); i+=1
            out.append("<blockquote>%s</blockquote>" % "<br>".join(buf)); continue

        # list item (ordered or unordered), with indentation for nesting
        m = re.match(r'^(\s*)([-*+]|\d+\.)\s+(.*)$', raw)
        if m:
            indent = len(m.group(1).replace("\t","  "))
            tag = "ol" if re.match(r'\d+\.', m.group(2)) else "ul"
            # adjust stack
            while list_stack and list_stack[-1][1] > indent:
                out.append("</%s>" % list_stack.pop()[0])
            if not list_stack or list_stack[-1][1] < indent:
                out.append("<%s>" % tag); list_stack.append((tag, indent))
            out.append("<li>%s</li>" % inline(m.group(3)))
            i += 1; continue

        # paragraph (gather until blank / block)
        close_lists([t for t,_ in list_stack]); list_stack=[]
        buf=[inline(stripped)]; i+=1
        while i < n and lines[i].strip() and not re.match(r'^(#{1,6}\s|>|\s*([-*+]|\d+\.)\s|\|)', lines[i]) and not re.match(r'^---+$', lines[i].strip()):
            buf.append(inline(lines[i].strip())); i+=1
        out.append("<p>%s</p>" % " ".join(buf))
    close_lists([t for t,_ in list_stack])
    return "\n".join(out)

# ---- assemble ----
parts_html = []
toc_rows = []
last_group = None
for idx,(fn,title,group) in enumerate(DOCS, 1):
    path = os.path.join(BASE, fn)
    md = open(path).read()
    # drop the doc's own H1 (we supply a section header) to avoid double titles
    body = conv(md)
    anchor = "sec%d" % idx
    toc_rows.append((anchor, title, group, fn))
    parts_html.append(
        f'<section class="doc" id="{anchor}">'
        f'<div class="doc-tag">{html.escape(group)} · file: {html.escape(fn)}</div>'
        f'{body}</section>'
    )

# TOC grouped
toc_html = ['<ol class="toc">']
seen=set()
for anchor,title,group,fn in toc_rows:
    if group not in seen:
        toc_html.append(f'<li class="toc-group">{html.escape(group)}</li>'); seen.add(group)
    toc_html.append(f'<li><a href="#{anchor}"><span>{html.escape(title)}</span><span class="toc-file">{html.escape(fn)}</span></a></li>')
toc_html.append('</ol>')
toc_html = "\n".join(toc_html)

TEMPLATE = f"""<!doctype html><html><head><meta charset="utf-8"><style>
@page {{ size: A4; margin: 20mm 18mm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif; color:#1a1c20; line-height:1.5; font-size:11pt; }}
a {{ color:#7a1f2b; text-decoration:none; }}
h1,h2,h3,h4 {{ font-family: ui-sans-serif,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; line-height:1.2; color:#14161a; }}
h1 {{ font-size:21pt; margin:0 0 6pt; letter-spacing:-.01em; }}
h2 {{ font-size:15pt; margin:20pt 0 7pt; padding-bottom:4pt; border-bottom:1px solid #e4e2dc; }}
h3 {{ font-size:12.5pt; margin:15pt 0 5pt; color:#7a1f2b; }}
h4 {{ font-size:11pt; margin:12pt 0 4pt; }}
p {{ margin:0 0 8pt; }}
ul,ol {{ margin:0 0 8pt; padding-left:20px; }}
li {{ margin:0 0 4pt; }}
code {{ font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:9.5pt; background:#f2ede6; padding:1px 4px; border-radius:3px; }}
blockquote {{ margin:0 0 10pt; padding:8pt 12pt; background:#faf8f4; border-left:3px solid #b23a48; font-style:italic; }}
table {{ width:100%; border-collapse:collapse; margin:8pt 0 12pt; font-size:9.5pt; }}
th,td {{ border:1px solid #e4e2dc; padding:5pt 7pt; text-align:left; vertical-align:top; }}
th {{ background:#f2ede6; font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif; }}
tr:nth-child(even) td {{ background:#faf8f4; }}
hr {{ border:none; border-top:1px solid #e4e2dc; margin:12pt 0; }}
.doc {{ page-break-before: always; }}
.doc-tag {{ font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif; text-transform:uppercase; letter-spacing:.12em; font-size:7.5pt; color:#8a8f98; margin-bottom:10pt; }}
/* cover */
.cover {{ height: 250mm; display:flex; flex-direction:column; justify-content:center; }}
.cover .kick {{ font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif; text-transform:uppercase; letter-spacing:.18em; font-size:10pt; color:#7a1f2b; font-weight:700; }}
.cover h1 {{ font-size:40pt; margin:14pt 0 10pt; }}
.cover .sub {{ font-size:14pt; font-style:italic; color:#5b6472; max-width:72%; }}
.cover .meta {{ margin-top:30pt; font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif; font-size:9.5pt; color:#5b6472; }}
.cover .rule {{ width:70pt; height:3px; background:#b23a48; margin:22pt 0; }}
.toc {{ list-style:none; padding:0; font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif; }}
.toc li {{ margin:0; }}
.toc-group {{ text-transform:uppercase; letter-spacing:.12em; font-size:8.5pt; color:#7a1f2b; font-weight:700; margin:14pt 0 4pt; }}
.toc a {{ display:flex; justify-content:space-between; gap:12pt; padding:4pt 0; border-bottom:1px dotted #e4e2dc; color:#1a1c20; font-size:10.5pt; }}
.toc-file {{ color:#8a8f98; font-size:8.5pt; }}
</style></head><body>
<div class="cover">
  <div class="kick">Book Concept Package</div>
  <h1>The Friend Who Never Says No</h1>
  <div class="sub">Inside the AI Companions Built to Never Disappoint Your Kid — and a Parent's Playbook for Raising Children Who Can Still Love a Real Person</div>
  <div class="rule"></div>
  <div class="meta">A complete, evidence-backed nonfiction book concept — discovered, tournament-tested, adversarially validated, and packaged for evaluation.<br>Compiled July 2026 · All statistics cited and verified · A concept package, not a manuscript.</div>
</div>
<section class="doc"><h1>Contents</h1>{toc_html}</section>
{''.join(parts_html)}
</body></html>"""

open(os.path.join(BASE, "research", "_combined.html"), "w").write(TEMPLATE)
print("wrote _combined.html", len(TEMPLATE), "bytes,", len(DOCS), "documents")
