// Loads configuration from .env (no dependency — a tiny parser) and exposes
// typed config to the rest of the tool.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  const text = fs.readFileSync(file, 'utf8');
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

// .env values are a fallback; real process.env always wins.
const fileEnv = parseEnvFile(path.join(ROOT, '.env'));
function env(key, dflt = '') {
  return process.env[key] ?? fileEnv[key] ?? dflt;
}

export const config = {
  root: ROOT,
  dbPath: env('TROPESITE_DB', path.join(ROOT, 'data', 'catalog.db')),
  distDir: env('TROPESITE_DIST', path.join(ROOT, 'dist')),

  site: {
    url: (env('SITE_URL', 'https://example.com')).replace(/\/+$/, ''),
    brand: env('SITE_BRAND', 'Tropesite'),
    tagline: env('SITE_TAGLINE', 'Reader-first book recommendations by trope and vibe.'),
    // The public byline persona (NOT the pen names). Placeholder — see about page flag.
    persona: env('SITE_PERSONA', 'The Tropesite Editors'),
    twitter: env('SITE_TWITTER', ''), // e.g. @tropesite (for twitter:site)
    contactEmail: env('CONTACT_EMAIL', 'hello@example.com'),
  },

  amazon: {
    // Default Associates tracking ID and optional per-section IDs.
    // Amazon policy: every Amazon link must carry a valid tracking ID and be a
    // plainly-identifiable Amazon URL (no shorteners/cloaking).
    tags: {
      default: env('AMAZON_ASSOC_TAG', ''),
      trope: env('AMAZON_ASSOC_TAG_TROPE', ''),   // links on trope-hub pages
      bookslike: env('AMAZON_ASSOC_TAG_BOOKSLIKE', ''), // links on "books like X" pages
      book: env('AMAZON_ASSOC_TAG_BOOK', ''),     // links on individual book pages
    },
    // OneLink geo-routing: when true, inject Amazon's OneLink script so non-US
    // visitors are routed to their local marketplace and clicks still monetize.
    oneLink: env('AMAZON_ONELINK', 'true') === 'true',
    // Marketplace-specific subtags for OneLink (optional). Format: "UK:tag-21,CA:tag-20"
    oneLinkTags: env('AMAZON_ONELINK_TAGS', ''),
    marketplace: env('AMAZON_MARKETPLACE', 'www.amazon.com'),
  },

  anthropic: {
    apiKey: env('ANTHROPIC_API_KEY', ''),
    model: env('ANTHROPIC_MODEL', 'claude-sonnet-5'),
    baseUrl: env('ANTHROPIC_BASE_URL', 'https://api.anthropic.com'),
  },

  email: {
    // A generic POST endpoint (your form backend) AND/OR a hosted-form fallback URL.
    // Per Amazon policy, email content links ONLY to site pages, never to Amazon.
    formEndpoint: env('EMAIL_FORM_ENDPOINT', ''),
    hostedFormUrl: env('EMAIL_FORM_URL', ''),
    listName: env('EMAIL_LIST_NAME', 'the monthly romance list'),
  },

  // Minimum inventory to generate a trope-hub page.
  minBooksPerPage: Number(env('MIN_BOOKS_PER_PAGE', '6')),
};

// The exact, verified Amazon Associates disclosure (do not paraphrase).
// Verified July 2026 against Amazon Associates program policy.
export const AMAZON_DISCLOSURE = 'As an Amazon Associate I earn from qualifying purchases.';

export function assocTag(section) {
  const t = config.amazon.tags;
  return t[section] || t.default || '';
}
