import { generateText } from 'ai';

/**
 * Caption riffing. Given the source material a creator has saved for a book
 * (description, review snippets, tropes, vibe notes) plus the audio caption
 * the clip will play, riff a short BookTok-style caption.
 *
 * Tone is taken from the source dump. The prompt is deliberately genre-neutral;
 * we don't hardcode "dark romance" voice or any other genre lens.
 *
 * Gemini 2.5 Flash via the Vercel AI Gateway (OIDC on Vercel, no extra key).
 */

const MODEL = 'google/gemini-2.5-flash';

export type CaptionInputs = {
  bookTitle: string;
  isSet?: boolean;
  description?: string | null;
  reviewDump?: string | null;
  tropes?: string[];
  vibeNotes?: string | null;
  audioCaption?: string | null;
  hashtags?: string[];
};

export async function generateCaption(inputs: CaptionInputs): Promise<string> {
  const tropes = (inputs.tropes ?? []).filter(Boolean);
  const hashtags = (inputs.hashtags ?? []).filter(Boolean);
  const tags = hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`));

  const sourceLines = [
    `Title: ${inputs.bookTitle}${inputs.isSet ? ' (a set, not a single book)' : ''}`,
    inputs.description ? `Blurb:\n${inputs.description.trim()}` : null,
    inputs.reviewDump ? `Reader reactions:\n${inputs.reviewDump.trim()}` : null,
    tropes.length ? `Tropes: ${tropes.join(', ')}` : null,
    inputs.vibeNotes ? `Vibe notes:\n${inputs.vibeNotes.trim()}` : null,
    inputs.audioCaption ? `What the audio says:\n"${inputs.audioCaption.trim()}"` : null,
    tags.length ? `Must-include hashtags: ${tags.join(' ')}` : null,
  ].filter(Boolean);

  const prompt = `Write one BookTok-style caption for a video about this book.

Rules:
- 2 to 4 short lines. No paragraphs.
- Hook in line 1. Make a reader stop scrolling.
- Match the tone implied by the source material below. Do not impose a tone the source does not suggest.
- Do not restate the audio line if it is already going to play over the video.
- Do not use the book title verbatim more than once.
- No emojis unless the source material uses them.
- No em dashes.
- End with the hashtags on the last line, all on one line, separated by single spaces.
- If "Must-include hashtags" are listed, all of them must appear. Add up to 4 more hashtags that fit the vibe.
- Return only the caption text. No commentary, no quotes, no labels.

Source material:
${sourceLines.join('\n\n')}`;

  const result = await generateText({ model: MODEL, prompt });
  return result.text.trim();
}
