"""The six pipeline stages, in order.

Each module exposes `run(project, cfg, backends, *, force=False, log=print)`.
A stage checks whether its outputs already exist and returns early unless
`force` is set — that caching is what makes the pipeline resumable and gives
you per-artifact human-in-the-loop review.
"""

from . import script, cast, images, voiceover, timeline, render

# canonical order; the CLI's --from/--to slice into this list.
ORDER = ["script", "cast", "images", "voiceover", "timeline", "render"]
MODULES = {
    "script": script,
    "cast": cast,
    "images": images,
    "voiceover": voiceover,
    "timeline": timeline,
    "render": render,
}
