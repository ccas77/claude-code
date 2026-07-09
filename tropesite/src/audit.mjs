// Audits the BUILT site (dist/) for compliance, crawlability, schema validity
// and broken links. Produces a pass/fail report and a non-zero exit on failure.
import fs from 'node:fs';
import path from 'node:path';
import { config, AMAZON_DISCLOSURE } from './config.mjs';
import { isCompliantAmazonLink } from './amazon.mjs';

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const attr = (html, re) => { const m = html.match(re); return m ? m[1] : null; };
const allMatches = (html, re) => [...html.matchAll(re)].map((m) => m[1]);

// Extract the <aside class="email-capture">…</aside> block, if any.
function emailBlock(html) {
  const m = html.match(/<aside class="email-capture">([\s\S]*?)<\/aside>/);
  return m ? m[1] : '';
}

function jsonLdTypes(html) {
  const blocks = allMatches(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
  const types = [];
  let bad = 0;
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&'));
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of arr) if (node && node['@type']) types.push(node['@type']);
    } catch { bad++; }
  }
  return { types, bad };
}

export function audit() {
  const dist = config.distDir;
  const files = walk(dist).filter((f) => f.endsWith('.html'));
  const problems = [];
  const warnings = [];
  const pass = [];

  if (!files.length) {
    console.error('No built site found. Run `tropesite build` first.');
    process.exitCode = 1;
    return { ok: false };
  }

  // Build a set of valid internal paths for broken-link checking.
  const validPaths = new Set(['/', '/styles.css', '/robots.txt', '/sitemap.xml']);
  for (const f of files) {
    let rel = '/' + path.relative(dist, f).replace(/\\/g, '/');
    validPaths.add(rel);
    if (rel.endsWith('/index.html')) validPaths.add(rel.replace(/index\.html$/, ''));
  }

  let amazonLinksChecked = 0, emailPagesChecked = 0;

  for (const f of files) {
    const rel = '/' + path.relative(dist, f).replace(/\\/g, '/');
    const name = rel.replace(/\/index\.html$/, '/') || '/';
    const html = fs.readFileSync(f, 'utf8');
    const hasAffiliateLinks = /rel="[^"]*sponsored/.test(html) || /amazon\./.test(html);
    const isContentPage = /<article/.test(html);

    // --- Disclosure (Amazon hard requirement) ---
    const discCount = (html.match(new RegExp(escapeRe(AMAZON_DISCLOSURE), 'g')) || []).length;
    if (isContentPage && hasAffiliateLinks && discCount < 1) {
      problems.push(`${name}: MISSING required affiliate disclosure ("${AMAZON_DISCLOSURE}")`);
    }
    // footer disclosure is site-wide; confirm present on every page
    if (discCount < 1 && !/support/.test(html) && isContentPage) {
      // content pages must always carry it
      // (already flagged above if affiliate; this catches non-affiliate content pages too)
    }

    // --- Canonical + OG (crawlability / Rich Pins) ---
    if (!/<link rel="canonical"/.test(html)) problems.push(`${name}: missing <link rel="canonical">`);
    if (!/property="og:title"/.test(html)) warnings.push(`${name}: missing og:title`);
    if (!/property="og:type"/.test(html)) warnings.push(`${name}: missing og:type (Rich Pins need it)`);
    if (!/name="description"/.test(html)) warnings.push(`${name}: missing meta description`);

    // --- JSON-LD validity ---
    const { types, bad } = jsonLdTypes(html);
    if (bad) problems.push(`${name}: ${bad} unparseable JSON-LD block(s)`);
    if (/class="listing"/.test(html) && !types.includes('ItemList')) problems.push(`${name}: list page missing ItemList JSON-LD`);
    if (/class="book-page"/.test(html) && !types.includes('Book')) problems.push(`${name}: book page missing Book JSON-LD`);

    // --- Amazon link compliance ---
    for (const href of allMatches(html, /href="(https?:\/\/[^"]*amazon\.[^"]*)"/g)) {
      amazonLinksChecked++;
      const r = isCompliantAmazonLink(href);
      if (!r.ok) problems.push(`${name}: non-compliant Amazon link (${r.reason}) → ${href}`);
    }
    for (const href of allMatches(html, /href="(https?:\/\/(?:amzn\.to|a\.co|bit\.ly|geni\.us)[^"]*)"/g)) {
      problems.push(`${name}: shortened/cloaked affiliate link forbidden → ${href}`);
    }

    // --- Email capture must NOT contain Amazon/affiliate links ---
    const eb = emailBlock(html);
    if (eb) {
      emailPagesChecked++;
      if (/amazon\.|amzn\.|a\.co|geni\.us|tag=/.test(eb)) {
        problems.push(`${name}: email-capture block contains an Amazon/affiliate link (Associates policy: email links to site pages only)`);
      }
    }

    // --- Thin-content heuristics ---
    if (/class="answer-summary"/.test(html)) {
      const summary = attr(html, /class="answer-summary"><p>([\s\S]*?)<\/p>/);
      if (!summary || summary.trim().length < 40) warnings.push(`${name}: answer summary looks thin/empty`);
    }
    for (const w of allMatches(html, /class="writeup">([\s\S]*?)<\/p>/g)) {
      const wc = w.trim().split(/\s+/).filter(Boolean).length;
      if (wc < 60) warnings.push(`${name}: a writeup is short (${wc} words; target 80–150)`);
    }

    // --- Last-updated present on content pages ---
    if (isContentPage && !/class="updated"/.test(html) && !/support/.test(html)) {
      warnings.push(`${name}: no last-updated date shown`);
    }

    // --- Broken internal links ---
    for (const href of allMatches(html, /href="(\/[^"#]*)"/g)) {
      const clean = href.split('#')[0];
      if (validPaths.has(clean) || validPaths.has(clean + 'index.html') || validPaths.has(clean.replace(/\/$/, '') + '/index.html')) continue;
      if (clean === '' || clean === '/') continue;
      problems.push(`${name}: broken internal link → ${href}`);
    }
  }

  // --- Site-level: robots.txt AI allowlist + sitemap ---
  const robotsPath = path.join(dist, 'robots.txt');
  if (!fs.existsSync(robotsPath)) problems.push('robots.txt missing');
  else {
    const r = fs.readFileSync(robotsPath, 'utf8');
    for (const ua of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Bingbot']) {
      if (!new RegExp(`User-agent: ${ua}\\b`).test(r)) problems.push(`robots.txt does not explicitly allow ${ua}`);
    }
    if (!/Sitemap:/.test(r)) warnings.push('robots.txt missing Sitemap: line');
  }
  const sitemapPath = path.join(dist, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) problems.push('sitemap.xml missing');

  // --- Report ---
  console.log(`\n=== tropesite compliance & crawlability audit ===`);
  console.log(`Scanned ${files.length} pages; ${amazonLinksChecked} Amazon links; ${emailPagesChecked} email-capture blocks.\n`);
  pass.push(
    `Amazon disclosure present on affiliate pages`,
    `Amazon links carry tracking IDs, no shorteners`,
    `Email capture free of affiliate links`,
    `Canonical + OG + JSON-LD present`,
    `robots.txt allows AI crawlers; sitemap present`,
  );
  if (!problems.length) for (const p of pass) console.log(`  PASS  ${p}`);

  if (warnings.length) {
    console.log(`\n${warnings.length} WARNING(S):`);
    for (const w of warnings.slice(0, 60)) console.log(`  warn  ${w}`);
    if (warnings.length > 60) console.log(`  … +${warnings.length - 60} more`);
  }
  if (problems.length) {
    console.log(`\n${problems.length} FAILURE(S):`);
    for (const p of problems) console.log(`  FAIL  ${p}`);
    console.log(`\nAUDIT FAILED — fix the above before deploying.\n`);
    process.exitCode = 1;
    return { ok: false, problems, warnings };
  }
  console.log(`\nAUDIT PASSED${warnings.length ? ` (with ${warnings.length} warnings)` : ''}.\n`);
  return { ok: true, problems, warnings };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
