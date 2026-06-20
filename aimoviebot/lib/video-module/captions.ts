import type { DialogueLine } from "./types";
import type { CaptionCue } from "./ffmpeg";

// Whisper-based caption timing. Posts the rendered video's audio to
// OpenAI's audio.transcriptions endpoint with word-level timestamps and
// returns the segments shaped as ffmpeg cues.

type WhisperSegment = {
  start: number;
  end: number;
  text: string;
};
type WhisperResponse = {
  text?: string;
  segments?: WhisperSegment[];
  words?: { start: number; end: number; word: string }[];
};

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

export class CaptionsUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptionsUnavailable";
  }
}

// Given an MP4 buffer, return caption cues aligned to the actual spoken
// audio. Cues track Whisper's segment boundaries (one cue per phrase
// Whisper detected). Caller can pass the approved dialogue lines as a
// fallback if Whisper fails / mishears.
export async function whisperCaptionCues(
  videoBuf: Buffer,
  fallbackDialogue: DialogueLine[],
  totalSeconds: number,
): Promise<CaptionCue[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Graceful degradation: no Whisper key configured. Fall back to
    // evenly-distributed caption timing from the approved dialogue so the
    // video still gets captions, just less precisely timed.
    return estimateCuesFromDialogue(fallbackDialogue, totalSeconds);
  }

  // Whisper accepts mp4 directly when the file extension is right; no need
  // to extract audio separately.
  const form = new FormData();
  const blob = new Blob([Uint8Array.from(videoBuf)], { type: "video/mp4" });
  form.append("file", blob, "audio.mp4");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  // Request segment-level timestamps; word-level is supported too but
  // segment cues read cleaner as on-screen captions.
  form.append("timestamp_granularities[]", "segment");

  const res = await fetch(WHISPER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new CaptionsUnavailable(
      `Whisper ${res.status}: ${detail.slice(0, 300)}`,
    );
  }
  const data = (await res.json()) as WhisperResponse;
  const segments = data.segments ?? [];
  if (segments.length === 0) {
    return estimateCuesFromDialogue(fallbackDialogue, totalSeconds);
  }
  return segments
    .filter((s) => s.text && s.text.trim().length > 0)
    .map((s) => ({
      startSec: Math.max(0, s.start),
      endSec: Math.max(s.start + 0.5, s.end),
      text: s.text.trim(),
    }));
}

// When Whisper isn't available, distribute the approved dialogue lines
// evenly across the video's runtime. Not precise (lip sync drift) but
// keeps captions on screen.
function estimateCuesFromDialogue(
  dialogue: DialogueLine[],
  totalSeconds: number,
): CaptionCue[] {
  if (dialogue.length === 0) return [];
  const perLine = totalSeconds / dialogue.length;
  return dialogue.map((d, i) => ({
    startSec: i * perLine,
    endSec: (i + 1) * perLine,
    text: d.line,
  }));
}
