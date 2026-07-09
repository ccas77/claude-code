import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { getPages } from './catalog.mjs';
import { setMeta } from './db.mjs';
import { today } from './util.mjs';
import {
  renderListPage, renderBookPage, renderSupportPage, renderHome, renderTropeIndex,
} from './render.mjs';
import { STYLES } from './styles.mjs';
import { robotsTxt } from './robots.mjs';

function writeFile(rel, content) {
  const full = path.join(config.distDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}
// Clean URL: /slug/ → /slug/index.html
function writePage(slug, html) {
  writeFile(path.join(slug, 'index.html'), html);
}

export function build({ noImages = false } = {}) {
  config.buildDate = today();
  config.noImages = noImages;
  fs.rmSync(config.distDir, { recursive: true, force: true });
  fs.mkdirSync(config.distDir, { recursive: true });

  const pages = getPages();
  const urls = [];
  let n = 0;

  // Home + tropes index
  writeFile('index.html', renderHome());
  writePage('tropes', renderTropeIndex());
  urls.push('', 'tropes/');

  for (const p of pages) {
    let html;
    if (p.kind === 'trope_hub' || p.kind === 'books_like') html = renderListPage(p);
    else if (p.kind === 'book') html = renderBookPage(p);
    else if (p.kind === 'support') html = renderSupportPage(p);
    else continue;
    writePage(p.slug, html);
    urls.push(p.slug);
    n++;
  }

  // Static assets
  writeFile('styles.css', STYLES);
  writeFile('robots.txt', robotsTxt());
  writeFile('sitemap.xml', sitemap(urls));

  setMeta('last_build', new Date().toISOString());
  setMeta('page_count', String(n));

  console.log(`\nBuilt ${n} content pages + home + tropes index → ${path.relative(config.root, config.distDir)}/`);
  console.log(`  robots.txt, sitemap.xml, styles.css written.${noImages ? '  (--no-images: text-only entries)' : ''}`);
  console.log(`Preview:  npx serve ${path.relative(config.root, config.distDir)}   or   tropesite review`);
  return { pages: n, urls };
}

function sitemap(urls) {
  const now = today();
  const body = urls.map((u) =>
    `  <url><loc>${config.site.url}/${u}</loc><lastmod>${now}</lastmod></url>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}
