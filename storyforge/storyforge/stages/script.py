"""Stage 1 — Script. One LLM call: premise -> scene-decomposed script.json."""

from __future__ import annotations


def run(project, cfg, backends, *, force=False, log=print):
    if project.exists(project.script_json) and not force:
        n = len(project.load_script())
        log(f"[script] cached ({n} scenes) — skipping")
        return

    log(f"[script] generating ~{cfg.target_scenes} scenes via LLM backend")
    script = backends.llm.generate_script(cfg)
    project.write_json(project.script_json, script)
    log(f"[script] wrote {len(script['scenes'])} scenes -> {project.script_json}")
