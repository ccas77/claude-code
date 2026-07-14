import type { Book, BookModule, ModuleOutput, Slide } from "./types";
import { textSlide, coverSlide, ASPECTS, wrap } from "./render/svg";

// ---- shared helpers -------------------------------------------------------

function caption(book: Book, lead: string): string {
  const tags = book.hashtags.length
    ? book.hashtags.map((t) => (t.startsWith("#") ? t : "#" + t)).slice(0, 5).join(" ")
    : "#booktok #books #bookish #romancebooks #currentlyreading";
  return `${lead}\n\n${tags}`;
}

function pick<T>(arr: T[], n: number): T[] {
  return arr.slice(0, n);
}

// A meme panel: bold top/bottom text over a gradient (Impact-style).
function memePanel(book: Book, top: string, bottom: string): string {
  const d = ASPECTS["1:1"];
  const build = (text: string, y: number) =>
    wrap(text.toUpperCase(), 20)
      .map(
        (ln, i) =>
          `<tspan x="${d.w / 2}" y="${y + i * d.w * 0.11}">${ln
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")}</tspan>`
      )
      .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.w}" height="${d.h}" viewBox="0 0 ${d.w} ${d.h}">
    <rect width="${d.w}" height="${d.h}" fill="hsl(255,25%,12%)"/>
    <rect y="${d.h * 0.34}" width="${d.w}" height="${d.h * 0.32}" fill="hsl(330,40%,22%)"/>
    <text font-family="Impact, Arial Black, sans-serif" font-size="${Math.round(
      d.w * 0.09
    )}" fill="#fff" text-anchor="middle" stroke="#000" stroke-width="6" style="paint-order:stroke fill">
      <tspan>${build(top, d.h * 0.12)}</tspan>
    </text>
    <text font-family="Impact, Arial Black, sans-serif" font-size="${Math.round(
      d.w * 0.09
    )}" fill="#fff" text-anchor="middle" stroke="#000" stroke-width="6" style="paint-order:stroke fill">
      <tspan>${build(bottom, d.h * 0.82)}</tspan>
    </text>
  </svg>`;
}

// ---- the nine modules -----------------------------------------------------

// Slideshow — matches slideshow-generator / slideshow-creator / tslides.
// hook slide -> excerpt/quote slides -> cover. 9:16 TikTok photo carousel.
const slideshow: BookModule = {
  key: "slideshow",
  title: "Slideshow",
  sourceApp: "slideshow-generator · tslides",
  render(book): ModuleOutput {
    const seed = book.title;
    const hook = book.tropes[0]
      ? `you're not ready for the ${book.tropes[0]} in this one`
      : `this book broke me`;
    const slides: Slide[] = [
      { label: "Hook", svg: textSlide({ text: hook, seed, kicker: book.tropes[0], position: "middle" }) },
      ...pick(book.quotes, 4).map((q, i) => ({
        label: `Excerpt ${i + 1}`,
        svg: textSlide({ text: `"${q}"`, seed: seed + i, fontSize: 82, position: "middle" }),
      })),
      { label: "Cover", svg: coverSlide(book.title, book.author, seed) },
    ];
    return {
      moduleKey: "slideshow", title: "Slideshow", sourceApp: slideshow.sourceApp,
      kind: "image-set", aspect: "9:16", slides, implemented: true,
      caption: caption(book, `${book.title} by ${book.author} 🖤`),
    };
  },
};

// Meme — matches meme-maker.
const meme: BookModule = {
  key: "meme",
  title: "Meme",
  sourceApp: "meme-maker",
  render(book): ModuleOutput {
    const trope = book.tropes[0] ?? "slow burn";
    return {
      moduleKey: "meme", title: "Meme", sourceApp: "meme-maker",
      kind: "image-set", aspect: "1:1", implemented: true,
      slides: [{ label: "Meme", svg: memePanel(book, `me: i'll read one chapter`, `also me at 3am finishing ${book.title}`) },
               { label: "Meme 2", svg: memePanel(book, `no one:`, `${trope} girlies rereading this again`) }],
      caption: caption(book, `if you know, you know 💀 ${book.title}`),
    };
  },
};

// Top-N list — matches slideshow-generator's Top-N BookTok generator.
const topn: BookModule = {
  key: "topn",
  title: "Top-N List",
  sourceApp: "slideshow-generator (Top-N)",
  render(book): ModuleOutput {
    const seed = book.title;
    const slides: Slide[] = [
      { label: "Title", svg: textSlide({ text: `${book.tropes[0] ?? "dark romance"} books that live in my head`, seed, kicker: "read these", position: "middle" }) },
      { label: "#1", svg: textSlide({ text: `#1 — ${book.title}`, seed: seed + "1", fontSize: 78, position: "bottom", kicker: book.author }) },
    ];
    return {
      moduleKey: "topn", title: "Top-N List", sourceApp: topn.sourceApp,
      kind: "image-set", aspect: "9:16", slides, implemented: true,
      caption: caption(book, `saving these all 📚`),
      note: "seeds the list from one book; multi-book ranking pulls from the library",
    };
  },
};

// Quadrant carousel — matches quadrants.
const quadrant: BookModule = {
  key: "quadrant",
  title: "Quadrant Carousel",
  sourceApp: "quadrants",
  render(book): ModuleOutput {
    const d = ASPECTS["1:1"];
    const cells = pick(book.tropes.length ? book.tropes : ["slow burn", "one bed", "found family", "grumpy x sunshine"], 4);
    const labels = ["", "", "", ""].map((_, i) => cells[i] ?? "—");
    const quad = `<svg xmlns="http://www.w3.org/2000/svg" width="${d.w}" height="${d.h}" viewBox="0 0 ${d.w} ${d.h}">
      <rect width="${d.w}" height="${d.h}" fill="hsl(280,30%,10%)"/>
      ${[0, 1, 2, 3]
        .map((i) => {
          const x = (i % 2) * (d.w / 2);
          const y = Math.floor(i / 2) * (d.h / 2);
          return `<g><rect x="${x + 8}" y="${y + 8}" width="${d.w / 2 - 16}" height="${d.h / 2 - 16}" rx="12" fill="hsl(${(i * 60 + 300) % 360},35%,18%)"/>
            <text x="${x + d.w / 4}" y="${y + d.h / 4}" fill="#fff" font-family="Arial" font-weight="800" font-size="46" text-anchor="middle">${labels[i]
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")}</text></g>`;
        })
        .join("")}
    </svg>`;
    return {
      moduleKey: "quadrant", title: "Quadrant Carousel", sourceApp: "quadrants",
      kind: "image-set", aspect: "1:1", implemented: true,
      slides: [{ label: "Quadrants", svg: quad }],
      caption: caption(book, `the ${book.title} starter pack ✨`),
    };
  },
};

// Pinterest pin — matches pinfactory. 2:3 branded pin.
const pin: BookModule = {
  key: "pin",
  title: "Pinterest Pin",
  sourceApp: "pinfactory",
  render(book): ModuleOutput {
    return {
      moduleKey: "pin", title: "Pinterest Pin", sourceApp: "pinfactory",
      kind: "image-set", aspect: "2:3", implemented: true,
      slides: [{ label: "Pin", svg: textSlide({ text: book.blurb ? book.blurb : `if you love ${book.tropes[0] ?? "dark romance"}, read this`, seed: book.title, aspect: "2:3", maxChars: 22, fontSize: 70, position: "bottom", kicker: book.title }) }],
      caption: caption(book, `${book.title} — your next obsession`),
    };
  },
};

// Social card — matches book-social-media (branded quote/trivia cards).
const socialCard: BookModule = {
  key: "social-card",
  title: "Social Card",
  sourceApp: "book-social-media",
  render(book): ModuleOutput {
    const q = book.quotes[0] ?? book.blurb ?? book.title;
    return {
      moduleKey: "social-card", title: "Social Card", sourceApp: "book-social-media",
      kind: "image-set", aspect: "1:1", implemented: true,
      slides: [{ label: "Quote card", svg: textSlide({ text: `"${q}"`, seed: book.title, aspect: "1:1", maxChars: 24, fontSize: 64, position: "middle", kicker: book.author }) }],
      caption: caption(book, `${book.title} by ${book.author}`),
    };
  },
};

// ---- video modules (storyboard now; ffmpeg assembly is the next increment) --

function storyboard(book: Book, key: string, title: string, sourceApp: string, note: string): ModuleOutput {
  const seed = book.title + key;
  const frames: Slide[] = [
    { label: "Frame 1 (0s)", svg: textSlide({ text: book.quotes[0] ?? book.title, seed: seed + "a", position: "middle" }) },
    { label: "Frame 2 (2s)", svg: textSlide({ text: book.quotes[1] ?? (book.tropes[0] ?? "read this"), seed: seed + "b", position: "middle" }) },
    { label: "Frame 3 (4s)", svg: coverSlide(book.title, book.author, seed) },
  ];
  return {
    moduleKey: key, title, sourceApp, kind: "video-storyboard", aspect: "9:16",
    slides: frames, implemented: false,
    caption: caption(book, `${book.title} 🎬`),
    note,
  };
}

const booktokVideo: BookModule = {
  key: "booktok-video", title: "BookTok Video", sourceApp: "bookshelf · book-video-bot",
  render: (b) => storyboard(b, "booktok-video", "BookTok Video", "bookshelf · book-video-bot",
    "storyboard preview — kinetic captions + ffmpeg assembly is the next increment"),
};
const quoteVideo: BookModule = {
  key: "quote-video", title: "Quote Video", sourceApp: "aesthetic",
  render: (b) => storyboard(b, "quote-video", "Quote Video", "aesthetic",
    "storyboard preview — sepia grade + beat-synced cuts is the next increment"),
};
const reel: BookModule = {
  key: "reel", title: "Reel", sourceApp: "trialreels",
  render: (b) => storyboard(b, "reel", "Reel", "trialreels",
    "storyboard preview — hook + b-roll assembly is the next increment"),
};

export const MODULES: BookModule[] = [
  slideshow, booktokVideo, quoteVideo, meme, topn, quadrant, pin, socialCard, reel,
];

export function renderAll(book: Book): ModuleOutput[] {
  return MODULES.map((m) => m.render(book));
}

export function renderOne(book: Book, key: string): ModuleOutput | null {
  const m = MODULES.find((x) => x.key === key);
  return m ? m.render(book) : null;
}
