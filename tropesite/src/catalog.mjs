// Data-access layer over the SQLite catalog.
import { all, get } from './db.mjs';

export const getTropes = () => all('SELECT * FROM tropes ORDER BY name');
export const getTrope = (id) => get('SELECT * FROM tropes WHERE id=?', id);
export const getTropeBySlug = (slug) => get('SELECT * FROM tropes WHERE slug=?', slug);

export const getSubgenres = () => all('SELECT * FROM subgenres ORDER BY name');
export const getSubgenre = (id) => get('SELECT * FROM subgenres WHERE id=?', id);

export const getPenName = (id) => get('SELECT * FROM pen_names WHERE id=?', id);

export function getBook(id) {
  const b = get('SELECT * FROM books WHERE id=?', id);
  if (!b) return null;
  b.pen_name = getPenName(b.pen_name_id)?.name || null;
  b.subgenre = b.subgenre_id ? getSubgenre(b.subgenre_id)?.name : null;
  b.tropes = tropesForBook(id);
  b.type = 'book';
  return b;
}

export const getBooks = () => all('SELECT * FROM books ORDER BY title').map((b) => getBook(b.id));

export function tropesForBook(bookId) {
  return all(
    `SELECT t.* FROM tropes t
     JOIN book_tropes bt ON bt.trope_id = t.id
     WHERE bt.book_id = ? ORDER BY t.name`, bookId
  );
}

export function getComp(id) {
  const c = get('SELECT * FROM comps WHERE id=?', id);
  if (!c) return null;
  c.tropes = all(
    `SELECT t.* FROM tropes t JOIN comp_tropes ct ON ct.trope_id=t.id
     WHERE ct.comp_id=? ORDER BY t.name`, id
  );
  c.type = 'comp';
  return c;
}

export const getComps = (status) =>
  (status
    ? all('SELECT * FROM comps WHERE status=? ORDER BY author,title', status)
    : all('SELECT * FROM comps ORDER BY author,title')
  ).map((c) => getComp(c.id));

// Books (mine) tagged with a trope, optionally constrained to a subgenre.
export function myBooksForTrope(tropeId, subgenreId = null) {
  const rows = subgenreId
    ? all(
        `SELECT b.id FROM books b
         JOIN book_tropes bt ON bt.book_id=b.id
         WHERE bt.trope_id=? AND b.subgenre_id=? ORDER BY b.title`,
        tropeId, subgenreId
      )
    : all(
        `SELECT b.id FROM books b
         JOIN book_tropes bt ON bt.book_id=b.id
         WHERE bt.trope_id=? ORDER BY b.title`,
        tropeId
      );
  return rows.map((r) => getBook(r.id));
}

// APPROVED comps tagged with a trope.
export function approvedCompsForTrope(tropeId) {
  const rows = all(
    `SELECT c.id FROM comps c
     JOIN comp_tropes ct ON ct.comp_id=c.id
     WHERE ct.trope_id=? AND c.status='approved' ORDER BY c.author,c.title`,
    tropeId
  );
  return rows.map((r) => getComp(r.id));
}

// My books that share >=1 trope with a given comp (used for "books like X").
export function myBooksLikeComp(compId) {
  const rows = all(
    `SELECT DISTINCT b.id FROM books b
     JOIN book_tropes bt ON bt.book_id=b.id
     JOIN comp_tropes ct ON ct.trope_id=bt.trope_id
     WHERE ct.comp_id=? ORDER BY b.title`,
    compId
  );
  return rows.map((r) => getBook(r.id));
}

export const getPages = (kind) =>
  kind ? all('SELECT * FROM pages WHERE kind=? ORDER BY slug', kind)
       : all('SELECT * FROM pages ORDER BY kind,slug');
export const getPageBySlug = (slug) => get('SELECT * FROM pages WHERE slug=?', slug);

// Trope pages a given book appears on (for back-links from book pages).
export function tropePagesForBook(bookId) {
  return all(
    `SELECT DISTINCT p.* FROM pages p
     JOIN page_entries pe ON pe.page_id=p.id
     WHERE pe.book_id=? AND p.kind IN ('trope_hub','books_like') ORDER BY p.title`,
    bookId
  );
}
