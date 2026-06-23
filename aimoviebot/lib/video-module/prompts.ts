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
      const perf = s.performance ? ` | Performance: ${s.performance}` : "";
      return `Shot ${s.n}: ${s.camera} | ${s.action}${perf}${dlg ? " " + dlg : ""}`;
    })
    .join("\n");

const performanceBlock = (shots: Shot[]) =>
  shots
    .map((s) => {
      const perf = s.performance ? ` Performance: ${s.performance}` : "";
      return `(Shot ${s.n}) ${s.action}${perf}`;
    })
    .join("\n");

const spokenBlock = (shots: Shot[]) =>
  shots
    .flatMap((s) =>
      s.dialogue.map((d) => `(Shot ${s.n}) ${d.speaker}: "${d.line}"`),
    )
    .join("\n") || "(no dialogue; wordless scene)";

// Compose a chunk's shots into ONE flowing scene description for
// Seedance: action, then performance, then any dialogue lines spoken
// in that beat — interleaved, no "(Shot N)" labels, no separate
// dialogue section. Seedance reads it as a single continuous moment.
// This is what makes the per-clip prompt feel like a film direction
// rather than a list of disjoint storyboard panels.
const sceneBlock = (shots: Shot[]) => {
  const parts = shots.map((s) => {
    const bits: string[] = [];
    if (s.action) bits.push(s.action.trim().replace(/\.$/, "") + ".");
    if (s.performance)
      bits.push(s.performance.trim().replace(/\.$/, "") + ".");
    for (const d of s.dialogue) {
      bits.push(`${d.speaker} says aloud: "${d.line}"`);
    }
    return bits.join(" ");
  });
  return parts.join(" ").trim() || "(wordless beat)";
};

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

  stage1: `PHOTOREALISTIC character design reference sheet for
{characterName}, based entirely on the provided input character image.
Photorealistic skin texture, realistic lighting, real-camera depth of
field. NO cartoon, anime, illustration, painting, comic, sketch, 3D
render, or stylised look — strictly photographic. 9:16 vertical. NO
text/labels anywhere. Preserve exact face, hair, proportions, clothing,
accessories, colors with maximum fidelity. The input image is the sole
source of truth for this character. Include front/side/back large views,
facial close-ups, and isolated prop/accessory breakouts. White/neutral
background. Studio turnaround quality.`,

  stage2: `PHOTOREALISTIC environment reference based entirely on the
provided location image. Photorealistic textures, real-camera lighting,
real-world depth and atmosphere. NO cartoon, anime, illustration,
painting, comic, sketch, 3D render, or stylised look — strictly
photographic. 9:16 vertical. NO text. Four opposing views (front/rear/
left/right) like a character turnaround, plus 45° angles, top-down,
ground-level. Each panel reveals new information; no duplicate angles.
Reconstruct a full 360° understanding. The provided image is the sole
source of truth.`,

  stage3: `Convert the SCENE DESCRIPTION into exactly {shotCount} storyboard panels.
Each panel is one ~4-second shot in a short vertical film. The final
video is {totalSec} seconds total ({clipCount} clips of 4 seconds each),
so aim for ~2 panels per clip — enough to breathe, not enough to rush.
Use the uploaded character + location images as the sole sources of
truth for identity and environment.

ALL shots are composed for 9:16 VERTICAL framing.

CAMERA APPROACH — standard two-person dialogue coverage. This is a
conversation between two people in a location; cover it the way TV and
film conventionally do, NOT as a montage of dynamic action angles.

The shot vocabulary, and ONLY these:
  - Wide TWO-SHOT: both characters in frame, establishes them in the
    space.
  - Over-the-shoulder (OTS) favoring each character: camera sits behind
    one character's near shoulder, looking at the other. One OTS favors
    A; the matching reverse OTS favors B.
  - Close-up of each character SPEAKING: their face fills frame as they
    deliver a line.
  - Reaction close-up of each character LISTENING: the non-speaking
    character's face while the other speaks.
  - Optional cutaway / insert: a tight static shot of an object the
    dialogue explicitly references (a ring, a key, a doorway). Sparingly,
    only when the dialogue points to the object.

NOT in the vocabulary, do not produce these:
  - No low-angle hero shots, no high-angle bird's-eye, no Dutch angles.
  - No tracking, dolly, crane, drone, or floating cameras.
  - No POV unless the scene genuinely warrants it (a deliberate reveal of
    what one character sees), and only once if at all.
  - No 360-degree orbits, whip-pans, or Snorricam.

CUTTING PATTERN:
  - OPEN on the two-shot to establish the characters' spatial
    relationship.
  - Then alternate between speakers and reactions: speaker CU -> listener
    reaction CU -> speaker OTS -> reverse OTS, varying as the dialogue
    progresses.
  - VARY shot size between consecutive shots. Never cut from a medium to
    another near-identical medium. Alternate close-up / OTS / two-shot.
  - Hold the 180-DEGREE LINE. Once you establish screen direction
    (character A on screen-left, character B on screen-right), every
    subsequent shot keeps them on those sides. Do not flip across the
    line.

CAMERA MOVEMENT:
  - DEFAULT IS LOCKED-OFF / STATIC. The camera does not drift, pan, tilt,
    track, dolly, or float. The framing is set and held.
  - One allowed exception: a slow PUSH-IN reserved for the emotional peak
    of the scene — a revelation, a turn, the moment the balance shifts.
    Use AT MOST ONCE across the entire {shotCount}-shot list. Not every
    shot, not multiple shots.
  - No handheld, no shake.

PERFORMANCE STAYS PHYSICALLY ACTIVE even though the camera holds still.
Characters keep reacting, breathing, shifting weight, micro-gesturing
throughout. A static camera does not mean static people; the body acting
in the action and performance fields stays charged and specific.

Refer to characters BY NAME in action and performance (e.g. "Mira
leans against the door"), so the right reference image is used for
each figure.

PER-SHOT WRITING RULE — AIM, DON'T PILE.
Each shot has ONE dominant action and ONE dominant performance beat.
Write both as vividly and specifically as you want — keep the texture,
the precise verbs, the physical detail. What you must NOT do is stack
competing simultaneous movements into one shot. A shot is ~4 seconds;
the model can render one clear physical intention, not six at once.

  action: the single thing that physically happens in this shot. One
  intention. ("Amy's chin drags over her shoulder toward the dark
  corner.") NOT a catalogue ("she turns AND steps back AND raises her
  hand AND her breath catches"). One verb that owns the shot.

  performance: one externalising beat — the single gesture or
  micro-expression that best shows the emotion. Write it richly, but
  it must be ONE beat the body can actually execute in the time, not a
  catalogue of every muscle. Choose the detail that reads on camera
  and commit to it fully. "Her jaw locks and one tendon twitches in
  her throat" beats "weight on her heels AND shoulders inward AND
  fingers curled AND jaw tight AND breath held."

The test for every performance line: can a person physically perform
this single intention in four seconds without rushing? If not, cut
until it's one committed beat. Vividness stays. Simultaneity goes.
Specific and aimed, not sparse and rushed, and never a stacked pile.

Distribute the DIALOGUE lines across the {shotCount} shots IN ORDER. Attach each
line to the shot where it is spoken via the per-shot dialogue array.
Every line from the supplied dialogue array must appear on exactly one
shot and nowhere else. Do not paraphrase. Do not duplicate. If a shot
is wordless, return an empty dialogue array for it. If a single shot
needs more than one short line to land an exchange, that's allowed,
but only when both lines genuinely belong to the same beat.

PUNCTUATION RULE: never use em dashes. Use commas, periods, or
sentence breaks.

OUTPUT FORMAT: return JSON ONLY (no prose, no fences). The top-level
value is an array of exactly {shotCount} shot objects, each shaped:
{
  "n": 1..{shotCount} (1-indexed, in order),
  "camera": "shot type from the coverage vocabulary (wide two-shot / OTS
             favoring NAME / CU NAME speaking / CU NAME reacting / insert
             of OBJECT) plus framing detail. Static unless this is the one
             allowed slow push-in.",
  "action": "the ONE physical intention in this shot. Character by name.
             No body-direction here (that goes in performance).",
  "performance": "the ONE committed body beat. Vivid, specific, four-
                  seconds-possible. Not a stacked list.",
  "dialogue": [ { "speaker": "Name", "line": "exact quoted speech" }, ... ]
}

Cast:
{cast}

SCENE DESCRIPTION:
{sceneDescription}

DIALOGUE (in order, must all appear across the {shotCount} shots):
{dialogue}`,

  stage4: `PHOTOREALISTIC 9:16 vertical film still — ONE single
composition, no panels, no grid, no borders, no captions. This is the
opening frame of a short video clip; Seedance will animate from it.
Real-camera depth of field, real lighting, real skin and fabric
texture. NO cartoon, anime, illustration, painting, comic, sketch,
watercolour, ink wash, 3D render, or stylised look — strictly a
photographic film still.

REFERENCE HIERARCHY (strict, do not freelance):
1. The FIRST attached image is the LOCATION. It is the literal
   setting. Render INSIDE that exact environment. Do not invent a
   different location, do not substitute a beach or studio or
   generic backdrop. If the framing is a close-up, the bits of
   environment that peek into the frame must still match the
   location image.
2. The remaining attached images are CHARACTER REFERENCE SHEETS,
   one per named character. Match face, hair, body type, clothing,
   and accessories exactly to whichever sheet corresponds to the
   named character. Do not blend, swap, or invent looks.

BODY ACTING: render physical performance, not a stiff pose. Honor
the Performance direction below — weight, posture, hands, eyeline,
micro-expression. No character standing flat-footed or staring with
a neutral expression.

Cast:
{cast}

Compose ONE frame depicting this moment (the camera, action, and
performance below ARE this single shot — do not split the frame, do
not stack panels):
{shots}`,

  stage5: `PHOTOREALISTIC 9:16 vertical film clip, {seconds} seconds, with
spoken dialogue baked into the audio. Strictly photographic — no cartoon,
anime, illustration, painting, comic, sketch, 3D render, or stylised look.

Attached images: the storyboard frame defines camera + composition; each
character has their own reference sheet ({cast}) — preserve face, hair,
clothing, proportions exactly; the location sheet defines the environment.

Render people, not mannequins: natural body weight, breath, micro-
expressions, small involuntary gestures, the felt distance between bodies.
Camera movement follows the performance, never the other way around.

SCENE (one continuous beat over {seconds} seconds — the action, performance,
and dialogue flow together; characters SPEAK each quoted line aloud at the
moment it appears):

{scene}`,
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
  // Per-job chunk count = number of 4s clips. Drives the requested
  // shot count (2 shots per clip is the sweet spot for pacing).
  chunkCount: number;
}): Promise<string> {
  const clipCount = args.chunkCount;
  const totalSec = clipCount * 4;
  const shotCount = clipCount * 2; // 2 shots per clip
  return render(await effectivePrompt("stage3"), {
    cast: castBlock(args.characters),
    sceneDescription: args.sceneDescription,
    dialogue: dialogueBlock(args.dialogue),
    shotCount: String(shotCount),
    totalSec: String(totalSec),
    clipCount: String(clipCount),
  });
}

export async function renderStage4(args: {
  shots: Shot[];
  characters: Character[];
}): Promise<string> {
  // The chunk's first shot IS the moment we ask the image model to
  // compose. Other shots in the chunk are conveyed to Seedance via the
  // stage 5 text prompt — they don't need to appear as panels in the
  // storyboard. This keeps the start_image a clean single 9:16 frame.
  const firstShot = args.shots[0];
  const shotsText = firstShot ? shotsBlock([firstShot]) : "(no shots)";
  return render(await effectivePrompt("stage4"), {
    cast: castBlock(args.characters),
    shots: shotsText,
  });
}

export async function renderStage5(args: {
  shots: Shot[];
  characters: Character[];
  // Per-chunk clip duration (4/8/12/15s). Drives the {seconds}
  // placeholder so Seedance knows the time budget.
  seconds: number;
}): Promise<string> {
  return render(await effectivePrompt("stage5"), {
    cast: castBlock(args.characters),
    scene: sceneBlock(args.shots),
    seconds: String(args.seconds),
  });
}
