"""Local web app for StoryForge.

A thin server over the exact same six-stage pipeline the CLI runs. It adds no
new generation logic — it drives `storyforge.stages` and serves a single-page
UI so you can create a story, watch each stage run, review the storyboard,
regenerate weak scenes, and preview the finished video in a browser.

Stdlib only (http.server) so it runs with zero extra dependencies.
"""
