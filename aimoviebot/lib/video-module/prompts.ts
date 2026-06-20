import type { Character, DialogueLine, Shot } from "./types";

// Helper used by Stages 0/3/4/5 to name the cast in the prompt so dialogue
// speakers map cleanly to reference sheets.
const castBlock = (characters: { name: string }[]) =>
  characters.length === 0
    ? "(no named characters)"
    : characters.map((c) => `- ${c.name}`).join("\n");

// ---- Stage 0 (concept) mode templates ----

export const conceptSystem = `You generate a single shootable scene plus the
spoken dialogue lines, sized to fit a 16-shot vertical video clip. Always
return JSON matching the supplied schema. The dialogue array is the actual
words the characters will SAY out loud in the final video; keep lines short
and speakable (a 4-15 second clip cannot hold long speeches). Attribute every
spoken line to one of the SUPPLIED character names (use them VERBATIM so the
right reference sheet is voiced). Narrators or off-screen voices may use a
custom speaker label like "Narrator" or "Voiceover". If the scene is
genuinely wordless, return an empty dialogue array.

PUNCTUATION RULE: never use em dashes anywhere in your output (not in
sceneDescription, not in dialogue lines, not in notes). Use commas, periods,
or sentence breaks instead. Em dashes break the downstream speech pipeline.`;

export const promptModeA = (input: string, characters: Character[]) => `MODE A
(direct write). The user wrote the scene themselves. Light normalize their
text into a single coherent action paragraph. PRESERVE every spoken line they
wrote VERBATIM in the dialogue array with its speaker. Do not paraphrase, do
not invent plot, do not add dialogue they didn't write. Replace any em dashes
you encounter with commas or periods.

Cast (use these names as dialogue speakers; if the user wrote a different
name for someone in this cast, map it to the closest match):
${castBlock(characters)}

USER TEXT:
${input}`;

export const promptModeB = (input: string, characters: Character[]) => `MODE B
(book excerpt). Extract the visualizable beats from this prose excerpt and
compress to a single scene that fits 16 shots. Discard interiority,
backstory, authorial aside. Pull the spoken lines out of the prose into the
dialogue array with speakers, using the excerpt's actual quoted dialogue
where it exists. Trim long speeches to speakable length. If the excerpt
contains more than one scene's worth of action, use the first and note it in
'notes'. Replace any em dashes with commas or periods.

Cast (these are the ONLY visual characters available; map every named or
implied speaker in the excerpt to one of them so the right reference sheet
gets voiced):
${castBlock(characters)}

EXCERPT:
${input}`;

export const promptModeC = (input: string, characters: Character[]) => `MODE C
(brainstorm). The user gave only a blurb, title, or one-line hint. Use the
supplied character and location images as creative constraints so the premise
fits what will be rendered. Propose a logline and a short scene premise,
returning 2-3 alternates in the 'alternates' array (each one a complete
alternative sceneDescription). The primary 'sceneDescription' is your
strongest pick. Write short, punchy dialogue lines that fit the premise. A
few strong lines beat a wall of talk in 4-15s. Use the cast names below as
dialogue speakers.

Cast:
${castBlock(characters)}

INPUT:
${input}`;

// ---- Stage 1 (character sheet) ----
export const stage1Prompt = (characterName: string) => `Character design
reference sheet for ${characterName}, based entirely on the provided input
character image. 9:16 vertical. NO text/labels anywhere. Preserve exact face,
hair, proportions, clothing, accessories, colors with maximum fidelity. The
input image is the sole source of truth for this character. Include
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
    ? "(none, this scene is wordless)"
    : dialogue.map((d, i) => `${i + 1}. ${d.speaker}: "${d.line}"`).join("\n");

export const stage3Prompt = (args: {
  sceneDescription: string;
  dialogue: DialogueLine[];
  characters: Character[];
}) => `Convert the SCENE DESCRIPTION into exactly 16 storyboard panels. Use
the uploaded character + location sheets as the sole sources of truth (one
sheet per character, named below). ALL shots are composed for 9:16 VERTICAL
framing. Favor compositions that read well tall: full-body and medium
verticals, stacked foreground/background depth, low and high angles,
close-ups; use sparing wide shots that still work in portrait rather than
sprawling landscape vistas. Vary shot sizes (EWS to ECU) and angles
(eye/low/high/OTS/POV/tracking). Structure: shots 1-3 establish, 4-7 build,
8-11 reveal/twist, 12-14 escalate, 15-16 resolve.

Refer to characters BY NAME in actions (e.g. "Mira leans against the door
while Cal watches"), so the right reference sheet is used for each figure.

Distribute the DIALOGUE lines across the 16 shots IN ORDER. Attach each line
to the shot where it is spoken. If a shot has no dialogue, omit the dialogue
marker. Every line from the dialogue array must appear on exactly one shot.

PUNCTUATION RULE: never use em dashes. Use commas, periods, or sentence
breaks.

Output EXACTLY this format, one shot per line, nothing else. The separator
between camera and action is a vertical bar with single spaces around it:
Shot N: [Camera] | [Action] [Speaker: "line"] [Speaker: "line"]

Cast:
${castBlock(args.characters)}

SCENE DESCRIPTION:
${args.sceneDescription}

DIALOGUE (in order):
${dialogueBlock(args.dialogue)}`;

// ---- Stage 4 (storyboard grid image) ----
export const stage4Prompt = (args: {
  shots: Shot[];
  characters: Character[];
}) => `Professional storyboard sheet in 9:16 VERTICAL format. 16 panels. Each
individual panel is framed 9:16 vertical (portrait shots, this is what the
final video inherits, so panels must compose for vertical). Use a 2 columns ×
8 rows layout so portrait panels are not squashed (NOT a 4×4 grid of
landscape cells). Thin black borders, bold frame number top-left of each
panel, short caption under each. The character reference sheets (one per
named character) and the location sheet are the sole sources of truth.

Cast (each has its own reference sheet; keep faces, hair, clothing consistent
with whichever sheet corresponds to the named character on each shot):
${castBlock(args.characters)}

Insert the 16 shots below:
${args.shots
  .map((s) => {
    const dlg = s.dialogue
      .map((d) => `[${d.speaker}: "${d.line}"]`)
      .join(" ");
    return `Shot ${s.n}: ${s.camera} | ${s.action}${dlg ? " " + dlg : ""}`;
  })
  .join("\n")}`;

// ---- Stage 5 (video, with dialogue baked in) ----
export const stage5Prompt = (args: {
  shots: Shot[];
  characters: Character[];
}) => {
  const spoken = args.shots
    .flatMap((s) =>
      s.dialogue.map((d) => `(Shot ${s.n}) ${d.speaker}: "${d.line}"`),
    )
    .join("\n");
  return `Use the storyboard sheet as the primary source of truth. Each
character has their own reference sheet (named below). Keep face, hair,
clothing, and proportions consistent with the right sheet on every shot. The
location sheet defines the environment. Follow the storyboard's sequence,
angles, compositions, actions. High-end cinematic animation, smooth motion,
natural camera movement.

Cast (each name corresponds to its own reference sheet image):
${castBlock(args.characters)}

The characters SPEAK the following dialogue aloud, in order, matched to the
shots indicated. The spoken words must be audible in the video; voice each
named character with the appearance and demeanor from their reference sheet:
${spoken || "(no dialogue; wordless scene)"}`;
};
