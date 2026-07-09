import crypto from 'node:crypto';

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function hash(obj) {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escape a string for safe embedding inside a JSON-LD <script> block.
// JSON.stringify handles quoting; we additionally neutralize "</script" and
// HTML-comment/`<!--` sequences per the JSON-LD security guidance.
export function jsonLdSafe(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export function wordCount(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function titleCase(s) {
  return String(s).replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1));
}

// Deterministic pseudo-random pick seeded by a string — used to vary page
// structure/phrasing without Math.random (keeps builds reproducible).
export function seededPick(seed, arr) {
  if (!arr.length) return undefined;
  const h = crypto.createHash('md5').update(String(seed)).digest();
  return arr[h[0] % arr.length];
}

export function seededShuffle(seed, arr) {
  const a = arr.slice();
  const h = crypto.createHash('sha256').update(String(seed)).digest();
  for (let i = a.length - 1; i > 0; i--) {
    const j = h[i % h.length] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
