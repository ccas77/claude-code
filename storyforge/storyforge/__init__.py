"""StoryForge — a single-app pipeline that turns a story config into an
illustrated, Ken Burns-style narrated video.

story.yaml -> [script] -> [cast] -> [images] -> [voiceover]
                                        \-> [timeline] -> [render] -> final.mp4

The pipeline is six stages. Each stage writes its output to the project
directory and is skipped on re-run if that output already exists, so the
filesystem *is* the pipeline state. That is what gives you cheap
human-in-the-loop review: stop after any stage, edit/delete artifacts, and
re-run — only the missing pieces regenerate.
"""

__version__ = "0.1.0"
