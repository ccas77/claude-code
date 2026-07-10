import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { putBlob, fetchStored, type StoredBlob } from '../storage';
import { wordsToAss } from './ass';
import type { CaptionWord } from '../db/schema';

/**
 * All video work happens here, with the bundled ffmpeg binary, inside the
 * worker function — same approach as bookshelf's render pipeline. Inputs are
 * pulled from Blob into a per-job temp dir, the output goes back to Blob.
 *
 * The Ken Burns move: upscale the still 2x first (zoompan on a native-res
 * image produces visible stair-step jitter), then a linear zoom toward the
 * scene's focal point. Zoom direction alternates per scene so the video
 * doesn't feel like one long push-in.
 */

const ffmpegPath: string =
  (ffmpegInstaller as unknown as { path: string }).path || 'ffmpeg';

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const LEAD_IN = 0.4; // image on screen before narration starts
const TAIL = 0.6; // and after it ends
const ZOOM_SPAN = 0.12; // subtle: 1.00 -> 1.12; big zooms read as cheap

// focus region -> normalized point the zoom converges toward
const FOCUS_XY: Record<string, [number, number]> = {
  center: [0.5, 0.5],
  'upper-left': [0.25, 0.28],
  'upper-right': [0.75, 0.28],
  'lower-left': [0.25, 0.72],
  'lower-right': [0.75, 0.72],
  left: [0.22, 0.5],
  right: [0.78, 0.5],
};

export async function renderSceneClip(args: {
  imageUrl: string;
  audioUrl: string;
  audioDurationSeconds: number;
  words: CaptionWord[];
  sceneIdx: number;
  focus: string;
  ownerId: string;
  storyId: string;
}): Promise<{ stored: StoredBlob; durationSeconds: number }> {
  const work = path.join(tmpdir(), `sw-clip-${randomUUID()}`);
  await fs.mkdir(work, { recursive: true });
  try {
    const [imageBytes, audioBytes] = await Promise.all([
      fetchStored(args.imageUrl),
      fetchStored(args.audioUrl),
    ]);
    await Promise.all([
      fs.writeFile(path.join(work, 'image.png'), imageBytes),
      fs.writeFile(path.join(work, 'audio.in'), audioBytes),
    ]);

    const total = LEAD_IN + args.audioDurationSeconds + TAIL;
    const frames = Math.max(1, Math.round(total * FPS));
    const zoomIn = args.sceneIdx % 2 === 0;
    const zFrom = zoomIn ? 1.0 : 1.0 + ZOOM_SPAN;
    const zTo = zoomIn ? 1.0 + ZOOM_SPAN : 1.0;
    const [fx, fy] = FOCUS_XY[args.focus] ?? FOCUS_XY.center;

    // No commas inside any expression, so the filter-chain parser never
    // misreads them (the hard-won bookshelf lesson).
    const zoomExpr = `${zFrom}+(${zTo}-${zFrom})*on/${frames}`;
    const filters = [
      `scale=${WIDTH * 2}:${HEIGHT * 2}:force_original_aspect_ratio=increase`,
      `crop=${WIDTH * 2}:${HEIGHT * 2}`,
      `zoompan=z=${zoomExpr}:x=(iw-iw/zoom)*${fx.toFixed(4)}:y=(ih-ih/zoom)*${fy.toFixed(4)}:d=1:s=${WIDTH}x${HEIGHT}:fps=${FPS}`,
    ];

    if (args.words.length > 0) {
      const bundledFont = new URL('./font.ttf', import.meta.url);
      const ttfBytes = await fs.readFile(bundledFont);
      const fontsDir = path.join(work, 'fonts');
      await fs.mkdir(fontsDir, { recursive: true });
      await Promise.all([
        fs.writeFile(path.join(work, 'captions.ass'), wordsToAss(args.words, LEAD_IN), 'utf-8'),
        fs.writeFile(path.join(fontsDir, 'font.ttf'), ttfBytes),
      ]);
      filters.push('subtitles=captions.ass:fontsdir=fonts');
    }

    const delayMs = Math.round(LEAD_IN * 1000);
    const graph = [
      `[0:v]${filters.join(',')}[outv]`,
      `[1:a]adelay=${delayMs}|${delayMs},apad[outa]`,
    ].join(';');
    await fs.writeFile(path.join(work, 'graph.txt'), graph, 'utf-8');

    await runFfmpeg(
      [
        '-y',
        '-loop', '1', '-framerate', String(FPS), '-i', 'image.png',
        '-i', 'audio.in',
        '-filter_complex_script', 'graph.txt',
        '-map', '[outv]', '-map', '[outa]',
        '-t', total.toFixed(3),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
        '-video_track_timescale', '90000',
        'clip.mp4',
      ],
      work,
    );

    const bytes = await fs.readFile(path.join(work, 'clip.mp4'));
    const pathname = `stories/${args.ownerId}/${args.storyId}/clips/${String(args.sceneIdx).padStart(3, '0')}.mp4`;
    const stored = await putBlob(pathname, bytes);
    return { stored, durationSeconds: total };
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Final assembly: stream-copy concat of the per-scene clips. Every clip was
 * encoded here with identical codec settings, so `-c copy` is loss-free and
 * near-instant — the whole story assembles in seconds regardless of length.
 */
export async function assembleClips(args: {
  clipUrls: string[];
  ownerId: string;
  storyId: string;
}): Promise<{ stored: StoredBlob; durationSeconds: number }> {
  const work = path.join(tmpdir(), `sw-final-${randomUUID()}`);
  await fs.mkdir(work, { recursive: true });
  try {
    const names: string[] = [];
    for (let i = 0; i < args.clipUrls.length; i++) {
      const name = `${String(i).padStart(3, '0')}.mp4`;
      await fs.writeFile(path.join(work, name), await fetchStored(args.clipUrls[i]));
      names.push(name);
    }
    await fs.writeFile(
      path.join(work, 'list.txt'),
      names.map((n) => `file '${n}'`).join('\n'),
      'utf-8',
    );
    await runFfmpeg(
      ['-y', '-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', '-movflags', '+faststart', 'final.mp4'],
      work,
    );
    const outPath = path.join(work, 'final.mp4');
    const duration = await probeDurationSeconds(outPath);
    const bytes = await fs.readFile(outPath);
    const stored = await putBlob(`stories/${args.ownerId}/${args.storyId}/final.mp4`, bytes);
    return { stored, durationSeconds: duration };
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/** Placeholder scene image for DRY_RUN: a solid tone derived from the seed. */
export async function placeholderImage(seed: string): Promise<Buffer> {
  const work = path.join(tmpdir(), `sw-ph-${randomUUID()}`);
  await fs.mkdir(work, { recursive: true });
  try {
    let hash = 0;
    for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const r = 30 + (hash % 60);
    const g = 40 + ((hash >>> 6) % 60);
    const b = 70 + ((hash >>> 12) % 80);
    const hex = [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
    await runFfmpeg(
      ['-y', '-f', 'lavfi', '-i', `color=c=0x${hex}:s=${WIDTH}x${HEIGHT}`, '-frames:v', '1', 'ph.png'],
      work,
    );
    return await fs.readFile(path.join(work, 'ph.png'));
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/** Silent narration track for DRY_RUN, correctly sized to the word count. */
export async function silentAudio(seconds: number): Promise<Buffer> {
  const work = path.join(tmpdir(), `sw-sil-${randomUUID()}`);
  await fs.mkdir(work, { recursive: true });
  try {
    await runFfmpeg(
      ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', seconds.toFixed(3), '-c:a', 'aac', 'silent.m4a'],
      work,
    );
    return await fs.readFile(path.join(work, 'silent.m4a'));
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/** Duration of a local media file, parsed from ffmpeg's own probe output. */
export async function probeDurationSeconds(filePath: string): Promise<number> {
  const { stderr } = await runFfmpegRaw(['-i', filePath], path.dirname(filePath), true);
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) throw new Error(`could not parse duration of ${filePath}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export async function probeBufferDurationSeconds(bytes: Buffer, ext: string): Promise<number> {
  const work = path.join(tmpdir(), `sw-probe-${randomUUID()}`);
  await fs.mkdir(work, { recursive: true });
  try {
    const p = path.join(work, `probe.${ext}`);
    await fs.writeFile(p, bytes);
    return await probeDurationSeconds(p);
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

async function runFfmpeg(args: string[], cwd: string): Promise<void> {
  const { code, stderr } = await runFfmpegRaw(args, cwd, false);
  if (code !== 0) throw new Error(`ffmpeg exit ${code}: ${stderr.slice(-1500)}`);
}

function runFfmpegRaw(
  args: string[],
  cwd: string,
  allowFailure: boolean,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    proc.on('close', (code) => {
      if (code === 0 || allowFailure) resolve({ code: code ?? -1, stderr });
      else resolve({ code: code ?? -1, stderr });
    });
    proc.on('error', reject);
  });
}
