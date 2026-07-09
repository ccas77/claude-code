// Generation orchestrator. Turns the plan into stored pages with drafted
// content. Supports incremental (--changed) and pilot (10 pages / 2 tropes).
import { get, run } from './db.mjs';
import { config } from './config.mjs';
import { hash, today } from './util.mjs';
import { ContentEngine } from './content-engine.mjs';
import {
  getTrope, getSubgenre, getComp, getBook,
  myBooksForTrope, approvedCompsForTrope, myBooksLikeComp,
} from './catalog.mjs';
import { planTropeHubs, planBooksLike, planBookPages, SUPPORT_PAGES } from './plan.mjs';

// Digest of the source data feeding a page. If unchanged, --changed skips it.
function hubHash(trope, subgenre, entries) {
  return hash({
    t: [trope.name, trope.description],
    s: subgenre ? [subgenre.name, subgenre.description] : null,
    e: entries.map(entryDigest),
  });
}
function entryDigest(e) {
  return e.type === 'book'
    ? ['b', e.title, e.pen_name, e.subgenre, e.heat_level, e.content_notes, e.blurb, (e.tropes || []).map((t) => t.name)]
    : ['c', e.title, e.author, e.factual_description, (e.tropes || []).map((t) => t.name)];
}
function bookHash(b) {
  return hash(['book', b.title, b.pen_name, b.subgenre, b.heat_level, b.content_notes, b.blurb, (b.tropes || []).map((t) => t.name)]);
}

function upsertPage(fields, entries) {
  const existing = get('SELECT id, source_hash, content_date FROM pages WHERE slug=?', fields.slug);
  const changed = !existing || existing.source_hash !== fields.source_hash;
  const contentDate = changed ? today() : existing.content_date;

  if (existing) {
    run(
      `UPDATE pages SET kind=?,title=?,h1=?,trope_id=?,subgenre_id=?,comp_id=?,book_id=?,
        content_json=?,source_hash=?,content_date=?,updated_at=datetime('now') WHERE id=?`,
      fields.kind, fields.title, fields.h1, fields.trope_id ?? null, fields.subgenre_id ?? null,
      fields.comp_id ?? null, fields.book_id ?? null, fields.content_json, fields.source_hash,
      contentDate, existing.id
    );
    var pageId = existing.id;
  } else {
    const res = run(
      `INSERT INTO pages(kind,slug,title,h1,trope_id,subgenre_id,comp_id,book_id,content_json,source_hash,content_date,status)
       VALUES(?,?,?,?,?,?,?,?,?,?,?, 'draft')`,
      fields.kind, fields.slug, fields.title, fields.h1, fields.trope_id ?? null, fields.subgenre_id ?? null,
      fields.comp_id ?? null, fields.book_id ?? null, fields.content_json, fields.source_hash, contentDate
    );
    var pageId = Number(res.lastInsertRowid);
  }

  run('DELETE FROM page_entries WHERE page_id=?', pageId);
  entries.forEach((e, i) => {
    run('INSERT INTO page_entries(page_id,position,book_id,comp_id) VALUES(?,?,?,?)',
      pageId, i, e.type === 'book' ? e.id : null, e.type === 'comp' ? e.id : null);
  });
  return { pageId, changed };
}

async function genTropeHub(p, engine, onlyChanged) {
  const trope = getTrope(p.trope_id);
  const subgenre = p.subgenre_id ? getSubgenre(p.subgenre_id) : null;
  const mine = myBooksForTrope(p.trope_id, p.subgenre_id);
  const comps = approvedCompsForTrope(p.trope_id);
  const entries = [...mine, ...comps];
  const source_hash = hubHash(trope, subgenre, entries);

  const existing = get('SELECT source_hash FROM pages WHERE slug=?', p.slug);
  if (onlyChanged && existing && existing.source_hash === source_hash) return { slug: p.slug, skipped: true };

  const content = await engine.draftTropeHub({ trope, subgenre, entries, seed: p.slug });
  upsertPage({ ...p, source_hash, content_json: JSON.stringify(content) }, entries);
  return { slug: p.slug, skipped: false, entries: entries.length };
}

async function genBooksLike(p, engine, onlyChanged) {
  const comp = getComp(p.comp_id);
  const entries = myBooksLikeComp(p.comp_id).slice(0, 10);
  const source_hash = hash(['bl', comp.title, comp.author, comp.factual_description, comp.tropes.map((t) => t.name), entries.map(entryDigest)]);

  const existing = get('SELECT source_hash FROM pages WHERE slug=?', p.slug);
  if (onlyChanged && existing && existing.source_hash === source_hash) return { slug: p.slug, skipped: true };

  const content = await engine.draftBooksLike({ comp, entries, seed: p.slug });
  upsertPage({ ...p, source_hash, content_json: JSON.stringify(content) }, entries);
  return { slug: p.slug, skipped: false, entries: entries.length };
}

async function genBookPage(p, engine, onlyChanged) {
  const book = getBook(p.book_id);
  const source_hash = bookHash(book);
  const existing = get('SELECT source_hash FROM pages WHERE slug=?', p.slug);
  if (onlyChanged && existing && existing.source_hash === source_hash) return { slug: p.slug, skipped: true };

  const content = await engine.draftBook({ book, seed: p.slug });
  upsertPage({ ...p, source_hash, content_json: JSON.stringify(content) }, []);
  return { slug: p.slug, skipped: false };
}

function genSupport(p) {
  // Support pages are static; store a marker row so build/audit see them.
  const source_hash = hash(['support', p.slug, config.site.brand]);
  upsertPage({ ...p, trope_id: null, source_hash, content_json: JSON.stringify({ support: true }) }, []);
  return { slug: p.slug, skipped: false };
}

// Select the 2 tropes with the most total inventory for the pilot, and gather
// up to `limit` pages: their hubs + related books-like + a few book pages.
function pilotPages(limit = 10) {
  const hubs = planTropeHubs();
  // rank tropes by best hub total
  const bestByTrope = new Map();
  for (const h of hubs) {
    const cur = bestByTrope.get(h.trope_id);
    if (!cur || h.counts.total > cur.counts.total) bestByTrope.set(h.trope_id, h);
  }
  const topTropes = [...bestByTrope.values()].sort((a, b) => b.counts.total - a.counts.total).slice(0, 2);
  const tropeIds = new Set(topTropes.map((h) => h.trope_id));

  const chosen = [];
  // hub pages for the 2 tropes (prefer the subgenre-scoped strongest one + trope-only)
  for (const h of hubs) if (tropeIds.has(h.trope_id)) chosen.push(h);

  const booksLike = planBooksLike().filter((p) => {
    const comp = getComp(p.comp_id);
    return comp.tropes.some((t) => tropeIds.has(t.id));
  });
  const bookPages = planBookPages().filter((p) => {
    const b = getBook(p.book_id);
    return b.tropes.some((t) => tropeIds.has(t.id));
  });

  const ordered = [...chosen, ...booksLike, ...bookPages].slice(0, limit);
  return { pages: ordered, tropes: topTropes.map((h) => getTrope(h.trope_id).name) };
}

export async function generate({ changed = false, pilot = false, limit = 10, noImages = false } = {}) {
  const engine = new ContentEngine({ forceFallback: false });
  const mode = engine.available() ? `LLM (${engine.model})` : 'deterministic fallback (no ANTHROPIC_API_KEY)';
  console.log(`\nGenerating pages — content mode: ${mode}${changed ? ', --changed' : ''}${pilot ? ', --pilot' : ''}`);

  let targets;
  if (pilot) {
    const pp = pilotPages(limit);
    targets = pp.pages;
    console.log(`Pilot tropes: ${pp.tropes.join(' + ')} — ${targets.length} pages\n`);
  } else {
    targets = [...planTropeHubs(), ...planBooksLike(), ...planBookPages(), ...SUPPORT_PAGES];
  }

  let made = 0, skipped = 0;
  for (const p of targets) {
    let r;
    if (p.kind === 'trope_hub') r = await genTropeHub(p, engine, changed);
    else if (p.kind === 'books_like') r = await genBooksLike(p, engine, changed);
    else if (p.kind === 'book') r = await genBookPage(p, engine, changed);
    else if (p.kind === 'support') r = genSupport(p);
    if (r.skipped) { skipped++; process.stdout.write('·'); }
    else { made++; process.stdout.write('✓'); }
  }
  // Always ensure support pages exist (even in pilot) so the built site is valid.
  if (pilot) for (const p of SUPPORT_PAGES) genSupport(p);

  console.log(`\n\nGenerated/updated ${made} page(s), skipped ${skipped} unchanged.`);
  console.log(`Next: tropesite review   (preview locally)   then   tropesite build`);
  return { made, skipped };
}
