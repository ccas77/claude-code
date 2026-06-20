import { z } from "zod";
import {
  gatewayGenerateJSON,
} from "./backends/gateway";
import {
  conceptSystem,
  promptModeA,
  promptModeB,
  promptModeC,
} from "./prompts";
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

// Mode A doesn't need the character/location images as input — the user is
// the author. Modes B and C do (vision-grounded) so the proposed scene fits
// the actual cast and set.
function promptFor(input: ConceptInput): {
  prompt: string;
  imageUrls: string[];
} {
  if (input.mode === "A") {
    return {
      prompt: `${schemaHint}\n\n${promptModeA(input.conceptInput)}`,
      imageUrls: [],
    };
  }
  if (input.mode === "B") {
    return {
      prompt: `${schemaHint}\n\n${promptModeB(input.conceptInput)}`,
      imageUrls: [input.characterImageUrl, input.locationImageUrl],
    };
  }
  return {
    prompt: `${schemaHint}\n\n${promptModeC(input.conceptInput)}`,
    imageUrls: [input.characterImageUrl, input.locationImageUrl],
  };
}

export async function runConcept(input: ConceptInput): Promise<ConceptResult> {
  const { prompt, imageUrls } = promptFor(input);
  const raw = await gatewayGenerateJSON<unknown>({
    system: conceptSystem,
    prompt,
    imageUrls,
  });
  const parsed = conceptResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Concept output failed schema: ${parsed.error.message}\nRaw: ${JSON.stringify(raw).slice(0, 500)}`,
    );
  }
  // Mode-specific guards. Alternates are Mode C only.
  const out: ConceptResult = { ...parsed.data, mode: input.mode };
  if (input.mode !== "C") delete out.alternates;
  return out;
}
