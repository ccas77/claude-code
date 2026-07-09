// schema.org JSON-LD builders. Emitted server-side into the initial HTML so AI
// crawlers (which often don't run JS) see structured data immediately.
import { config } from './config.mjs';

const abs = (p) => `${config.site.url}/${String(p).replace(/^\/+/, '')}`;

export function bookNode(item, url) {
  // `item` is a catalog book (mine) or a comp. Never includes price/rating.
  const isComp = item.type === 'comp';
  const node = {
    '@type': 'Book',
    name: item.title,
    author: { '@type': 'Person', name: isComp ? item.author : item.pen_name },
  };
  if (!isComp && item.subgenre) node.genre = item.subgenre;
  if (url) node.url = url;
  const tropes = (item.tropes || []).map((t) => t.name);
  if (tropes.length) node.keywords = tropes.join(', ');
  if (!isComp && item.blurb) node.description = truncate(item.blurb, 300);
  if (isComp && item.factual_description) node.description = truncate(item.factual_description, 300);
  return node;
}

export function itemListNode(entries, pageUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    url: pageUrl,
    numberOfItems: entries.length,
    itemListElement: entries.map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: bookNode(e, e._url || undefined),
    })),
  };
}

export function faqNode(faqs) {
  if (!faqs || !faqs.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

// Individual book page: Book + Product (Product needed for Rich Pins). Product
// intentionally omits price/rating (Amazon policy + Rich Pin price would be
// stale); offers references the retailer URL only.
export function bookPageNodes(book, url) {
  const b = bookNode(book, url);
  b['@context'] = 'https://schema.org';
  const nodes = [b];
  const dest = book.asin ? `https://${config.amazon.marketplace}/dp/${book.asin}` : book.retailer_url;
  if (dest) {
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: book.title,
      category: book.subgenre || 'Book',
      brand: { '@type': 'Brand', name: book.pen_name },
      offers: { '@type': 'Offer', url: dest, availability: 'https://schema.org/InStock' },
    });
  }
  return nodes;
}

export function breadcrumb(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem', position: i + 1, name: t.name, item: abs(t.slug),
    })),
  };
}

export function websiteNode() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: config.site.brand,
    url: config.site.url,
    publisher: { '@type': 'Organization', name: config.site.brand, url: config.site.url },
  };
}

function truncate(s, n) {
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
