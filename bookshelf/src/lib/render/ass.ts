import type { CaptionWord } from '../db/schema';

/**
 * Multi-word ASS captions with kinetic typography effects.
 *
 * Grouping rule: up to MAX_WORDS_PER_CUE words per cue, but break a cue
 * early when ANY of these is true:
 *   - previous word ended with sentence punctuation .!?,
 *   - silence gap to next word exceeds SILENCE_BREAK_SEC,
 *   - we've hit the word cap.
 * This matches how speech actually paces - pauses ARE cue boundaries,
 * not just word counts.
 *
 * Typeface: Bebas Neue (bundled font.ttf).
 *
 * Position: \\an8 top-center anchor at (540, 560) - inside FB Feed's
 * centered 1:1 crop, clear of TikTok's top UI strip.
 *
 * Effects: applied per-cue via inline ASS overrides. The color-flash
 * effect highlights the FIRST cue of each sentence (after a punctuation
 * or silence break) so emphasis lands naturally.
 */

export type CaptionEffect =
  | 'none'
  | 'pop-in'
  | 'bounce'
  | 'slide-up'
  | 'fade-drift'
  | 'color-flash'
  | 'outline-pulse'
  | 'tilt'
  | 'glow-pulse'
  | 'wiggle';

export const CAPTION_EFFECTS: CaptionEffect[] = [
  'none',
  'pop-in',
  'bounce',
  'slide-up',
  'fade-drift',
  'color-flash',
  'outline-pulse',
  'tilt',
  'glow-pulse',
  'wiggle',
];

const MAX_WORDS_PER_CUE = 3;
const SILENCE_BREAK_SEC = 0.45;
const SENTENCE_END_RE = /[.!?]["')\]]*$/;
const FORCED_BREAK_TOKENS = new Set(['/', '|']);

// Whisper labels instrumental / non-vocal sections with placeholder tokens
// instead of transcribing nothing. Without filtering, a music-only clip ends
// up with subtitles that read "🎶 Music 🎶". Drop these from the cue stream
// (they still occupy a row in the words array, but never render).
const NON_SPEECH_TOKEN_RE = /^[\p{Extended_Pictographic}\p{So}\s]+$/u;
const NON_SPEECH_WORDS = new Set([
  'music',
  'intro',
  'outro',
  'instrumental',
  'applause',
  'laughter',
  'silence',
  'chorus',
  'verse',
  'bridge',
]);
const NON_SPEECH_BRACKETED_RE = /^[(\[][^)\]]+[)\]]$/; // (Music), [Music], etc.

function isNonSpeech(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (NON_SPEECH_TOKEN_RE.test(t)) return true;
  if (NON_SPEECH_BRACKETED_RE.test(t)) return true;
  const lowered = t.toLowerCase().replace(/[^a-z]/g, '');
  if (NON_SPEECH_WORDS.has(lowered)) return true;
  return false;
}

const MIN_CUE_DURATION_SEC = 0.4;
const POST_LAST_LINGER_SEC = 0.35;
const MAX_SILENT_GAP_BEFORE_CLEAR_SEC = 0.8;

const POS_X = 540;
const POS_Y = 460;

type Cue = {
  text: string;
  start: number;
  end: number;
  index: number;
  isSentenceStart: boolean;
};

export function wordsToAss(
  words: CaptionWord[],
  effect: CaptionEffect = 'fade-drift',
): string {
  if (!words.length) return '';

  const cues = buildCues(words);
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding',
    'Style: Default,Bebas Neue,112,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,7,0,8,40,40,0,1',
    '',
    '[Events]',
    'Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text',
  ].join('\n');

  const events = cues
    .map((c) => {
      const start = toAssTime(c.start);
      const end = toAssTime(c.end);
      const text = escapeAss(c.text);
      const tags = effectTags(effect, c);
      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${tags}${text}`;
    })
    .join('\n');

  return `${header}\n${events}\n`;
}

function buildCues(words: CaptionWord[]): Cue[] {
  // Pre-pass: strip forced-break tokens ("/" and "|") out of the word stream
  // and remember that the NEXT real word must start a new cue. The marker
  // token never renders.
  //
  // Defence in depth: if a marker arrives embedded in a token (e.g.
  // "monster/king" - the client retokeniser is supposed to normalise these
  // out but a stale word array from before that fix could still hit us),
  // split the token here and proportionally split its timing so the marker
  // still works.
  type Marked = { word: CaptionWord; forceBreak: boolean };
  const expanded: CaptionWord[] = [];
  for (const w of words) {
    const text = w.text.trim();
    // Drop Whisper's non-vocal annotations entirely. If a whole clip is just
    // these (music-only audio), the cue list ends up empty and nothing
    // renders - which is the desired behaviour, beats "🎶 Music 🎶" on
    // screen.
    if (isNonSpeech(text)) continue;
    if (FORCED_BREAK_TOKENS.has(text)) {
      expanded.push(w);
      continue;
    }
    if (!/[/|]/.test(text)) {
      expanded.push(w);
      continue;
    }
    // Split on every '/' and '|' keeping the marker as its own token, then
    // distribute the original word's [start, end] span across the parts.
    const parts = text.split(/([/|])/).filter(Boolean);
    const dur = Math.max(0.001, w.end - w.start);
    const step = dur / parts.length;
    parts.forEach((p, i) => {
      expanded.push({
        text: p,
        start: w.start + step * i,
        end: w.start + step * (i + 1),
      });
    });
  }

  const marked: Marked[] = [];
  let pendingForceBreak = false;
  for (const w of expanded) {
    if (FORCED_BREAK_TOKENS.has(w.text.trim())) {
      pendingForceBreak = true;
      continue;
    }
    marked.push({ word: w, forceBreak: pendingForceBreak });
    pendingForceBreak = false;
  }

  const groups: { words: CaptionWord[]; isSentenceStart: boolean }[] = [];
  let current: { words: CaptionWord[]; isSentenceStart: boolean } | null = null;

  for (let i = 0; i < marked.length; i++) {
    const w = marked[i].word;
    const forcedHere = marked[i].forceBreak;
    const prev = i > 0 ? marked[i - 1].word : null;
    const silenceGap = prev ? w.start - prev.end : 0;
    const prevEndedSentence = prev ? SENTENCE_END_RE.test(prev.text) : false;
    const newCueRequired =
      !current ||
      current.words.length >= MAX_WORDS_PER_CUE ||
      prevEndedSentence ||
      silenceGap > SILENCE_BREAK_SEC ||
      forcedHere;

    if (newCueRequired || !current) {
      if (current) groups.push(current);
      current = {
        words: [w],
        isSentenceStart:
          !prev || prevEndedSentence || silenceGap > SILENCE_BREAK_SEC || forcedHere,
      };
    } else {
      current.words.push(w);
    }
  }
  if (current) groups.push(current);

  const cues: Cue[] = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const next = groups[i + 1];
    const start = g.words[0].start;
    const lastEnd = g.words[g.words.length - 1].end;
    const minEnd = start + MIN_CUE_DURATION_SEC;
    let end = Math.max(lastEnd, minEnd);
    if (next) {
      const silenceGap = next.words[0].start - lastEnd;
      if (silenceGap > MAX_SILENT_GAP_BEFORE_CLEAR_SEC) {
        end = Math.min(end, lastEnd + POST_LAST_LINGER_SEC);
      } else {
        end = Math.min(end, next.words[0].start - 0.01);
      }
      if (end < minEnd) end = Math.min(minEnd, next.words[0].start - 0.01);
    } else {
      end = lastEnd + POST_LAST_LINGER_SEC;
    }
    cues.push({
      text: g.words.map((w) => w.text).join(' ').toUpperCase(),
      start,
      end,
      index: i,
      isSentenceStart: g.isSentenceStart,
    });
  }
  return cues;
}

function effectTags(effect: CaptionEffect, cue: Cue): string {
  const base = `\\an8\\pos(${POS_X},${POS_Y})`;
  switch (effect) {
    case 'none':
      return `{${base}}`;
    case 'pop-in':
      return `{${base}\\fscx0\\fscy0\\t(0,140,\\fscx100\\fscy100)}`;
    case 'bounce':
      return `{${base}\\fscx0\\fscy0\\t(0,120,\\fscx115\\fscy115)\\t(120,260,\\fscx100\\fscy100)}`;
    case 'slide-up':
      return `{\\an8\\move(${POS_X},${POS_Y + 200},${POS_X},${POS_Y},0,220)}`;
    case 'fade-drift': {
      const cueMs = Math.max(200, Math.round((cue.end - cue.start) * 1000));
      return `{${base}\\fad(150,100)\\fscx94\\fscy94\\t(0,${cueMs},\\fscx100\\fscy100)}`;
    }
    case 'color-flash':
      // Flash the first cue of every sentence so emphasis lands naturally.
      if (cue.isSentenceStart) {
        return `{${base}\\1c&H00F0FF&\\t(0,240,\\1c&HFFFFFF&)}`;
      }
      return `{${base}}`;
    case 'outline-pulse':
      return `{${base}\\bord0\\t(0,180,\\bord7)\\t(180,360,\\bord4)}`;
    case 'tilt':
      return `{${base}\\frz-12\\fscx0\\fscy0\\t(0,220,\\frz0\\fscx100\\fscy100)}`;
    case 'glow-pulse':
      return `{${base}\\blur5\\t(0,300,\\blur0)}`;
    case 'wiggle':
      return `{${base}\\frz-2\\t(0,80,\\frz2)\\t(80,160,\\frz-2)\\t(160,240,\\frz0)}`;
  }
}

function toAssTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const wholeSec = Math.floor(sec);
  const cs = Math.round((sec - wholeSec) * 100);
  return `${h}:${pad(m)}:${pad(wholeSec)}.${pad(cs)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function escapeAss(text: string): string {
  return text.replace(/\r?\n/g, ' ').trim();
}
