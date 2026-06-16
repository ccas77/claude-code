import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { decompress as woff2ToTtf } from 'wawoff2';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { putBlob } from '../storage';
import { wordsToAss, type CaptionEffect } from './ass';
import type { CaptionWord } from '../db/schema';

/**
 * Single-pass video assembly. Bundled ffmpeg, runs in the worker function.
 *
 * Subtitles are burned via libass. The ffmpeg-static binary doesn't ship
 * with fonts, so we fetch Inter at render time and point libass at it via
 * fontsdir. Captions land top-center so the book sits below in the lower
 * half of the frame.
 */

const ffmpegPath: string =
  (ffmpegInstaller as unknown as { path: string }).path || 'ffmpeg';

const CAPTION_FONT_FAMILY = 'TikTok Sans';
const CAPTION_FONT_WEIGHT = 700;

export type AssembledVideo = {
  url: string;
  pathname: string;
  provider: string;
};

export async function assembleVideoWithFfmpeg(args: {
  imageUrl: string;
  audioUrl: string;
  captionWords: CaptionWord[];
  ownerId: string;
  effect?: CaptionEffect;
}): Promise<AssembledVideo> {
  const work = path.join(tmpdir(), `render-${randomUUID()}`);
  await fs.mkdir(work, { recursive: true });

  try {
    const imagePath = 'image.png';
    const audioPath = 'audio.mp3';
    const assPath = 'captions.ass';
    const outPath = 'output.mp4';

    await Promise.all([
      downloadTo(args.imageUrl, path.join(work, imagePath)),
      downloadTo(args.audioUrl, path.join(work, audioPath)),
    ]);

    const filters: string[] = [
      'scale=w=1080:h=1920:force_original_aspect_ratio=decrease',
      'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0a0a0a',
      // No single-quoted exprs - escape every comma instead, otherwise the
      // filter-chain parser misreads commas inside quotes and bleeds args
      // into the next filter.
      'zoompan=z=min(1.0+0.0008*on\\,1.05):d=1:s=1080x1920:x=iw/2-(iw/zoom/2)+4*sin(on*0.05):y=ih/2-(ih/zoom/2)+3*cos(on*0.04)',
    ];

    if (args.captionWords.length > 0) {
      // Bundled Inter Bold + ASS subtitles with inline \an8 \pos pinning.
      // Going through ASS instead of SRT lets each cue lock its own
      // alignment/position regardless of how libass interprets force_style.
      const bundledFont = new URL('./font.ttf', import.meta.url);
      const ttfBytes = await fs.readFile(bundledFont);
      const fontsDir = path.join(work, 'fonts');
      await fs.mkdir(fontsDir, { recursive: true });
      await Promise.all([
        fs.writeFile(
          path.join(work, assPath),
          wordsToAss(args.captionWords, args.effect ?? 'fade-drift'),
          'utf-8',
        ),
        fs.writeFile(path.join(fontsDir, 'font.ttf'), ttfBytes),
      ]);
      filters.push(`subtitles=${assPath}:fontsdir=fonts`);
    }

    // Write the full filter graph to a file and let ffmpeg read it via
    // filter_complex_script. That bypasses shell + argv length limits and
    // also avoids ambiguity between commas inside expressions vs. commas
    // separating filters in the chain.
    const graphPath = 'graph.txt';
    const graph = `[0:v]${filters.join(',')}[outv]`;
    await fs.writeFile(path.join(work, graphPath), graph, 'utf-8');

    await runFfmpeg(
      [
        '-y',
        '-loop', '1', '-framerate', '30', '-i', imagePath,
        '-i', audioPath,
        '-filter_complex_script', graphPath,
        '-map', '[outv]', '-map', '1:a',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast',
        '-c:a', 'aac', '-b:a', '128k',
        '-shortest', '-movflags', '+faststart',
        outPath,
      ],
      work,
    );

    const bytes = await fs.readFile(path.join(work, outPath));
    const pathname = `library/renders/${args.ownerId}/${randomUUID()}.mp4`;
    const stored = await putBlob(pathname, bytes);
    return { url: stored.url, pathname: stored.pathname, provider: 'ffmpeg' };
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Build a `drawtext,drawtext,...` filter chain that lights up each caption
 * group at its word-level timestamps. Caption groups are ~2 words wide,
 * pinned to the top of the frame.
 */
function buildDrawtextChain(words: CaptionWord[], fontFile: string): string {
  const WORDS_PER_CUE = 2;
  const cues: { text: string; start: number; end: number }[] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_CUE) {
    const group = words.slice(i, i + WORDS_PER_CUE);
    if (!group.length) continue;
    cues.push({
      text: group.map((w) => w.text).join(' ').trim().toUpperCase(),
      start: group[0].start,
      end: group[group.length - 1].end + 0.05,
    });
  }

  return cues
    .map((c) => {
      const text = escapeDrawtext(c.text);
      // Commas inside expressions must be escaped so the filter-chain
      // parser doesn't read them as filter separators.
      const enable = `between(t\\,${c.start.toFixed(3)}\\,${c.end.toFixed(3)})`;
      return [
        `drawtext=fontfile=${fontFile}`,
        `text=${text}`,
        'fontsize=64',
        'fontcolor=white',
        'borderw=4',
        'bordercolor=black',
        'x=(w-text_w)/2',
        'y=180',
        `enable=${enable}`,
      ].join(':');
    })
    .join(',');
}

function escapeDrawtext(text: string): string {
  // drawtext text= argument: escape backslashes, single quotes, colons,
  // commas (chain separator), and percent (printf format).
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/%/g, '\\%');
}

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} failed (${res.status})`);
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

/**
 * Pull a font binary for libass. Tries jsdelivr's mirror of @fontsource
 * (most reliable, fixed URL shape) then falls back to Google Fonts CSS
 * parsing with a modern-browser UA.
 */
async function fetchGoogleFontBinary(
  family: string,
  weight: number,
): Promise<{ bytes: Buffer; ext: string }> {
  const slug = family.toLowerCase().replace(/\s+/g, '-');
  const fontsourceUrls = [
    `https://cdn.jsdelivr.net/npm/@fontsource/${slug}@latest/files/${slug}-latin-${weight}-normal.ttf`,
    `https://cdn.jsdelivr.net/npm/@fontsource/${slug}@latest/files/${slug}-latin-${weight}-normal.woff2`,
  ];
  for (const url of fontsourceUrls) {
    const res = await fetch(url);
    if (res.ok) {
      const ext = url.endsWith('.ttf') ? 'ttf' : 'woff2';
      return { bytes: Buffer.from(await res.arrayBuffer()), ext };
    }
  }

  // Fall back to Google Fonts CSS parsing
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
    family,
  )}:wght@${weight}&display=swap`;
  const cssRes = await fetch(cssUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (!cssRes.ok) {
    throw new Error(`google fonts css ${cssRes.status} for ${family}`);
  }
  const css = await cssRes.text();
  const urlMatch =
    css.match(/url\((https?:[^)]+\.ttf)\)/) ||
    css.match(/url\((https?:[^)]+\.otf)\)/) ||
    css.match(/url\((https?:[^)]+\.woff2?)\)/);
  if (!urlMatch) {
    throw new Error(`no font url for ${family} in css: ${css.slice(0, 200)}`);
  }
  const url = urlMatch[1];
  const ext = url.toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/)?.[1] ?? 'ttf';
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`font binary ${res.status} for ${family}`);
  }
  return { bytes: Buffer.from(await res.arrayBuffer()), ext };
}

async function runFfmpeg(args: string[], cwd: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    proc.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    proc.on('close', (code) => {
      const subtitlesLog = stderr
        .split('\n')
        .filter((l) => /subtitles|libass|fontselect|font/i.test(l))
        .join(' || ');
      console.log('[ffmpeg] subtitle-related stderr lines:', subtitlesLog);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-1500)}`));
    });
    proc.on('error', reject);
  });
}
