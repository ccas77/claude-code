// Zero-dependency SVG slide renderer. This stands in for the sharp+Pango /
// text-to-svg overlay pipelines in the standalone apps: same idea (AI/placeholder
// background + wrapped, outlined text baked on top), but pure SVG so it runs with
// no native deps and no API key. Swap `background()` for a real Gemini PNG later
// and the rest is unchanged.

export interface Dims {
  w: number;
  h: number;
}

export const ASPECTS: Record<string, Dims> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "2:3": { w: 1000, h: 1500 }, // Pinterest
  "4:5": { w: 1080, h: 1350 },
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Greedy word-wrap by approximate character width. Mirrors the wrap logic in the
// slideshow apps (they wrap ~18 chars for the narrow BookTok column).
export function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if ((line + " " + word).length <= maxChars) line += " " + word;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Deterministic dark-romance gradient from the book's vibe/title so slides feel
// on-brand without an AI image. Stable per string (no randomness).
function hue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

function background(seed: string, dims: Dims): string {
  const a = hue(seed);
  const b = (a + 40) % 360;
  return `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="hsl(${a},45%,18%)"/>
        <stop offset="55%" stop-color="hsl(${b},40%,10%)"/>
        <stop offset="100%" stop-color="hsl(${a},50%,6%)"/>
      </linearGradient>
      <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0.55)"/>
      </linearGradient>
    </defs>
    <rect width="${dims.w}" height="${dims.h}" fill="url(#bg)"/>
    <rect width="${dims.w}" height="${dims.h}" fill="url(#scrim)"/>`;
}

export interface TextSlideOpts {
  text: string;
  seed: string;
  aspect?: string;
  maxChars?: number;
  fontSize?: number;
  position?: "top" | "middle" | "bottom";
  kicker?: string; // small label above, e.g. a trope tag
}

// One outlined-text slide: the core overlay look (white bold text, black stroke
// via paint-order) centered on a gradient. Returns standalone SVG markup.
export function textSlide(opts: TextSlideOpts): string {
  const dims = ASPECTS[opts.aspect ?? "9:16"];
  const maxChars = opts.maxChars ?? 18;
  const fontSize = opts.fontSize ?? Math.round(dims.w * 0.075);
  const lineH = Math.round(fontSize * 1.18);
  const lines = wrap(opts.text, maxChars);
  const blockH = lines.length * lineH;

  let top: number;
  if (opts.position === "top") top = dims.h * 0.16;
  else if (opts.position === "bottom") top = dims.h * 0.84 - blockH;
  else top = (dims.h - blockH) / 2;

  const kicker = opts.kicker
    ? `<text x="${dims.w / 2}" y="${top - fontSize * 0.7}" fill="hsl(45,90%,70%)"
         font-family="Georgia, 'Times New Roman', serif" font-size="${Math.round(
           fontSize * 0.42
         )}" font-weight="700" letter-spacing="4" text-anchor="middle"
         style="text-transform:uppercase">${esc(opts.kicker)}</text>`
    : "";

  const tspans = lines
    .map(
      (ln, i) =>
        `<tspan x="${dims.w / 2}" y="${Math.round(
          top + fontSize + i * lineH
        )}">${esc(ln)}</tspan>`
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dims.w}" height="${
    dims.h
  }" viewBox="0 0 ${dims.w} ${dims.h}">
  ${background(opts.seed, dims)}
  ${kicker}
  <text font-family="Arial, Helvetica, sans-serif" font-weight="800"
        font-size="${fontSize}" fill="#ffffff" text-anchor="middle"
        stroke="rgba(0,0,0,0.8)" stroke-width="${Math.max(
          2,
          Math.round(fontSize * 0.09)
        )}" paint-order="stroke" style="paint-order:stroke fill">
    ${tspans}
  </text>
</svg>`;
}

// A cover slide: the book's title/author styled as a centered "card". Stands in
// for compositing a real cover image.
export function coverSlide(title: string, author: string, seed: string, aspect = "9:16"): string {
  const dims = ASPECTS[aspect];
  const cw = Math.round(dims.w * 0.62);
  const ch = Math.round(cw * 1.5);
  const cx = (dims.w - cw) / 2;
  const cy = (dims.h - ch) / 2;
  const titleLines = wrap(title.toUpperCase(), 14);
  const titleSize = Math.round(cw * 0.13);
  const tspans = titleLines
    .map(
      (ln, i) =>
        `<tspan x="${dims.w / 2}" y="${Math.round(
          cy + ch * 0.34 + i * titleSize * 1.1
        )}">${esc(ln)}</tspan>`
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dims.w}" height="${dims.h}" viewBox="0 0 ${dims.w} ${dims.h}">
  ${background(seed + "cover", dims)}
  <rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="14" fill="hsl(${hue(
    seed
  )},35%,14%)" stroke="hsl(45,80%,60%)" stroke-width="3"/>
  <text font-family="Georgia, serif" font-weight="800" font-size="${titleSize}" fill="#fff" text-anchor="middle">${tspans}</text>
  <text x="${dims.w / 2}" y="${Math.round(
    cy + ch * 0.82
  )}" font-family="Georgia, serif" font-size="${Math.round(
    cw * 0.06
  )}" fill="hsl(45,80%,70%)" text-anchor="middle" style="text-transform:uppercase; letter-spacing:3px">${esc(
    author
  )}</text>
</svg>`;
}
