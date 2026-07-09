# StoryForge

A single-app pipeline that turns a story config into an illustrated, narrated
video with Ken Burns motion — the format you see on "illustrated story" YouTube
channels (an image every few seconds, slow zoom/pan, character who looks the
same in every frame).

It's the "one app" answer to the question *"is this an app or a pile of SaaS?"*
Everything the no-code stacks (n8n + Midjourney + ElevenLabs + JSON2Video) do,
this does in one program with three swappable API calls and local ffmpeg. Out
of the box it runs **fully offline** with stub backends, so you can see the
whole thing work before wiring up a single API key.

```
story.yaml ──► [1 script] ──► [2 cast] ──► [3 images] ──► [5 timeline] ──► [6 render] ──► out/final.mp4
                   │                            ▲              ▲
                   └──────► [4 voiceover] ──────┴──────────────┘
                             (audio durations drive scene timing)
```

## Why it's built this way

- **The filesystem is the pipeline state.** Each stage writes its outputs to the
  project directory and is skipped on re-run if they already exist. Stop after
  any stage, edit or delete artifacts, and re-run — only the missing pieces
  regenerate. No database, no queue.
- **Character consistency is mechanical, not prompt-craft.** The cast stage
  freezes each character into a *locked description string* + *reference images*.
  The images stage injects both into **every** scene prompt/generation call.
  That injection — not careful per-scene wording — is what keeps the protagonist
  identical frame to frame. (See `stages/images.py`.)
- **Ken Burns is local and free.** Stills are turned into zoom/pan clips with
  ffmpeg's `zoompan`; no video-generation model. Motion direction alternates and
  aims at each scene's focal point so it reads as directed, not screensaver-ish.
- **Backends are swappable by env var.** Stub → real is a config change, never a
  code change.

## Quick start

```bash
pip install -r requirements.txt        # PyYAML, Pillow, imageio-ffmpeg

# run the included example end-to-end, fully offline:
python -m storyforge run examples/the-lighthouse-keeper
# -> examples/the-lighthouse-keeper/out/final.mp4

# review the storyboard in a browser:
python -m storyforge review examples/the-lighthouse-keeper
```

Start your own:

```bash
python -m storyforge new projects/my-story --premise "A ..." --minutes 4
$EDITOR projects/my-story/story.yaml        # write premise, style, characters
python -m storyforge run projects/my-story
```

## Commands

| Command | What it does |
|---|---|
| `storyforge new <dir> --premise "..."` | scaffold a `story.yaml` |
| `storyforge run <dir>` | run all stages, skipping cached ones |
| `storyforge run <dir> --to images` | run up to a stage (review checkpoint) |
| `storyforge run <dir> --from render` | resume from a stage |
| `storyforge run <dir> --force` | ignore cache for the run's stages |
| `storyforge run <dir> --regen-marked` | clear scenes listed in `regenerate.txt`, then run |
| `storyforge review <dir>` | build `review.html` (image grid + prompts + regenerate ticks) |
| `storyforge stages` | list the stages |

## Human-in-the-loop review

`storyforge run <dir> --to images` stops after the illustrations. Then
`storyforge review <dir>` builds an HTML page: every scene's image, the exact
prompt used, its drift-QC score, and a "regenerate" checkbox. Tick the bad ones,
download the list as `regenerate.txt` into the project, and:

```bash
storyforge run <dir> --from images --regen-marked
```

only those scenes regenerate; everything downstream rebuilds around them. That's
~95% of what the SaaS storyboard UIs give you.

## Switching to real providers

Defaults are offline stubs. Point any stage at a real service with env vars:

```bash
export STORYFORGE_LLM=anthropic      ANTHROPIC_API_KEY=...      # script
export STORYFORGE_IMAGE=gemini       GEMINI_API_KEY=...         # "Nano Banana"
export STORYFORGE_TTS=elevenlabs     ELEVENLABS_API_KEY=...     # narration
export STORYFORGE_QC=insightface                                # face-drift check
```

and add the matching optional dependency (see `requirements.txt`). The stages
are untouched — the backend interfaces in `storyforge/backends/` are the only
thing that changes. To run image generation locally with zero per-image cost,
implement the `ImageBackend` interface against a ComfyUI (Flux + PuLID) HTTP
endpoint; it's the same `generate(prompt, references, ...)` contract.

| Concern | env var | stub (default) | real option |
|---|---|---|---|
| script | `STORYFORGE_LLM` | deterministic beat-mapped script | `anthropic` |
| images | `STORYFORGE_IMAGE` | legible PIL placeholder frames | `gemini` (Nano Banana) |
| narration | `STORYFORGE_TTS` | correctly-timed silent track | `elevenlabs` |
| drift QC | `STORYFORGE_QC` | always-pass | `insightface` (face embeddings) |

Tunables: `STORYFORGE_X264_PRESET` (render speed/quality), `STORYFORGE_QC_THRESHOLD`.

## The stages in detail

1. **script** (`stages/script.py`) — one LLM call: premise → scenes. Each scene
   gets narration, an `image_prompt` that deliberately *omits* character
   appearance and style (injected later), and `shot`/`focus`/`mood` hints that
   drive the camera move.
2. **cast** (`stages/cast.py`) — freeze each character: locked description +
   reference images. Shared across episodes, so recurring characters match.
3. **images** (`stages/images.py`) — one image per scene; prompt = scene action
   + locked description(s) + style lock, generated *with the reference images
   attached*. Drift QC + retry + flag.
4. **voiceover** (`stages/voiceover.py`) — per-scene TTS with word timestamps
   (→ caption timing, and scene boundaries land on audio boundaries).
5. **timeline** (`stages/timeline.py`) — pure computation: scene durations from
   audio, alternating zoom in/out toward the focal point, cut vs. crossfade by
   mood shift. The "house style" lives here.
6. **render** (`stages/render.py`) — per-scene `zoompan` clips with burned ASS
   captions (cached individually), then concat with crossfades, mux narration +
   ducked music, normalize to ~-14 LUFS.

## Cost & scale

With real backends, a few-minute video is roughly **$2–3** in API calls
(vs. $150+/month of SaaS subscriptions). One process, sequential stages,
parallelizable within a stage. A daily channel is a `for` loop over projects;
scheduling is a cron entry, not an architecture change.

## Upgrade paths (designed for, not built)

- **Stills → motion**: the per-scene clip renderer is one function; swap
  `zoompan` for an image-to-video API (Veo/Kling/Higgsfield) on hero scenes.
  Same timeline, same assembly.
- **Thumbnail**: reuse the image stage with a `thumbnail_prompt`.
- **Upload**: a stage 7 with one YouTube API call.

## Requirements

Python 3.10+. `imageio-ffmpeg` ships a static ffmpeg, so no system ffmpeg is
required (a system ffmpeg on `PATH` is used if present).
