// HTML rendering. Produces complete, JS-free HTML documents: all content is in
// the initial markup so AI crawlers see everything without executing scripts.
import { config } from './config.mjs';
import { escapeHtml, jsonLdSafe, seededShuffle } from './util.mjs';
import { AMAZON_DISCLOSURE, outboundLink, oneLinkScript } from './amazon.mjs';
import {
  getBook, getComp, getTrope, getSubgenre, getPageBySlug, getPages,
  tropePagesForBook,
} from './catalog.mjs';
import { all } from './db.mjs';
import {
  itemListNode, faqNode, bookPageNodes, breadcrumb, websiteNode,
} from './jsonld.mjs';

const abs = (slug) => `${config.site.url}/${String(slug).replace(/^\/+/, '')}`;

// Section → Associates tracking bucket.
const SECTION = { trope_hub: 'trope', books_like: 'bookslike', book: 'book' };

// ---- Shared chrome ----------------------------------------------------------

function head({ title, description, canonical, ogType = 'website', jsonld = [], noindex = false }) {
  const t = `${title} — ${config.site.brand}`;
  const desc = escapeHtml((description || config.site.tagline).slice(0, 300));
  const parts = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(t)}</title>`,
    `<meta name="description" content="${desc}">`,
    noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow,max-image-preview:large">',
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    // OpenGraph (feeds Pinterest Rich Pins + social). No og:image unless a
    // compliant PA-API image URL is configured (see SETUP.md).
    `<meta property="og:site_name" content="${escapeHtml(config.site.brand)}">`,
    `<meta property="og:type" content="${ogType}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${desc}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    '<meta name="twitter:card" content="summary">',
    config.site.twitter ? `<meta name="twitter:site" content="${escapeHtml(config.site.twitter)}">` : '',
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${desc}">`,
    '<link rel="stylesheet" href="/styles.css">',
  ];
  for (const node of jsonld.filter(Boolean)) {
    parts.push(`<script type="application/ld+json">${jsonLdSafe(node)}</script>`);
  }
  return parts.filter(Boolean).join('\n');
}

function nav() {
  return `<header class="site-header"><a class="brand" href="/">${escapeHtml(config.site.brand)}</a>
  <nav><a href="/tropes/">Browse tropes</a> <a href="/about">About</a></nav></header>`;
}

function disclosureInline() {
  // Rendered on every page that carries affiliate links, immediately visible.
  return `<p class="affiliate-disclosure" role="note">${escapeHtml(AMAZON_DISCLOSURE)} <a href="/affiliate-disclosure">Learn more</a>.</p>`;
}

function footer() {
  const year = (config.buildDate || '').slice(0, 4) || '';
  return `<footer class="site-footer">
  <p class="affiliate-disclosure">${escapeHtml(AMAZON_DISCLOSURE)}</p>
  <nav><a href="/about">About</a> · <a href="/affiliate-disclosure">Affiliate disclosure</a> · <a href="/privacy">Privacy</a> · <a href="/contact">Contact</a> · <a href="/tropes/">All tropes</a></nav>
  <p class="fineprint">© ${escapeHtml(year)} ${escapeHtml(config.site.brand)}. Recommendations are editorial. ${escapeHtml(config.site.persona)}.</p>
  </footer>`;
}

function emailCapture() {
  // One unobtrusive, no-popup capture per page. Links ONLY to site content;
  // never contains Amazon/affiliate links (Associates policy).
  const list = escapeHtml(config.email.listName);
  if (config.email.formEndpoint) {
    return `<aside class="email-capture"><h2>Get the monthly list</h2>
    <p>One email a month: ${list}. No spam, unsubscribe anytime.</p>
    <form action="${escapeHtml(config.email.formEndpoint)}" method="post">
      <label>Email <input type="email" name="email" required placeholder="you@example.com"></label>
      <button type="submit">Subscribe</button>
    </form></aside>`;
  }
  if (config.email.hostedFormUrl) {
    return `<aside class="email-capture"><h2>Get the monthly list</h2>
    <p>One email a month: ${list}.</p>
    <p><a class="btn" href="${escapeHtml(config.email.hostedFormUrl)}">Sign up for the list →</a></p></aside>`;
  }
  return `<aside class="email-capture"><h2>Get the monthly list</h2>
  <p>Email sign-up will appear here once a form endpoint is configured (EMAIL_FORM_ENDPOINT or EMAIL_FORM_URL).</p></aside>`;
}

function doc(headHtml, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
${headHtml}
</head>
<body>
${nav()}
<main>
${bodyHtml}
</main>
${footer()}
${oneLinkScript()}
</body>
</html>
`;
}

function updatedLine(dateStr) {
  return dateStr ? `<p class="updated">Last updated: <time datetime="${escapeHtml(dateStr)}">${escapeHtml(dateStr)}</time></p>` : '';
}

function faqBlock(faqs) {
  if (!faqs || !faqs.length) return '';
  const items = faqs.map((f) => `<div class="faq-item"><h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p></div>`).join('\n');
  return `<section class="faq"><h2>Frequently asked questions</h2>\n${items}\n</section>`;
}

// 3–6 sibling trope-hub links for internal linking.
function siblingTropeLinks(currentSlug, seed) {
  const sibs = getPages('trope_hub').filter((p) => p.slug !== currentSlug);
  const picks = seededShuffle(seed || currentSlug, sibs).slice(0, 6);
  if (picks.length < 1) return '';
  const links = picks.map((p) => `<li><a href="/${escapeHtml(p.slug)}">${escapeHtml(p.title)}</a></li>`).join('');
  return `<nav class="related" aria-label="Related trope lists"><h2>More reading lists</h2><ul>${links}</ul></nav>`;
}

function entryRows(page) {
  return all(
    `SELECT position, book_id, comp_id FROM page_entries WHERE page_id=? ORDER BY position`, page.id
  ).map((r) => (r.book_id ? getBook(r.book_id) : getComp(r.comp_id)));
}

function anchorId(title) {
  return 'pick-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// One list entry: heading, writeup, retailer link (clearly labeled).
function renderEntry(item, writeup, section, position) {
  const link = outboundLink(item, section);
  const author = item.type === 'comp' ? item.author : item.pen_name;
  const meta = item.type === 'book'
    ? [item.subgenre, item.heat_level].filter(Boolean).join(' · ')
    : 'Comparable title';
  const isMineLink = item.type === 'book';
  const linkHtml = link
    ? `<p class="retailer"><a class="btn retailer-link" href="${escapeHtml(link.href)}" rel="${link.isAmazon ? 'sponsored nofollow noopener' : 'nofollow noopener'}" target="_blank">${escapeHtml(link.label)}</a></p>`
    : `<p class="retailer unavailable">Retailer link coming soon.</p>`;
  // Book pages (mine) also get an internal link to the dedicated book page.
  const internal = isMineLink
    ? `<p class="more"><a href="/${escapeHtml(bookSlug(item))}">More about ${escapeHtml(item.title)} →</a></p>`
    : '';
  return `<article class="pick" id="${anchorId(item.title)}">
  <h2><span class="rank">${position}.</span> ${escapeHtml(item.title)} <span class="by">by ${escapeHtml(author)}</span></h2>
  <p class="pick-meta">${escapeHtml(meta)}</p>
  <p class="writeup">${escapeHtml(writeup)}</p>
  ${internal}
  ${linkHtml}
</article>`;
}

function bookSlug(book) {
  const p = getPages('book').find((x) => x.book_id === book.id);
  return p ? p.slug : '';
}

// ---- Page renderers ---------------------------------------------------------

export function renderListPage(page) {
  const content = JSON.parse(page.content_json || '{}');
  const entries = entryRows(page);
  const section = SECTION[page.kind];
  const trope = page.trope_id ? getTrope(page.trope_id) : null;
  const subgenre = page.subgenre_id ? getSubgenre(page.subgenre_id) : null;

  // attach canonical urls for JSON-LD list items
  for (const e of entries) if (e.type === 'book') e._url = abs(bookSlug(e));

  const writeupByTitle = new Map((content.entries || []).map((e) => [String(e.ref).toLowerCase(), e.writeup]));
  const rows = entries.map((e, i) =>
    renderEntry(e, writeupByTitle.get(e.title.toLowerCase()) || '', section, i + 1)
  ).join('\n');

  const trail = [{ name: 'Home', slug: '' }, { name: 'Tropes', slug: 'tropes/' }, { name: page.h1, slug: page.slug }];
  const jsonld = [
    websiteNode(),
    itemListNode(entries, abs(page.slug)),
    faqNode(content.faqs),
    breadcrumb(trail),
  ];

  const body = `
<article class="listing">
  <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/tropes/">Tropes</a> › <span>${escapeHtml(page.h1)}</span></nav>
  <h1>${escapeHtml(page.h1)}</h1>
  ${updatedLine(page.content_date)}
  ${disclosureInline()}
  <div class="answer-summary"><p>${escapeHtml(content.summary || '')}</p></div>
  ${content.intro ? `<p class="intro">${escapeHtml(content.intro)}</p>` : ''}
  <div class="picks">
${rows}
  </div>
  ${faqBlock(content.faqs)}
  ${emailCapture()}
  ${siblingTropeLinks(page.slug, page.slug)}
</article>`;

  const headHtml = head({
    title: page.h1,
    description: content.summary,
    canonical: abs(page.slug),
    ogType: 'article',
    jsonld,
  });
  return doc(headHtml, body);
}

export function renderBookPage(page) {
  const book = getBook(page.book_id);
  const content = JSON.parse(page.content_json || '{}');
  const link = outboundLink(book, 'book');
  const backTropes = tropePagesForBook(book.id);

  const tropeChips = book.tropes.map((t) => `<span class="chip">${escapeHtml(t.name)}</span>`).join(' ');
  const backLinks = backTropes.length
    ? `<nav class="related" aria-label="Appears on"><h2>Find ${escapeHtml(book.title)} on these lists</h2><ul>${backTropes.map((p) => `<li><a href="/${escapeHtml(p.slug)}">${escapeHtml(p.title)}</a></li>`).join('')}</ul></nav>`
    : '';
  const linkHtml = link
    ? `<p class="retailer"><a class="btn retailer-link" href="${escapeHtml(link.href)}" rel="${link.isAmazon ? 'sponsored nofollow noopener' : 'nofollow noopener'}" target="_blank">${escapeHtml(link.label)}</a></p>`
    : `<p class="retailer unavailable">Retailer link coming soon.</p>`;

  const jsonld = [websiteNode(), ...bookPageNodes(book, abs(page.slug)), faqNode(content.faqs)];
  const body = `
<article class="book-page">
  <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a> › <span>${escapeHtml(book.title)}</span></nav>
  <h1>${escapeHtml(book.title)}</h1>
  <p class="by">by ${escapeHtml(book.pen_name)}${book.subgenre ? ` · ${escapeHtml(book.subgenre)}` : ''}${book.heat_level ? ` · ${escapeHtml(book.heat_level)}` : ''}</p>
  ${updatedLine(page.content_date)}
  ${disclosureInline()}
  <div class="answer-summary"><p>${escapeHtml(content.summary || '')}</p></div>
  <div class="chips">${tropeChips}</div>
  <div class="book-body"><p>${escapeHtml(content.body || '')}</p></div>
  ${book.content_notes ? `<p class="content-notes"><strong>Content notes:</strong> ${escapeHtml(book.content_notes)}</p>` : ''}
  ${linkHtml}
  ${faqBlock(content.faqs)}
  ${emailCapture()}
  ${backLinks}
</article>`;
  return doc(head({ title: book.title, description: content.summary, canonical: abs(page.slug), ogType: 'book', jsonld }), body);
}

// ---- Support + index pages --------------------------------------------------

export function renderSupportPage(page) {
  const bodyBySlug = {
    about: aboutBody(),
    'affiliate-disclosure': disclosureBody(),
    privacy: privacyBody(),
    contact: contactBody(),
  };
  const body = `<article class="support"><h1>${escapeHtml(page.h1)}</h1>\n${bodyBySlug[page.slug] || '<p></p>'}</article>`;
  return doc(head({ title: page.h1, description: `${page.h1} — ${config.site.brand}`, canonical: abs(page.slug), jsonld: [websiteNode()] }), body);
}

function aboutBody() {
  // Light, generic material-connection line — names no one, reveals nothing
  // personal. It exists only to signal (per FTC best practice) that some picks
  // are published in-house. Edit the wording or delete it entirely to taste;
  // it is not a hard Amazon Associates requirement.
  return `<p>${escapeHtml(config.site.brand)} is a reader-first recommendation site organized by trope and vibe. Lists blend lesser-known titles with widely-read comparable books so you can find your next read fast.</p>
<p>Some titles featured here are published through our own imprint. We recommend them on the same editorial basis as every other book on the site — because they fit the trope, tone and heat level — never as paid placements.</p>
<p>${escapeHtml(AMAZON_DISCLOSURE)}</p>`;
}
function disclosureBody() {
  return `<p>${escapeHtml(AMAZON_DISCLOSURE)}</p>
<p>When you click a retailer link on this site and make a purchase, we may earn a commission at no extra cost to you. Outbound retailer links are clearly labeled. We do not display prices or ratings, which can go out of date.</p>
<p>Affiliate links appear only on this website. Our email newsletter never contains affiliate links — it links only back to pages on this site.</p>`;
}
function privacyBody() {
  return `<p>We collect only the email address you voluntarily submit to our list, used solely to send the monthly recommendations. We do not sell your data. Retailer links are governed by those retailers' own privacy policies.</p>
<p>Questions: <a href="/contact">contact us</a>.</p>`;
}
function contactBody() {
  return `<p>Reach the editors at <a href="mailto:${escapeHtml(config.site.contactEmail)}">${escapeHtml(config.site.contactEmail)}</a>.</p>`;
}

export function renderHome() {
  const hubs = getPages('trope_hub').slice(0, 24);
  const cards = hubs.map((p) => `<li><a href="/${escapeHtml(p.slug)}">${escapeHtml(p.title)}</a></li>`).join('\n');
  const body = `<section class="home">
  <h1>${escapeHtml(config.site.brand)}</h1>
  <p class="tagline">${escapeHtml(config.site.tagline)}</p>
  ${disclosureInline()}
  <h2>Popular reading lists</h2>
  <ul class="hub-list">${cards}</ul>
  ${emailCapture()}
  </section>`;
  return doc(head({ title: 'Home', description: config.site.tagline, canonical: config.site.url + '/', jsonld: [websiteNode()] }), body);
}

export function renderTropeIndex() {
  const hubs = getPages('trope_hub');
  const items = hubs.map((p) => `<li><a href="/${escapeHtml(p.slug)}">${escapeHtml(p.title)}</a></li>`).join('\n');
  const body = `<section class="index"><h1>All trope reading lists</h1><ul class="hub-list">${items}</ul>${emailCapture()}</section>`;
  return doc(head({ title: 'All trope reading lists', description: 'Browse every trope-based reading list.', canonical: abs('tropes/'), jsonld: [websiteNode()] }), body);
}
