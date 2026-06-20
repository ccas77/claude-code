import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// All ffmpeg work runs in a fresh /tmp dir and tears down after. Lazy
// import of @ffmpeg-installer/ffmpeg so the workflow-VM sandbox doesn't
// see node-only code at module load time.

async function ffmpegBin(): Promise<string> {
  const mod = (await import("@ffmpeg-installer/ffmpeg")) as {
    default?: { path?: string };
    path?: string;
  };
  const path = mod.path ?? mod.default?.path;
  if (!path) {
    throw new Error("ffmpeg binary not found on @ffmpeg-installer/ffmpeg");
  }
  return path;
}

async function runFfmpeg(args: string[], cwd: string): Promise<void> {
  const bin = await ffmpegBin();
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-1500)}`));
    });
  });
}

// Concat N MP4s into one. All clips must share codec + size + fps. Seedance
// returns clips at the same resolution/mode so this is safe with -c copy
// (no re-encode). If codec drift becomes a problem, fall back to a re-encode
// concat. faststart moves the moov atom up front so players show frame 1
// without buffering the whole file.
export async function concatVideos(clipUrls: string[]): Promise<Buffer> {
  if (clipUrls.length === 0) {
    throw new Error("concatVideos called with zero clips");
  }
  const dir = await mkdtemp(join(tmpdir(), "aimoviebot-concat-"));
  try {
    const local = await Promise.all(
      clipUrls.map(async (url, i) => {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Concat clip ${i + 1}/${clipUrls.length} fetch ${res.status}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        const p = join(dir, `clip-${i}.mp4`);
        await writeFile(p, buf);
        return p;
      }),
    );
    const listPath = join(dir, "list.txt");
    await writeFile(listPath, local.map((p) => `file '${p}'`).join("\n"));
    const out = join(dir, "out.mp4");
    await runFfmpeg(
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        out,
      ],
      dir,
    );
    return readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Burn a list of caption cues onto a video. Uses ASS (libass) subtitles
// for clean styling control: bottom-third position, bold white text with
// a thin black stroke, no speaker prefix (the speaker is on camera).
//
// cues are { start, end } in seconds and a `text` line. We re-encode here
// because the subtitles filter rewrites the video stream — `-c copy` won't
// work. libass is fast at 720p though, normally <real-time.
export type CaptionCue = { startSec: number; endSec: number; text: string };

export async function burnCaptionsOnto(
  inputBuf: Buffer,
  cues: CaptionCue[],
): Promise<Buffer> {
  if (cues.length === 0) return inputBuf;
  const dir = await mkdtemp(join(tmpdir(), "aimoviebot-caption-"));
  try {
    const inPath = join(dir, "in.mp4");
    const assPath = join(dir, "captions.ass");
    const outPath = join(dir, "out.mp4");
    await writeFile(inPath, inputBuf);
    await writeFile(assPath, buildAss(cues), "utf-8");
    await runFfmpeg(
      [
        "-y",
        "-i",
        "in.mp4",
        // libass reads relative to cwd, which we set with the spawn opts.
        "-vf",
        `subtitles=captions.ass`,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        outPath,
      ],
      dir,
    );
    return readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ASS file: Advanced SubStation Alpha. Format is rigid; the style line
// below renders bold sans-serif, white fill, black stroke, anchored to
// the bottom-middle with a vertical margin so captions sit in the lower
// third of a 9:16 frame.
function buildAss(cues: CaptionCue[]): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,72,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,4,0,2,40,40,260,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const events = cues
    .map((c) => {
      const start = formatAssTime(c.startSec);
      const end = formatAssTime(c.endSec);
      const text = escapeAss(c.text);
      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
    })
    .join("\n");
  return header + events + "\n";
}

function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds * 100) % 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAss(text: string): string {
  // ASS reserves { } and \. Use a no-op override sequence to escape braces.
  return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\N");
}
