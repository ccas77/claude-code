// The book is the single source of truth. Every module takes the SAME book and
// produces a different output type — this is the "enter a book once, get many
// outputs" spine. Modules match the functionality of the standalone book apps.

export interface Book {
  title: string;
  author: string;
  coverUrl?: string; // optional; DRY_RUN renders a placeholder cover
  blurb?: string;
  quotes: string[]; // shareable lines pulled from the book
  tropes: string[]; // e.g. "enemies to lovers", "one bed", "mafia romance"
  hashtags: string[];
  audioName?: string; // a track from the book's audio bank (video modules)
  vibe?: string; // short style hint, e.g. "dark romance, moody"
}

// A single rendered visual (SVG markup for now; a PNG/JPEG data URL once real
// image gen is wired). Kept as a string so the UI can show it with no deps.
export interface Slide {
  svg: string;
  label: string; // "Hook", "Excerpt 1", "Cover", ...
}

export type ModuleOutputKind = "image-set" | "video-storyboard" | "stub";

export interface ModuleOutput {
  moduleKey: string;
  title: string; // human name shown in the UI
  sourceApp: string; // which standalone app's functionality this matches
  kind: ModuleOutputKind;
  aspect: string; // "9:16", "1:1", "2:3", ...
  slides: Slide[]; // the visual output (storyboard frames for video)
  caption: string; // the post caption this output would ship with
  note?: string; // e.g. "storyboard only — ffmpeg assembly is the next step"
  implemented: boolean; // false = wired stub, not yet a real renderer
}

// Every output module implements this. `render` is the one method that matters
// for the fan-out; posting/scheduling hang off the same output later.
export interface BookModule {
  key: string;
  title: string;
  sourceApp: string;
  render(book: Book): ModuleOutput;
}

// Legacy generic handler kept for the posting/scheduling layer (M1) that already
// references it. New output modules use BookModule above.
export interface ModuleHandler<Selection = unknown, ContentItem = unknown, PostSpec = unknown> {
  key: string;
  selectContent(ctx: unknown): Promise<Selection>;
  generate(ctx: unknown, selection: Selection): Promise<ContentItem>;
  buildPost(item: ContentItem): Promise<PostSpec>;
}
