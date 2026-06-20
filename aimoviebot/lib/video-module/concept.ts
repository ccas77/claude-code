import { z } from "zod";
import { gatewayGenerateJSON } from "./backends/gateway";
import {
  renderConceptSystem,
  renderModeA,
  renderModeB,
  renderModeC,
} from "./prompts";
import { stripEmDashes } from "./stages";
import type { ConceptInput, ConceptResult } from "./types";

const dialogueLineSchema = z.object({
  speaker: z.string().min(1),
  line: z.string().min(1),
});

const conceptResultSchema = z.object({
  mode: z.enum(["A", "B", "C"]),
  sceneDescription: z.string().min(1),
  dialogue: z.array(dialogueLineSchema),
  alternates: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const schemaHint = `Return JSON only, matching:
{
  "mode": "A" | "B" | "C",
  "sceneDescription": string,
  "dialogue": [ { "speaker": string, "line": string }, ... ],
  "alternates"?: [string, ...],  // Mode C only, 2-3 alternates
  "notes"?: string
}`;

// Mode A doesn't need vision input (the user authored the scene). Modes B/C
// do, so the proposed scene fits the actual cast and set. ALL character
// images are passed in cast order so the model can connect names to faces.
async function promptFor(input: ConceptInput): Promise<{
  prompt: string;
  imageUrls: string[];
}> {
  const characters = input.characters;
  if (input.mode === "A") {
    return {
      prompt: `${schemaHint}\n\n${await renderModeA(input.conceptInput, characters)}`,
      imageUrls: [],
    };
  }
  if (input.mode === "B") {
    return {
      prompt: `${schemaHint}\n\n${await renderModeB(input.conceptInput, characters)}`,
      imageUrls: [
        ...characters.map((c) => c.imageUrl),
        input.locationImageUrl,
      ],
    };
  }
  return {
    prompt: `${schemaHint}\n\n${await renderModeC(input.conceptInput, characters)}`,
    imageUrls: [
      ...characters.map((c) => c.imageUrl),
      input.locationImageUrl,
    ],
  };
}

export async function runConcept(input: ConceptInput): Promise<ConceptResult> {
  const { prompt, imageUrls } = await promptFor(input);
  const system = await renderConceptSystem();
  const raw = await gatewayGenerateJSON<unknown>({
    system,
    prompt,
    imageUrls,
  });
  const parsed = conceptResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Concept output failed schema: ${parsed.error.message}\nRaw: ${JSON.stringify(raw).slice(0, 500)}`,
    );
  }
  // Sanitize every model-emitted string. Em dashes break the speech pipeline
  // downstream (Seedance stumbles on them) and are banned across the app.
  const parsedData = parsed.data;
  const out: ConceptResult = {
    mode: input.mode,
    sceneDescription: stripEmDashes(parsedData.sceneDescription),
    dialogue: parsedData.dialogue.map((d) => ({
      speaker: d.speaker.trim(),
      line: stripEmDashes(d.line),
    })),
    alternates: parsedData.alternates?.map(stripEmDashes),
    notes: parsedData.notes ? stripEmDashes(parsedData.notes) : undefined,
  };
  if (input.mode !== "C") delete out.alternates;
  return out;
}
