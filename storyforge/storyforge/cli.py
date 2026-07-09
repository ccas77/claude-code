"""StoryForge CLI — orchestrates the stages.

    storyforge new <project> --premise "..." [--title ...] [--style ...]
    storyforge run <project> [--from STAGE] [--to STAGE] [--force] [--regen-marked]
    storyforge review <project>
    storyforge stages

Backends default to offline stubs; select real providers via env vars
(see storyforge/backends/__init__.py).
"""

from __future__ import annotations

import argparse
import os
import sys
import textwrap

from . import backends as backends_mod
from . import review as review_mod
from . import stages as stages_mod
from .config import load_story
from .project import Project


def _load(project: Project):
    if not os.path.exists(project.story_yaml):
        sys.exit(f"no story.yaml in {project.root} — run `storyforge new` first")
    return load_story(project.story_yaml)


def cmd_new(args):
    project = Project(args.project)
    os.makedirs(project.root, exist_ok=True)
    if os.path.exists(project.story_yaml) and not args.force:
        sys.exit(f"{project.story_yaml} already exists (use --force to overwrite)")
    title = args.title or os.path.basename(project.root.rstrip("/")).replace("-", " ").title()
    content = textwrap.dedent(f"""\
        title: {title}
        premise: >
          {args.premise or "TODO: one or two sentences describing the story."}
        style: "{args.style}"
        target_minutes: {args.minutes}
        aspect: "16:9"

        characters:
          - id: protagonist
            description: "TODO: locked appearance — the SAME string is injected into every image prompt this character appears in."

        voice:
          provider: stub          # stub | elevenlabs
          voice_id: ""
          pace: 1.0

        # music: assets/ambient.mp3
        """)
    with open(project.story_yaml, "w", encoding="utf-8") as fh:
        fh.write(content)
    print(f"created {project.story_yaml}")
    print("edit it, then: storyforge run", project.root)


def cmd_run(args):
    project = Project(args.project)
    cfg = _load(project)
    project.ensure_dirs()
    backends = backends_mod.select()

    order = stages_mod.ORDER
    start = order.index(args.from_stage) if args.from_stage else 0
    end = order.index(args.to_stage) + 1 if args.to_stage else len(order)
    if start >= end:
        sys.exit(f"--from {args.from_stage!r} is after --to {args.to_stage!r}")

    if args.regen_marked:
        _apply_regen_markers(project)

    _print_backends()
    for name in order[start:end]:
        stages_mod.MODULES[name].run(project, cfg, backends,
                                     force=args.force, log=print)
    if end >= len(order):
        print(f"\n✓ final video: {project.final_mp4}")


def cmd_review(args):
    project = Project(args.project)
    cfg = _load(project)
    if not os.path.exists(project.script_json):
        sys.exit("no script yet — run `storyforge run <project> --to script` first")
    out = review_mod.build(project, cfg)
    print(f"wrote {out}")
    print("open it in a browser, tick scenes to regenerate, then:")
    print(f"  storyforge run {project.root} --from images --regen-marked")


def cmd_stages(_args):
    print("pipeline stages (in order):")
    for i, name in enumerate(stages_mod.ORDER, 1):
        print(f"  {i}. {name}")


def _apply_regen_markers(project: Project):
    """Read regenerate.txt (scene ids) and delete those images so the images
    stage regenerates only them."""
    marker = os.path.join(project.root, "regenerate.txt")
    if not os.path.exists(marker):
        print("[regen] no regenerate.txt found — nothing to clear")
        return
    with open(marker, encoding="utf-8") as fh:
        ids = [int(x) for x in fh.read().split() if x.strip().isdigit()]
    for sid in ids:
        for p in (project.image_path(sid), project.image_meta_path(sid),
                  project.scene_clip_path(sid)):
            if os.path.exists(p):
                os.remove(p)
    print(f"[regen] cleared {len(ids)} scene(s) for regeneration: {ids}")


def _print_backends():
    print("backends:",
          f"llm={os.environ.get('STORYFORGE_LLM','stub')}",
          f"image={os.environ.get('STORYFORGE_IMAGE','stub')}",
          f"tts={os.environ.get('STORYFORGE_TTS','stub')}",
          f"qc={os.environ.get('STORYFORGE_QC','stub')}")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="storyforge",
                                description="Illustrated Ken Burns story-video pipeline")
    sub = p.add_subparsers(dest="cmd", required=True)

    n = sub.add_parser("new", help="scaffold a new project's story.yaml")
    n.add_argument("project")
    n.add_argument("--premise", default="")
    n.add_argument("--title", default="")
    n.add_argument("--style",
                   default="storybook watercolor illustration, soft edges, cinematic lighting")
    n.add_argument("--minutes", type=float, default=4.0)
    n.add_argument("--force", action="store_true")
    n.set_defaults(func=cmd_new)

    r = sub.add_parser("run", help="run the pipeline (skips cached stages)")
    r.add_argument("project")
    r.add_argument("--from", dest="from_stage", choices=stages_mod.ORDER)
    r.add_argument("--to", dest="to_stage", choices=stages_mod.ORDER)
    r.add_argument("--force", action="store_true",
                   help="ignore cache and regenerate the run's stages")
    r.add_argument("--regen-marked", action="store_true",
                   help="clear scenes listed in regenerate.txt before running")
    r.set_defaults(func=cmd_run)

    v = sub.add_parser("review", help="build the HTML review page")
    v.add_argument("project")
    v.set_defaults(func=cmd_review)

    s = sub.add_parser("stages", help="list pipeline stages")
    s.set_defaults(func=cmd_stages)
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
