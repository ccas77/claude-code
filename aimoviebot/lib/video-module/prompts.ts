import type { DialogueLine, Shot } from "./types";

// ---- Stage 0 (concept) — mode templates ----
// Modes B and C use vision input alongside the text. Mode A is editor-only
// over the user's own writing.

export const conceptSystem = `You generate a single shootable scene plus the
spoken dialogue lines, sized to fit a 16-shot vertical video clip. Always
return JSON matching the supplied schema. The dialogue array is the actual
words the characters will SAY out loud in the final video; keep lines short
and speakable (a 4-15 second clip cannot hold long speeches). Attribute every
line to a named speaker. If the scene is genuinely wordless, return an empty
dialogue array.`;

export const promptModeA = (input: string) => `MODE A (direct write). The user
wrote the scene themselves. Light normalize their text into a single coherent
action paragraph. PRESERVE every spoken line they wrote VERBATIM in the
dialogue array with its speaker. Do not paraphrase, do not invent plot, do not
add dialogue they didn't write.

USER TEXT:
${input}`;

export const promptModeB = (input: string) => `MODE B (book excerpt). Extract
the visualizable beats from this prose excerpt and compress to a single scene
that fits 16 shots. Discard interiority, backstory, authorial aside. Pull the
spoken lines out of the prose into the dialogue array with speakers, using the
excerpt's actual quoted dialogue where it exists. Trim long speeches to
speakable length. If the excerpt contains more than one scene's worth of
action, use the first and note it in 'notes'.

EXCERPT:
${input}`;

export const promptModeC = (input: string) => `MODE C (brainstorm). The user
gave only a blurb, title, or one-line hint. Use the character and location
images as creative constraints so the premise fits what will be rendered.
Propose a logline and a short scene premise, returning 2-3 alternates in the
'alternates' array (each one a complete alternative sceneDescription). The
primary 'sceneDescription' is your strongest pick. Write short, punchy dialogue
lines that fit the premise — a few strong lines beat a wall of talk in 4-15s.

INPUT:
${input}`;

// ---- Stage 1 (character sheet) ----
export const stage1Prompt = `Character design reference sheet based entirely
on the provided input character image. 9:16 vertical. NO text/labels anywhere.
Preserve exact face, hair, proportions, clothing, accessories, colors with
maximum fidelity — the input image is the sole source of truth. Include
front/side/back large views, facial close-ups, and isolated prop/accessory
breakouts. White/neutral background. Studio turnaround quality.`;

// ---- Stage 2 (location sheet) ----
export const stage2Prompt = `Environment turnaround based entirely on the
provided location image. 9:16 vertical. NO text. Four opposing views
(front/rear/left/right) like a character turnaround, plus 45° angles, top-down,
ground-level. Each panel reveals new information; no duplicate angles.
Reconstruct a full 360° understanding. The provided image is the sole source
of truth.`;

// ---- Stage 3 (shot list, 16 shots, dialogue distributed) ----
const dialogueBlock = (dialogue: DialogueLine[]) =>
  dialogue.length === 0
    ? "(none — this scene is wordless)"
    : dialogue.map((d, i) => `${i + 1}. ${d.speaker}: "${d.line}"`).join("\n");

export const stage3Prompt = (
  sceneDescription: string,
  dialogue: DialogueLine[],
) => `Convert the SCENE DESCRIPTION into exactly 16 storyboard panels. Use the
uploaded character + location sheets as the sole sources of truth. ALL shots
are composed for 9:16 VERTICAL framing — favor compositions that read well
tall: full-body and medium verticals, stacked foreground/background depth, low
and high angles, close-ups; use sparing wide shots that still work in portrait
rather than sprawling landscape vistas. Vary shot sizes (EWS to ECU) and
angles (eye/low/high/OTS/POV/tracking). Structure: shots 1-3 establish, 4-7
build, 8-11 reveal/twist, 12-14 escalate, 15-16 resolve.

Distribute the DIALOGUE lines across the 16 shots IN ORDER. Attach each line
to the shot where it is spoken. If a shot has no dialogue, omit the dialogue
marker. Every line from the dialogue array must appear on exactly one shot.

Output EXACTLY this format, one shot per line, nothing else:
Shot N: [Camera] — [Action] [Speaker: "line"] [Speaker: "line"]

SCENE DESCRIPTION:
${sceneDescription}

DIALOGUE (in order):
${dialogueBlock(dialogue)}`;

// ---- Stage 4 (storyboard grid image) ----
export const stage4Prompt = (shots: Shot[]) => `Professional storyboard sheet
in 9:16 VERTICAL format. 16 panels. Each individual panel is framed 9:16
vertical (portrait shots — this is what the final video inherits, so panels
must compose for vertical). Use a 2 columns × 8 rows layout so portrait
panels are not squashed (NOT a 4×4 grid of landscape cells). Thin black
borders, bold frame number top-left of each panel, short caption under each.
Character + location sheets are the sole sources of truth.

Insert the 16 shots below:
${shots
  .map((s) => {
    const dlg = s.dialogue
      .map((d) => `[${d.speaker}: "${d.line}"]`)
      .join(" ");
    return `Shot ${s.n}: ${s.camera} — ${s.action}${dlg ? " " + dlg : ""}`;
  })
  .join("\n")}`;

// ---- Stage 5 (video, with dialogue baked in) ----
export const stage5Prompt = (shots: Shot[]) => {
  const spoken = shots
    .flatMap((s) =>
      s.dialogue.map((d) => `(Shot ${s.n}) ${d.speaker}: "${d.line}"`),
    )
    .join("\n");
  return `Use the storyboard sheet as the primary source of truth. Character
sheet for character consistency, location sheet for environment. Follow the
storyboard's sequence, angles, compositions, actions. Consistent
design/clothing/proportions and consistent environment throughout. High-end
cinematic animation, smooth motion, natural camera movement.

The characters SPEAK the following dialogue aloud, in order, matched to the
shots indicated. The spoken words must be audible in the video:
${spoken || "(no dialogue — wordless scene)"}`;
};
