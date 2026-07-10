# services/rendering

`overlay.ts`, `video.ts`, `captions/`. Implemented starting in **M3**.

Rules:
- Use `@ffmpeg-installer/ffmpeg`, never `ffmpeg-static`.
- TTF fonts only for captions; safe-zone positioning.
- SVG-glyph-path overlay is the primary text renderer (Pango is fallback for emoji).
