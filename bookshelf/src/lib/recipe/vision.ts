import { generateText, type ModelMessage } from 'ai';
import { env } from '../config';

/**
 * Vision model wrapper. Goes through the Vercel AI Gateway so providers are
 * a one-line swap (env: VISION_PROVIDER=claude|gemini).
 *
 * The gateway authenticates via VERCEL_OIDC_TOKEN automatically when the
 * function runs on Vercel, so no provider-specific key is needed at runtime.
 */

const MODELS = {
  claude: 'anthropic/claude-sonnet-4-6',
  gemini: 'google/gemini-2.5-flash',
} as const;

type Provider = keyof typeof MODELS;

export async function visionAnalyze(
  prompt: string,
  imageUrls: string[],
): Promise<string> {
  const provider = (env().VISION_PROVIDER as Provider) ?? 'gemini';
  const model = MODELS[provider];

  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        ...imageUrls.map((url) => ({ type: 'image' as const, image: new URL(url) })),
      ],
    },
  ];

  const result = await generateText({ model, messages });
  return result.text;
}
