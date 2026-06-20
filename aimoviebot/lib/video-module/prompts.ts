import type { Character, DialogueLine, Shot } from "./types";

// PROMPTS are user-editable. The defaults below ship with the app; a per-
// prompt override stored in Blob (see custom-prompts.ts) wins when set.
// Templates use {placeholder} markers that the render helpers substitute
// before sending to the model. Editing the templates in /prompts changes
// only the strings; helper formatters (castBlock, dialogueBlock, etc.)
// stay in code because they handle data shapes, not directives.

export type PromptKey =
  | "conceptSystem"
  | "modeA"
  | "modeB"
  | "modeC"
  | "stage1"
  | "stage2"
  | "stage3"
  | "stage4"
  | "stage5";

export const PROMPT_KEYS: PromptKey[] = [
  "conceptSystem",
  "modeA",
  "modeB",
  "modeC",
  "stage1",
  "stage2",
  "stage3",
  "stage4",
  "stage5",
];

// What each prompt template's placeholders mean, surfaced in the editor UI
// so the user knows which {tokens} are available without reading source.
export const PROMPT_DOCS: Record<
  PromptKey,
  { label: string; description: string; placeholders: string[] }
> = {
  conceptSystem: {
    label: "Stage 0 system",
    description: "Always-on system prompt for the concept drafter.",
    placeholders: [],
  },
  modeA: {
    label: "Stage 0 mode A (Write it)",
    description: "User wrote the scene themselves; model only normalizes.",
    placeholders: ["{input}", "{cast}"],
  },
  modeB: {
    label: "Stage 0 mode B (Book excerpt)",
    description: "Adapt a prose passage into a shootable scene.",
    placeholders: ["{input}", "{cast}"],
  },
  modeC: {
    label: "Stage 0 mode C (Brainstorm)",
    description: "Propose a scene from a title or one-line hint.",
    placeholders: ["{input}", "{cast}"],
  },
  stage1: {
    label: "Stage 1 (character sheet)",
    description: "One reference sheet per character. Runs N times in parallel.",
    placeholders: ["{characterName}"],
  },
  stage2: {
    label: "Stage 2 (location sheet)",
    description: "Environment turnaround based on the uploaded location image.",
    placeholders: [],
  },
  stage3: {
    label: "Stage 3 (16-shot list)",
    description:
      "Text gen. Builds the per-shot directed script with body language and dialogue distribution.",
    placeholders: ["{cast}", "{sceneDescription}", "{dialogue}"],
  },
  stage4: {
    label: "Stage 4 (storyboard image)",
    description:
      "2x8 vertical panel grid. Reference order: location first, then character sheets.",
    placeholders: ["{cast}", "{shots}"],
  },
  stage5: {
    label: "Stage 5 (video)",
    description:
      "Seedance prompt with baked-in dialogue and physical performance directives.",
    placeholders: ["{cast}", "{performance}", "{spoken}"],
  },
};

// Helpers used by render(): turn structured data into the block strings
// the templates inject. Live in code, not the editor.
const castBlock = (characters: { name: string }[]) =>
  characters.length === 0
    ? "(no named characters)"
    : characters.map((c) => `- ${c.name}`).join("\n");

const dialogueBlock = (dialogue: DialogueLine[]) =>
  dialogue.length === 0
    ? "(none, this scene is wordless)"
    : dialogue.map((d, i) => `${i + 1}. ${d.speaker}: "${d.line}"`).join("\n");

const shotsBlock = (shots: Shot[]) =>
  shots
    .map((s) => {
      const dlg = s.dialogue
        .map((d) => `[${d.speaker}: "${d.line}"]`)
        .join(" ");
      return `Shot ${s.n}: ${s.camera} | ${s.action}${dlg ? " " + dlg : ""}`;
    })
    .join("\n");

const performanceBlock = (shots: Shot[]) =>
  shots.map((s) => `(Shot ${s.n}) ${s.action}`).join("\n");

const spokenBlock = (shots: Shot[]) =>
  shots
    .flatMap((s) =>
      s.dialogue.map((d) => `(Shot ${s.n}) ${d.speaker}: "${d.line}"`),
    )
    .join("\n") || "(no dialogue; wordless scene)";

// Replace {placeholder} tokens. Unknown placeholders are left as-is so a
// user-edited template with a typo doesn't silently lose its data.
export function render(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in vars ? vars[k] : `{${k}}`,
  );
}

// ---- DEFAULT TEMPLATES ----
// These are what /prompts loads by default. The user can edit any of them;
// edits are stored in Blob (see custom-prompts.ts) and override these.

export const DEFAULT_PROMPTS: Record<PromptKey, string> = {
  conceptSystem: `You generate a single shootable scene plus the spoken
dialogue lines, sized to fit a 16-shot vertical video clip. Always return
JSON matching the supplied schema. The dialogue array is the actual words
the characters will SAY out loud in the final video; keep lines short and
speakable (a 4-15 second clip cannot hold long speeches). Attribute every
spoken line to one of the SUPPLIED character names (use them VERBATIM so
the right reference sheet is voiced). Narrators or off-screen voices may
use a custom speaker label like "Narrator" or "Voiceover". If the scene is
genuinely wordless, return an empty dialogue array.

PUNCTUATION RULE: never use em dashes anywhere in your output (not in
sceneDescription, not in dialogue lines, not in notes). Use commas,
periods, or sentence breaks instead. Em dashes break the downstream speech
pipeline.`,

  modeA: `MODE A (direct write). The user wrote the scene themselves. Light
normalize their text into a single coherent action paragraph. PRESERVE
every spoken line they wrote VERBATIM in the dialogue array with its
speaker. Do not paraphrase, do not invent plot, do not add dialogue they
didn't write. Replace any em dashes you encounter with commas or periods.

Cast (use these names as dialogue speakers; if the user wrote a different
name for someone in this cast, map it to the closest match):
{cast}

USER TEXT:
{input}`,

  modeB: `MODE B (book excerpt). Extract the visualizable beats from this
prose excerpt and compress to a single scene that fits 16 shots. Discard
interiority, backstory, authorial aside. Pull the spoken lines out of the
prose into the dialogue array with speakers, using the excerpt's actual
quoted dialogue where it exists. Trim long speeches to speakable length.
If the excerpt contains more than one scene's worth of action, use the
first and note it in 'notes'. Replace any em dashes with commas or periods.

Cast (these are the ONLY visual characters available; map every named or
implied speaker in the excerpt to one of them so the right reference sheet
gets voiced):
{cast}

EXCERPT:
{input}`,

  modeC: `MODE C (brainstorm). The user gave only a blurb, title, or
one-line hint. Use the supplied character and location images as creative
constraints so the premise fits what will be rendered. Propose a logline
and a short scene premise, returning 2-3 alternates in the 'alternates'
array (each one a complete alternative sceneDescription). The primary
'sceneDescription' is your strongest pick. Write short, punchy dialogue
lines that fit the premise. A few strong lines beat a wall of talk in
4-15s. Use the cast names below as dialogue speakers.

Cast:
{cast}

INPUT:
{input}`,

  stage1: `Character design reference sheet for {characterName}, based
entirely on the provided input character image. 9:16 vertical. NO
text/labels anywhere. Preserve exact face, hair, proportions, clothing,
accessories, colors with maximum fidelity. The input image is the sole
source of truth for this character. Include front/side/back large views,
facial close-ups, and isolated prop/accessory breakouts. White/neutral
background. Studio turnaround quality.`,

  stage2: `Environment turnaround based entirely on the provided location
image. 9:16 vertical. NO text. Four opposing views (front/rear/left/right)
like a character turnaround, plus 45° angles, top-down, ground-level. Each
panel reveals new information; no duplicate angles. Reconstruct a full
360° understanding. The provided image is the sole source of truth.`,

  stage3: `Convert the SCENE DESCRIPTION into exactly 16 storyboard panels.
Use the uploaded character + location sheets as the sole sources of truth
(one sheet per character, named below). ALL shots are composed for 9:16
VERTICAL framing. Favor compositions that read well tall: full-body and
medium verticals, stacked foreground/background depth, low and high
angles, close-ups; use sparing wide shots that still work in portrait
rather than sprawling landscape vistas. Vary shot sizes (EWS to ECU) and
angles (eye/low/high/OTS/POV/tracking). Structure: shots 1-3 establish,
4-7 build, 8-11 reveal/twist, 12-14 escalate, 15-16 resolve.

Refer to characters BY NAME in actions (e.g. "Mira leans against the door
while Cal watches"), so the right reference sheet is used for each figure.

PHYSICAL PERFORMANCE PER SHOT (this is what stops the characters looking
like potatoes). Every shot must include a [Performance: ...] block that
describes the body acting: weight distribution, posture, where hands and
shoulders are, eyeline, breath, micro-expression (jaw clench, lip part,
swallow, eye flicker), gesture, the energy between bodies in the frame
(distance, lean-in, restraint, vulnerability). NEVER write a character as
"standing", "looking", or "facing" without specifying HOW they stand, what
their weight is doing, what their hands and eyes are doing. If two
characters share a frame, name the physical tension between them.

Distribute the DIALOGUE lines across the 16 shots IN ORDER. Attach each
line to the shot where it is spoken. If a shot has no dialogue, omit the
dialogue marker. Every line from the dialogue array must appear on exactly
one shot.

PUNCTUATION RULE: never use em dashes. Use commas, periods, or sentence
breaks.

Output EXACTLY this format, one shot per line, nothing else. Separators
are single vertical bars with one space on each side:
Shot N: [Camera] | [Action] | [Performance: ...] [Speaker: "line"] [Speaker: "line"]

Cast:
{cast}

SCENE DESCRIPTION:
{sceneDescription}

DIALOGUE (in order):
{dialogue}`,

  stage4: `Professional 9:16 VERTICAL storyboard sheet. 16 panels in a 2
columns × 8 rows layout (NOT a 4×4 grid of landscape cells). Every
individual panel is framed 9:16 vertical so the panels compose well for
the portrait video this becomes. Thin black borders, bold frame number
top-left of each panel, short caption under each panel.

REFERENCE HIERARCHY (strict, do not freelance):
1. The FIRST attached image is the LOCATION. It is the literal setting.
   Every single panel must render INSIDE that exact environment. Do not
   invent a different location, do not substitute a beach or studio or
   generic backdrop. If a shot is a close-up, the bits of environment that
   peek into the frame must still match the location image.
2. The remaining attached images are CHARACTER REFERENCE SHEETS, one per
   named character. Match face, hair, body type, clothing, and accessories
   exactly to whichever sheet corresponds to the named character on each
   shot. Do not blend, swap, or invent looks.

BODY ACTING: every panel must show physical performance, not stiff
figures. Honor each shot's [Performance: ...] direction below: weight
distribution, posture, where hands and shoulders are, eyeline,
micro-expression. No character standing flat-footed or staring with
neutral expression.

Cast:
{cast}

Insert the 16 shots below (separators are single vertical bars):
{shots}`,

  stage5: `Cinematic 9:16 vertical clip. The storyboard sheet is the
primary source of truth for camera, framing, and sequence. Each character
has their own reference sheet (named below). Keep face, hair, clothing,
and proportions consistent with the right sheet on every shot. The
location sheet defines the environment.

PERFORMANCE (load-bearing): the characters must MOVE LIKE PEOPLE, not
pose like mannequins. Render natural body weight, shifting balance,
breath, micro-expressions (eye flicker, lip part, swallow, jaw set),
small involuntary gestures (a hand at the collar, fingers brushing a
sleeve, a glance away then back). When two characters share a frame,
render the physical relationship between them: distance, lean-in,
restraint, the gap that closes or opens between bodies. Camera movement
is motivated by the performance, not the other way around. Do NOT animate
anyone standing flat-footed or staring with a neutral expression at the
camera.

Cast (each name corresponds to its own reference sheet image):
{cast}

SHOT ACTIONS (in order, each line carries the directed body acting and
camera intent for that shot):
{performance}

DIALOGUE (the characters SPEAK these lines aloud, in order, matched to
the shots indicated, voiced by the named character using the look and
demeanor from their reference sheet):
{spoken}`,
};

// ---- RENDER ENTRY POINTS ----
// Each stage's call site invokes the matching helper here. The helper
// loads the effective template (override or default), builds the data
// blocks (cast, dialogue, etc.), and substitutes.

import { effectivePrompt } from "./custom-prompts";

export async function renderConceptSystem(): Promise<string> {
  return effectivePrompt("conceptSystem");
}

export async function renderModeA(
  input: string,
  characters: Character[],
): Promise<string> {
  return render(await effectivePrompt("modeA"), {
    input,
    cast: castBlock(characters),
  });
}

export async function renderModeB(
  input: string,
  characters: Character[],
): Promise<string> {
  return render(await effectivePrompt("modeB"), {
    input,
    cast: castBlock(characters),
  });
}

export async function renderModeC(
  input: string,
  characters: Character[],
): Promise<string> {
  return render(await effectivePrompt("modeC"), {
    input,
    cast: castBlock(characters),
  });
}

export async function renderStage1(characterName: string): Promise<string> {
  return render(await effectivePrompt("stage1"), { characterName });
}

export async function renderStage2(): Promise<string> {
  return effectivePrompt("stage2");
}

export async function renderStage3(args: {
  sceneDescription: string;
  dialogue: DialogueLine[];
  characters: Character[];
}): Promise<string> {
  return render(await effectivePrompt("stage3"), {
    cast: castBlock(args.characters),
    sceneDescription: args.sceneDescription,
    dialogue: dialogueBlock(args.dialogue),
  });
}

export async function renderStage4(args: {
  shots: Shot[];
  characters: Character[];
}): Promise<string> {
  return render(await effectivePrompt("stage4"), {
    cast: castBlock(args.characters),
    shots: shotsBlock(args.shots),
  });
}

export async function renderStage5(args: {
  shots: Shot[];
  characters: Character[];
}): Promise<string> {
  return render(await effectivePrompt("stage5"), {
    cast: castBlock(args.characters),
    performance: performanceBlock(args.shots),
    spoken: spokenBlock(args.shots),
  });
}
