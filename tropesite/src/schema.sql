-- tropesite catalog schema
-- Designed to match the shape described for the existing `pinfactory` app
-- (books, pen names, subgenres, trope tags, destination URLs) and EXTEND it
-- with the fields tropesite needs (heat level, content notes, comp titles,
-- generated pages). When the real pinfactory.db is available, map its tables
-- onto these or point TROPESITE_DB at it and add the extension tables only.
--
-- All prices, star ratings and review counts are intentionally ABSENT: Amazon
-- Associates policy forbids displaying static/stale prices & ratings. Prices,
-- if ever shown, must come live from PA-API at build time (see SETUP.md).

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Pen names (the author personas). is_mine = 1 for the 8 real pen names.
-- The public site never bylines these; they appear as recommended authors.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pen_names (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  is_mine     INTEGER NOT NULL DEFAULT 1,   -- 1 = my pen name, 0 = external (unused for comps; comps carry their own author string)
  bio         TEXT,                          -- short factual bio, optional
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Subgenres (e.g. "Dark Romance", "Paranormal Romance").
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subgenres (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT                            -- factual, one-paragraph description of the subgenre
);

-- ---------------------------------------------------------------------------
-- Tropes (e.g. "Enemies to Lovers", "Grumpy/Sunshine").
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tropes (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT                            -- factual definition of the trope (feeds page copy; never fabricated per book)
);

-- ---------------------------------------------------------------------------
-- Books: MY titles only. Comp titles live in `comps`.
-- retailer_url / asin are the outbound destination(s). Prices never stored.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS books (
  id            INTEGER PRIMARY KEY,
  title         TEXT NOT NULL,
  pen_name_id   INTEGER NOT NULL REFERENCES pen_names(id),
  subgenre_id   INTEGER REFERENCES subgenres(id),
  series        TEXT,
  series_index  INTEGER,
  blurb         TEXT,                          -- MY real back-cover blurb (imported during setup)
  heat_level    TEXT,                          -- e.g. "Sweet", "Steamy", "Explicit" (from my metadata)
  content_notes TEXT,                          -- content warnings / notes from my metadata
  asin          TEXT,                          -- Amazon ASIN (destination); may be null pre-launch
  retailer_url  TEXT,                          -- canonical destination URL if not an Amazon ASIN
  cover_asin    TEXT,                          -- ASIN used to fetch a compliant PA-API cover image
  published_year INTEGER,
  is_mine       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS book_tropes (
  book_id  INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  trope_id INTEGER NOT NULL REFERENCES tropes(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, trope_id)
);

-- ---------------------------------------------------------------------------
-- Comp titles: OTHER authors' well-known books, blended into recommendation
-- lists. Every comp is intake-reviewed: `status` starts 'proposed', becomes
-- 'approved' or 'rejected' only by explicit human action. `factual_description`
-- is the ONLY prose the site may use for a comp, and it is human-confirmed.
-- No cover images are stored/hotlinked; covers (if any) come via PA-API by asin.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comps (
  id                  INTEGER PRIMARY KEY,
  title               TEXT NOT NULL,
  author              TEXT NOT NULL,
  asin                TEXT,                    -- for compliant Amazon link + PA-API cover
  retailer_url        TEXT,
  factual_description TEXT,                    -- human-approved factual sentence(s); the ONLY comp prose allowed
  status              TEXT NOT NULL DEFAULT 'proposed'  -- 'proposed' | 'approved' | 'rejected'
                        CHECK (status IN ('proposed','approved','rejected')),
  proposed_reason     TEXT,                    -- why the engine proposed this comp (for the review UI)
  approved_at         TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (title, author)
);

CREATE TABLE IF NOT EXISTS comp_tropes (
  comp_id  INTEGER NOT NULL REFERENCES comps(id) ON DELETE CASCADE,
  trope_id INTEGER NOT NULL REFERENCES tropes(id) ON DELETE CASCADE,
  PRIMARY KEY (comp_id, trope_id)
);

-- ---------------------------------------------------------------------------
-- Generated pages. content_json holds the drafted copy (summary, per-entry
-- writeups, faqs). source_hash is a digest of the underlying catalog data that
-- feeds the page; `generate --changed` skips pages whose hash is unchanged.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pages (
  id            INTEGER PRIMARY KEY,
  kind          TEXT NOT NULL                  -- 'trope_hub' | 'books_like' | 'book' | 'support'
                  CHECK (kind IN ('trope_hub','books_like','book','support')),
  slug          TEXT NOT NULL UNIQUE,          -- URL path, e.g. "best-enemies-to-lovers-dark-romance-books"
  title         TEXT NOT NULL,                 -- <title>
  h1            TEXT NOT NULL,                 -- reader-query phrased H1
  trope_id      INTEGER REFERENCES tropes(id),
  subgenre_id   INTEGER REFERENCES subgenres(id),
  comp_id       INTEGER REFERENCES comps(id),  -- for books_like pages
  book_id       INTEGER REFERENCES books(id),  -- for individual book pages
  content_json  TEXT,                          -- drafted content (JSON): {summary, entries[], faqs[], intro, updated}
  source_hash   TEXT,                          -- digest of source data feeding this page
  status        TEXT NOT NULL DEFAULT 'draft'  -- 'draft' | 'approved'
                  CHECK (status IN ('draft','approved')),
  content_date  TEXT,                          -- last date CONTENT actually changed (honest "last updated")
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ordered membership of books/comps on a list page (drives internal links too).
CREATE TABLE IF NOT EXISTS page_entries (
  page_id   INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  book_id   INTEGER REFERENCES books(id) ON DELETE CASCADE,
  comp_id   INTEGER REFERENCES comps(id) ON DELETE CASCADE,
  PRIMARY KEY (page_id, position)
);

-- Simple key/value for build metadata (e.g. last build time, catalog fingerprint).
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
