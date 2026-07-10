// Direct catalog import from CSV — the bridge that lets you populate tropesite
// with your real books TODAY, without waiting on pinfactory. When pinfactory is
// finished it can either write this same schema directly, or export CSVs that
// this importer consumes. No external dependencies: tiny built-in CSV parser.
import fs from 'node:fs';
import { db, initSchema, get, run } from './db.mjs';
import { slugify } from './util.mjs';

// --- Minimal RFC-4180-ish CSV parser (handles quotes, commas, newlines) ------
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  // Drop trailing empty rows
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function toObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
    return o;
  });
}

const splitTropes = (s) => String(s || '').split(/[;|]/).map((x) => x.trim()).filter(Boolean);

// --- Upsert helpers ----------------------------------------------------------
function ensurePenName(name) {
  if (!name) throw new Error('book row missing pen_name');
  const row = get('SELECT id FROM pen_names WHERE name=?', name);
  if (row) return row.id;
  return Number(run('INSERT INTO pen_names(name,is_mine) VALUES(?,1)', name).lastInsertRowid);
}
function ensureSubgenre(name) {
  if (!name) return null;
  const row = get('SELECT id FROM subgenres WHERE name=?', name);
  if (row) return row.id;
  return Number(run('INSERT INTO subgenres(name,slug) VALUES(?,?)', name, slugify(name)).lastInsertRowid);
}
function ensureTrope(name) {
  const row = get('SELECT id FROM tropes WHERE name=? OR slug=?', name, slugify(name));
  if (row) return row.id;
  return Number(run('INSERT INTO tropes(name,slug) VALUES(?,?)', name, slugify(name)).lastInsertRowid);
}

function importBooks(objs) {
  let n = 0;
  for (const o of objs) {
    if (!o.title) { console.warn('  ! skipping book row with no title'); continue; }
    const penId = ensurePenName(o.pen_name);
    const subId = ensureSubgenre(o.subgenre);
    const existing = get('SELECT id FROM books WHERE title=? AND pen_name_id=?', o.title, penId);
    const fields = [
      o.title, penId, subId, o.series || null, o.series_index ? Number(o.series_index) : null,
      o.blurb || null, o.heat_level || null, o.content_notes || null,
      o.asin || null, o.retailer_url || null, o.asin || null,
      o.published_year ? Number(o.published_year) : null,
    ];
    let bookId;
    if (existing) {
      run(`UPDATE books SET pen_name_id=?,subgenre_id=?,series=?,series_index=?,blurb=?,heat_level=?,
           content_notes=?,asin=?,retailer_url=?,cover_asin=?,published_year=?,updated_at=datetime('now') WHERE id=?`,
        penId, subId, fields[3], fields[4], fields[5], fields[6], fields[7], fields[8], fields[9], fields[10], fields[11], existing.id);
      bookId = existing.id;
    } else {
      bookId = Number(run(`INSERT INTO books(title,pen_name_id,subgenre_id,series,series_index,blurb,heat_level,
           content_notes,asin,retailer_url,cover_asin,published_year,is_mine)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1)`, ...fields).lastInsertRowid);
    }
    run('DELETE FROM book_tropes WHERE book_id=?', bookId);
    for (const t of splitTropes(o.tropes)) run('INSERT OR IGNORE INTO book_tropes(book_id,trope_id) VALUES(?,?)', bookId, ensureTrope(t));
    n++;
  }
  return n;
}

function importComps(objs) {
  let n = 0;
  for (const o of objs) {
    if (!o.title || !o.author) { console.warn('  ! skipping comp row missing title/author'); continue; }
    const status = (o.status || 'proposed').toLowerCase();
    if (status === 'approved' && !o.factual_description) {
      console.warn(`  ! comp "${o.title}" marked approved but has no factual_description — importing as 'proposed' instead.`);
    }
    const finalStatus = (status === 'approved' && !o.factual_description) ? 'proposed' : status;
    const existing = get('SELECT id FROM comps WHERE title=? AND author=?', o.title, o.author);
    let compId;
    if (existing) {
      run(`UPDATE comps SET asin=?,retailer_url=?,factual_description=?,status=?,
           approved_at=CASE WHEN ?='approved' THEN COALESCE(approved_at,date('now')) ELSE approved_at END WHERE id=?`,
        o.asin || null, o.retailer_url || null, o.factual_description || null, finalStatus, finalStatus, existing.id);
      compId = existing.id;
    } else {
      compId = Number(run(`INSERT INTO comps(title,author,asin,retailer_url,factual_description,status,approved_at)
           VALUES(?,?,?,?,?,?,?)`,
        o.title, o.author, o.asin || null, o.retailer_url || null, o.factual_description || null, finalStatus,
        finalStatus === 'approved' ? '' : null).lastInsertRowid);
      if (finalStatus === 'approved') run(`UPDATE comps SET approved_at=date('now') WHERE id=?`, compId);
    }
    run('DELETE FROM comp_tropes WHERE comp_id=?', compId);
    for (const t of splitTropes(o.tropes)) run('INSERT OR IGNORE INTO comp_tropes(comp_id,trope_id) VALUES(?,?)', compId, ensureTrope(t));
    n++;
  }
  return n;
}

export function importCatalog({ booksCsv, compsCsv, replace = false } = {}) {
  initSchema();
  if (replace) {
    console.log('--replace: clearing existing books and comps first.');
    for (const t of ['page_entries', 'pages', 'book_tropes', 'books', 'comp_tropes', 'comps']) db().exec(`DELETE FROM ${t};`);
  }
  let books = 0, comps = 0;
  if (booksCsv) {
    if (!fs.existsSync(booksCsv)) throw new Error(`books CSV not found: ${booksCsv}`);
    books = importBooks(toObjects(fs.readFileSync(booksCsv, 'utf8')));
    console.log(`Imported ${books} book(s) from ${booksCsv}`);
  }
  if (compsCsv) {
    if (!fs.existsSync(compsCsv)) throw new Error(`comps CSV not found: ${compsCsv}`);
    comps = importComps(toObjects(fs.readFileSync(compsCsv, 'utf8')));
    console.log(`Imported ${comps} comp(s) from ${compsCsv}`);
  }
  if (!booksCsv && !compsCsv) {
    console.log('Nothing to import. Pass --books books.csv and/or --comps comps.csv.');
    console.log('Templates: tropesite/templates/books.csv and templates/comps.csv');
    return { books: 0, comps: 0 };
  }
  console.log(`\nNext: tropesite plan   →   tropesite generate   →   tropesite build`);
  return { books, comps };
}
