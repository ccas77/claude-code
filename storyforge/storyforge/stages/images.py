"""Stage 3 — Images. One illustration per scene. The consistency core.

For every scene the final prompt is assembled MECHANICALLY:

    scene.image_prompt + locked character description(s) + style lock

and the character's reference images are attached to the generation call. That
injection is what keeps the protagonist identical across frames. Each result is
run through the QC (drift) check; failures regenerate up to a retry limit, then
are flagged in the .meta.json for review.
"""

from __future__ import annotations

import os

MAX_QC_RETRIES = 2


def run(project, cfg, backends, *, force=False, log=print):
    project.ensure_dirs()
    scenes = project.load_script()
    width, height = cfg.resolution

    # locked description per character id (from cast stage, fall back to config)
    locked = {c.id: c.description for c in cfg.characters}

    for scene in scenes:
        sid = scene["id"]
        img_path = project.image_path(sid)
        if project.exists(img_path) and not force:
            log(f"[images] scene {sid:03d}: cached — skipping")
            continue

        char_ids = scene.get("characters_in_scene", [])
        refs = _references_for(project, char_ids)
        prompt = _assemble_prompt(scene, char_ids, locked, cfg.style)

        best = None
        for attempt in range(MAX_QC_RETRIES + 1):
            seed = _scene_seed(sid, attempt)
            backends.image.generate(
                prompt, references=refs, width=width, height=height,
                seed=seed, out_path=img_path,
            )
            qc = backends.qc.check(img_path, refs) if refs else _no_ref_pass()
            if best is None or qc.score > best[0]:
                best = (qc.score, seed, qc)
            if qc.passed:
                break
            log(f"[images] scene {sid:03d}: drift qc {qc.score:.3f} "
                f"(attempt {attempt + 1}) — regenerating")

        score, seed, qc = best
        flagged = not qc.passed
        project.write_json(project.image_meta_path(sid), {
            "scene": sid,
            "prompt": prompt,
            "characters": char_ids,
            "references": [os.path.basename(r) for r in refs],
            "seed": seed,
            "qc_score": round(score, 3),
            "qc_note": qc.note,
            "flagged_for_review": flagged,
        })
        status = "FLAGGED" if flagged else f"qc {score:.3f}"
        log(f"[images] scene {sid:03d}: {status} -> {os.path.basename(img_path)}")


def _assemble_prompt(scene, char_ids, locked, style) -> str:
    parts = [scene["image_prompt"]]
    for cid in char_ids:
        if cid in locked:
            parts.append(locked[cid])
    parts.append(style)
    return ", ".join(p.strip().rstrip(",") for p in parts if p.strip())


def _references_for(project, char_ids) -> list[str]:
    refs = []
    for cid in char_ids:
        for n in range(1, 6):
            p = project.cast_ref_path(cid, n)
            if project.exists(p):
                refs.append(p)
    return refs


def _scene_seed(sid: int, attempt: int) -> int:
    return sid * 1000 + attempt * 7 + 101


def _no_ref_pass():
    from ..backends.qc import QCResult
    return QCResult(True, 1.0, "no character in scene")
