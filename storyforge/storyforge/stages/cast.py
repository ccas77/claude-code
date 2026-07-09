"""Stage 2 — Cast. Produce the frozen per-character artifacts that every image
prompt reuses: a locked description string and a set of reference images.

For an episodic channel this directory is shared across projects — that is what
makes episode 40's protagonist match episode 1's. Reference images supplied in
story.yaml are used as-is; otherwise the image backend generates a small set.
"""

from __future__ import annotations

import os
import shutil


def run(project, cfg, backends, *, force=False, log=print):
    project.ensure_dirs()
    if not cfg.characters:
        log("[cast] no characters declared — skipping")
        return

    width, height = cfg.resolution
    for ch in cfg.characters:
        desc_path = project.cast_desc_path(ch.id)
        ref0 = project.cast_ref_path(ch.id, 1)
        if project.exists(desc_path) and project.exists(ref0) and not force:
            log(f"[cast] {ch.id}: cached — skipping")
            continue

        refs: list[str] = []
        if ch.references:
            # user supplied real reference images; copy them into the cast dir
            for i, src in enumerate(ch.references, start=1):
                dst = project.cast_ref_path(ch.id, i)
                shutil.copyfile(_resolve(src, project), dst)
                refs.append(dst)
            log(f"[cast] {ch.id}: imported {len(refs)} supplied reference(s)")
        else:
            # generate a small "character sheet" set from the locked description
            angles = ["front portrait", "three-quarter view", "full body, standing"]
            for i, angle in enumerate(angles, start=1):
                dst = project.cast_ref_path(ch.id, i)
                prompt = (
                    f"character reference, {angle}, {ch.description}, {cfg.style}, "
                    f"neutral background, consistent character design"
                )
                backends.image.generate(
                    prompt, references=[], width=width, height=height,
                    seed=_char_seed(ch.id, i), out_path=dst,
                )
                refs.append(dst)
            log(f"[cast] {ch.id}: generated {len(refs)} reference image(s)")

        project.write_json(desc_path, {
            "id": ch.id,
            "locked_description": ch.description,
            "references": [os.path.basename(r) for r in refs],
        })


def _char_seed(cid: str, i: int) -> int:
    return (abs(hash(cid)) % 100000) * 10 + i


def _resolve(src: str, project) -> str:
    if os.path.isabs(src):
        return src
    return os.path.normpath(os.path.join(project.root, src))
