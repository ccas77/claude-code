import type { CaptionWord } from '../db/schema';

/**
 * Build an ASS subtitle file from word-level narration timings. Words are
 * grouped into short phrase cues (max 6 words / 42 chars) so captions read
 * as chunks rather than one static block. Timings are shifted by the scene's
 * lead-in so they line up inside the rendered clip.
 *
 * 1920x1080, bottom-center, Bebas Neue (the bundled font.ttf).
 */

const MAX_WORDS_PER_CUE = 6;
const MAX_CHARS_PER_CUE = 42;

type Cue = { text: string; start: number; end: number };

export function groupWords(words: CaptionWord[]): Cue[] {
  const cues: Cue[] = [];
  let current: CaptionWord[] = [];
  let chars = 0;
  for (const w of words) {
    const wl = w.text.length + 1;
    if (current.length > 0 && (current.length >= MAX_WORDS_PER_CUE || chars + wl > MAX_CHARS_PER_CUE)) {
      cues.push(toCue(current));
      current = [];
      chars = 0;
    }
    current.push(w);
    chars += wl;
  }
  if (current.length > 0) cues.push(toCue(current));
  return cues;
}

function toCue(words: CaptionWord[]): Cue {
  return {
    text: words.map((w) => w.text).join(' '),
    start: words[0].start,
    end: words[words.length - 1].end,
  };
}

function fmtTime(t: number): string {
  const clamped = Math.max(0, t);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

export function wordsToAss(words: CaptionWord[], offsetSeconds: number): string {
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1920',
    'PlayResY: 1080',
    'WrapStyle: 2',
    '',
    '[V4+ Styles]',
    'Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding',
    // Alignment 2 = bottom-center. Outline 3 + slight shadow for readability
    // over any illustration.
    'Style: Default,Bebas Neue,58,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,0,0,0,0,100,100,1,0,1,3,1,2,120,120,64,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  const lines = groupWords(words).map((cue) => {
    const start = fmtTime(cue.start + offsetSeconds);
    const end = fmtTime(cue.end + offsetSeconds);
    const text = cue.text.replace(/\r?\n/g, ' ').replace(/[{}]/g, '');
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
  });

  return `${header}\n${lines.join('\n')}\n`;
}
