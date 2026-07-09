// Computes the PROPOSED page list from the catalog. No content is generated
// here — this is the "show me the pages before generating" step.
import { config } from './config.mjs';
import { slugify } from './util.mjs';
import {
  getTropes, getSubgenres, myBooksForTrope, approvedCompsForTrope,
  getComps, myBooksLikeComp, getBooks,
} from './catalog.mjs';

// A trope-hub page is viable if (my books + approved comps) for the
// trope[/subgenre] combination >= minBooksPerPage.
export function planTropeHubs() {
  const pages = [];
  const min = config.minBooksPerPage;
  const subgenres = getSubgenres();

  for (const trope of getTropes()) {
    const comps = approvedCompsForTrope(trope.id);

    // 1) trope + subgenre combinations
    for (const sub of subgenres) {
      const mine = myBooksForTrope(trope.id, sub.id);
      const total = mine.length + comps.length;
      if (total >= min) {
        pages.push({
          kind: 'trope_hub',
          trope_id: trope.id,
          subgenre_id: sub.id,
          slug: slugify(`best ${trope.name} ${sub.name} books`),
          title: `Best ${trope.name} ${sub.name} Books`,
          h1: `Best ${trope.name} ${sub.name} Books`,
          counts: { mine: mine.length, comps: comps.length, total },
        });
      }
    }

    // 2) trope-only (across subgenres) — only if it adds inventory beyond a single subgenre
    const mineAll = myBooksForTrope(trope.id);
    const totalAll = mineAll.length + comps.length;
    if (totalAll >= min) {
      pages.push({
        kind: 'trope_hub',
        trope_id: trope.id,
        subgenre_id: null,
        slug: slugify(`best ${trope.name} romance books`),
        title: `Best ${trope.name} Romance Books`,
        h1: `Best ${trope.name} Romance Books`,
        counts: { mine: mineAll.length, comps: comps.length, total: totalAll },
      });
    }
  }
  return dedupeBySlug(pages);
}

// One "books like X" page per approved comp that has >=1 of my books sharing a trope.
export function planBooksLike() {
  const pages = [];
  for (const comp of getComps('approved')) {
    const mine = myBooksLikeComp(comp.id);
    if (mine.length >= 1) {
      const firstTrope = comp.tropes[0]?.name || 'Romance';
      pages.push({
        kind: 'books_like',
        comp_id: comp.id,
        slug: slugify(`books like ${comp.title} for fans of ${firstTrope}`),
        title: `Books Like ${comp.title} for Fans of ${firstTrope}`,
        h1: `${Math.min(mine.length, 10)} Books Like ${comp.title} for Fans of ${firstTrope}`,
        counts: { mine: mine.length },
      });
    }
  }
  return pages;
}

// One page per MY book.
export function planBookPages() {
  return getBooks().map((b) => ({
    kind: 'book',
    book_id: b.id,
    slug: slugify(`${b.title} by ${b.pen_name}`),
    title: `${b.title} by ${b.pen_name}`,
    h1: b.title,
    counts: { tropes: b.tropes.length },
  }));
}

export const SUPPORT_PAGES = [
  { kind: 'support', slug: 'about', title: 'About', h1: 'About This Site' },
  { kind: 'support', slug: 'affiliate-disclosure', title: 'Affiliate Disclosure', h1: 'Affiliate Disclosure' },
  { kind: 'support', slug: 'privacy', title: 'Privacy Policy', h1: 'Privacy Policy' },
  { kind: 'support', slug: 'contact', title: 'Contact', h1: 'Contact' },
];

function dedupeBySlug(pages) {
  const seen = new Set();
  return pages.filter((p) => (seen.has(p.slug) ? false : (seen.add(p.slug), true)));
}

export function fullPlan() {
  const tropeHubs = planTropeHubs();
  const booksLike = planBooksLike();
  const bookPages = planBookPages();
  return {
    tropeHubs,
    booksLike,
    bookPages,
    support: SUPPORT_PAGES,
    totals: {
      tropeHubs: tropeHubs.length,
      booksLike: booksLike.length,
      bookPages: bookPages.length,
      support: SUPPORT_PAGES.length,
      all: tropeHubs.length + booksLike.length + bookPages.length + SUPPORT_PAGES.length,
    },
  };
}

export function printPlan() {
  const plan = fullPlan();
  const L = [];
  L.push(`\n=== tropesite proposed page plan ===`);
  L.push(`min books per hub page: ${config.minBooksPerPage}\n`);

  L.push(`TROPE HUB PAGES (${plan.tropeHubs.length}):`);
  for (const p of plan.tropeHubs) {
    L.push(`  • ${p.title}`);
    L.push(`      /${p.slug}   [mine:${p.counts.mine} + comps:${p.counts.comps} = ${p.counts.total}]`);
  }
  L.push(`\n"BOOKS LIKE X" PAGES (${plan.booksLike.length}):`);
  for (const p of plan.booksLike) {
    L.push(`  • ${p.title}`);
    L.push(`      /${p.slug}   [my picks: ${p.counts.mine}]`);
  }
  L.push(`\nINDIVIDUAL BOOK PAGES (${plan.bookPages.length}):`);
  for (const p of plan.bookPages) L.push(`  • ${p.title}  →  /${p.slug}`);

  L.push(`\nSUPPORT PAGES (${plan.support.length}): ${plan.support.map((p) => '/' + p.slug).join(', ')}`);
  L.push(`\nTOTAL PAGES: ${plan.totals.all}  (hubs ${plan.totals.tropeHubs}, books-like ${plan.totals.booksLike}, books ${plan.totals.bookPages}, support ${plan.totals.support})`);
  L.push(`\nReview this list, then run:  tropesite generate --pilot   (10 pages across 2 tropes)`);
  L.push(`or:  tropesite generate       (all pages)\n`);
  console.log(L.join('\n'));
  return plan;
}
