"""Build a single self-contained HTML review page: the image grid, the prompt
used for each scene, QC score, and a per-scene 'regenerate' checkbox. Ticking a
box writes a marker file; re-running the images stage regenerates only marked
scenes. This is ~95% of what the SaaS storyboard UIs give you.
"""

from __future__ import annotations

import html
import os


def build(project, cfg) -> str:
    scenes = project.load_script()
    cards = []
    for scene in scenes:
        sid = scene["id"]
        img_rel = os.path.relpath(project.image_path(sid), project.root)
        meta = {}
        if project.exists(project.image_meta_path(sid)):
            meta = project.read_json(project.image_meta_path(sid))
        flagged = meta.get("flagged_for_review")
        qc = meta.get("qc_score", "—")
        prompt = html.escape(meta.get("prompt", scene.get("image_prompt", "")))
        narration = html.escape(scene.get("narration", ""))
        badge = ('<span class="flag">⚠ FLAGGED</span>' if flagged
                 else f'<span class="ok">qc {qc}</span>')
        img_exists = project.exists(project.image_path(sid))
        img_tag = (f'<img src="{html.escape(img_rel)}" loading="lazy">'
                   if img_exists else '<div class="missing">no image</div>')
        cards.append(f"""
        <div class="card {'flagged' if flagged else ''}">
          <div class="thumb">{img_tag}</div>
          <div class="body">
            <div class="row"><b>Scene {sid:03d}</b> {badge}
              <span class="mood">{html.escape(scene.get('mood',''))} · {html.escape(scene.get('shot',''))}</span></div>
            <div class="prompt">{prompt}</div>
            <div class="narr">{narration}</div>
            <label class="regen"><input type="checkbox" data-scene="{sid}"> mark for regenerate</label>
          </div>
        </div>""")

    page = f"""<!doctype html>
<meta charset="utf-8">
<title>StoryForge review — {html.escape(cfg.title)}</title>
<style>
  :root {{ color-scheme: light dark; }}
  body {{ font: 15px/1.5 system-ui, sans-serif; margin: 0; padding: 24px;
         background: Canvas; color: CanvasText; }}
  h1 {{ font-size: 20px; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(320px,1fr));
          gap: 16px; }}
  .card {{ border: 1px solid color-mix(in srgb, CanvasText 20%, transparent);
          border-radius: 10px; overflow: hidden; background: color-mix(in srgb, CanvasText 4%, Canvas); }}
  .card.flagged {{ border-color: #d9534f; box-shadow: 0 0 0 1px #d9534f inset; }}
  .thumb img, .missing {{ width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; }}
  .missing {{ display: grid; place-items: center; color: #999;
             background: color-mix(in srgb, CanvasText 8%, Canvas); }}
  .body {{ padding: 10px 12px; }}
  .row {{ display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }}
  .mood {{ margin-left: auto; opacity: .6; font-size: 12px; }}
  .prompt {{ font-size: 12px; opacity: .85; margin: 6px 0; }}
  .narr {{ font-size: 12px; opacity: .6; max-height: 4.5em; overflow: auto; }}
  .flag {{ color: #fff; background: #d9534f; border-radius: 4px; padding: 1px 6px; font-size: 12px; }}
  .ok {{ color: #fff; background: #4a8f4a; border-radius: 4px; padding: 1px 6px; font-size: 12px; }}
  .regen {{ display: block; margin-top: 8px; font-size: 13px; }}
  .bar {{ position: sticky; top: 0; background: Canvas; padding: 12px 0; margin-bottom: 12px;
         border-bottom: 1px solid color-mix(in srgb, CanvasText 15%, transparent); }}
  button {{ font: inherit; padding: 6px 12px; border-radius: 6px; cursor: pointer; }}
  code {{ background: color-mix(in srgb, CanvasText 10%, Canvas); padding: 2px 5px; border-radius: 4px; }}
</style>
<div class="bar">
  <h1>StoryForge review — {html.escape(cfg.title)}</h1>
  <p>{len(scenes)} scenes. Tick scenes to regenerate, then
     <button onclick="save()">download regenerate list</button>.
     Save it as <code>regenerate.txt</code> in the project and run
     <code>storyforge run &lt;project&gt; --from images --regen-marked</code>.</p>
</div>
<div class="grid">{''.join(cards)}</div>
<script>
  function save() {{
    const ids = [...document.querySelectorAll('input:checked')]
      .map(i => i.dataset.scene).join('\\n');
    const blob = new Blob([ids], {{type:'text/plain'}});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'regenerate.txt'; a.click();
  }}
</script>
"""
    out = project.review_html
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(page)
    return out
