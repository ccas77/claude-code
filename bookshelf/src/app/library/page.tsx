import Link from 'next/link';
import { eq, count } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getOwnerId } from '@/lib/owner';

export const dynamic = 'force-dynamic';

async function counts() {
  const ownerId = await getOwnerId();
  const [genres, books, music, automation] = await Promise.all([
    db.select({ n: count() }).from(schema.genres).where(eq(schema.genres.ownerId, ownerId)),
    db.select({ n: count() }).from(schema.books).where(eq(schema.books.ownerId, ownerId)),
    db
      .select({ n: count() })
      .from(schema.musicClips)
      .where(eq(schema.musicClips.ownerId, ownerId)),
    db
      .select({ n: count() })
      .from(schema.automationConfigs)
      .where(eq(schema.automationConfigs.ownerId, ownerId)),
  ]);
  return {
    genres: genres[0].n,
    books: books[0].n,
    music: music[0].n,
    automation: automation[0].n,
  };
}

const steps = [
  {
    n: 1,
    href: '/library/genres',
    title: 'Set a vibe (a "genre")',
    blurb: `A genre is just a look. Upload a few photos that match the mood you want your videos to have - think Pinterest board. The app studies them and uses them as a reference every time it makes a video.`,
    cta: 'Open Genres',
    countKey: 'genres' as const,
    countLabel: 'so far',
  },
  {
    n: 2,
    href: '/library/books',
    title: 'Add a book',
    blurb: `Add the books you want to make videos about. Upload at least one photo of the cover. You can also paste in the blurb, a few reviews you love, the tropes, and any vibe notes - the app uses all of that to write captions later. Pick the genre you set up in step 1.`,
    cta: 'Open Books',
    countKey: 'books' as const,
    countLabel: 'added',
  },
  {
    n: 3,
    href: '/library/music',
    title: 'Upload some music',
    blurb: `Upload audio clips - trending sounds, voiceovers, whatever you'd post over a book video. The app listens to them once and writes out the words automatically (those become the on-screen captions). Pick "Any genre" for clips that work over anything, or tick specific genres to limit where they're used.`,
    cta: 'Open Music',
    countKey: 'music' as const,
    countLabel: 'uploaded',
  },
  {
    n: 4,
    href: '/library/renders',
    title: 'Make a video',
    blurb: `Click "Test render", pick a book and a music clip, and the app builds the video: AI image of the book in the right vibe, your music on top, captions burned in sync with the words. Takes about a minute.`,
    cta: 'Open Renders',
    countKey: null,
    countLabel: '',
  },
  {
    n: 5,
    href: '/library/renders',
    title: 'Publish or schedule it',
    blurb: `On the video's page you get a caption written for you (you can rewrite it or hit Regenerate for a fresh take), an account picker, and a "Post now" or "Schedule for later" toggle. Pick an account and hit Publish. Friends, you'll only see the accounts Cordelia has assigned to you.`,
    cta: 'Go to Renders',
    countKey: null,
    countLabel: '',
  },
  {
    n: 6,
    href: '/library/automation',
    title: 'Let it run on its own',
    blurb: `If you want the app to keep posting without you, set up automation. Pick an account, choose the time windows you want to post in (London time), tick the books and music clips it can use, and switch it on. The app will pick a book, pick a clip, build the video, and post it on a schedule.`,
    cta: 'Open Automation',
    countKey: 'automation' as const,
    countLabel: 'set up',
  },
];

export default async function LibraryHome() {
  const c = await counts();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to Bookshelf
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          A walkthrough for getting your first book video posted. Each step links
          to the page where you do it. If anything's confusing, every page has
          its own "How this page works" tucked at the top.
        </p>
      </div>

      <ol className="space-y-4">
        {steps.map((s) => {
          const cnt = s.countKey ? c[s.countKey] : null;
          return (
            <li
              key={s.n}
              className="rounded-lg border border-stone-200 bg-white p-5"
            >
              <div className="flex items-baseline gap-3">
                <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
                  Step {s.n}
                </span>
                <h2 className="text-base font-semibold">{s.title}</h2>
                {cnt !== null && (
                  <span className="ml-auto text-xs text-stone-500">
                    {cnt} {s.countLabel}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-stone-700">
                {s.blurb}
              </p>
              <Link
                href={s.href}
                className="mt-3 inline-block rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800"
              >
                {s.cta}
              </Link>
            </li>
          );
        })}
      </ol>

      <div className="rounded-lg border border-stone-200 bg-stone-100 p-4 text-sm text-stone-700">
        <p className="font-medium">A few things worth knowing</p>
        <ul className="mt-2 list-disc pl-5 space-y-1 leading-relaxed">
          <li>
            All times you see in the app are London time. Posting windows you
            set are London time too.
          </li>
          <li>
            Your library (books, music, genres) is yours alone. Friends can't
            see what you've added and you can't see theirs.
          </li>
          <li>
            History shows posts that have actually gone live. Videos you've
            tested but not posted live in Renders.
          </li>
        </ul>
      </div>
    </div>
  );
}
