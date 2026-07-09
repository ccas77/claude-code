// Amazon Associates compliance helpers.
//
// Verified July 2026 against Amazon Associates Program Policies:
//  - Every Amazon link must carry a valid Associates tracking ID.
//  - Links must be plainly-identifiable Amazon URLs; NO shorteners / redirects
//    / cloaking that obscures the destination.
//  - Required disclosure (exact): "As an Amazon Associate I earn from
//    qualifying purchases." — rendered site-wide AND on every page with links.
//  - Do NOT display static prices, star ratings or review counts (stale/prohibited).
//  - Associates links are prohibited in email/newsletters/PDFs/offline content.
//  - OneLink is the current mechanism for geo-routing international traffic.
import { config, assocTag, AMAZON_DISCLOSURE } from './config.mjs';

export { AMAZON_DISCLOSURE };

// Build a compliant, plainly-identifiable Amazon product URL for an ASIN,
// tagged with the section's Associates ID. Returns null if no ASIN.
export function amazonUrl(asin, section = 'default') {
  if (!asin) return null;
  const tag = assocTag(section);
  const base = `https://${config.amazon.marketplace}/dp/${encodeURIComponent(asin)}`;
  // A single, transparent query param — the tracking tag. No cloaking.
  return tag ? `${base}?tag=${encodeURIComponent(tag)}` : base;
}

// Resolve the outbound retailer link + label for a catalog item, honoring the
// section so the correct tracking ID is used.
export function outboundLink(item, section) {
  if (item.asin) {
    return { href: amazonUrl(item.asin, section), label: 'View on Amazon', isAmazon: true };
  }
  if (item.retailer_url) {
    return { href: item.retailer_url, label: 'View at retailer', isAmazon: false };
  }
  return null; // pre-launch: no destination yet — audit will flag as a soft warning
}

const SHORTENER_HOSTS = new Set([
  'amzn.to', 'bit.ly', 'tinyurl.com', 't.co', 'ow.ly', 'buff.ly', 'rebrand.ly', 'geni.us', 'a.co',
]);

// Validation rule: an Amazon link is compliant iff it is a bare amazon host,
// carries a tag, and is not a shortener/redirect. Used by `audit`.
export function isCompliantAmazonLink(href) {
  let u;
  try { u = new URL(href); } catch { return { ok: false, reason: 'unparseable URL' }; }
  if (SHORTENER_HOSTS.has(u.hostname)) return { ok: false, reason: `shortener/cloaked host (${u.hostname})` };
  if (!/(^|\.)amazon\./i.test(u.hostname)) return { ok: true, reason: 'non-Amazon link (rule N/A)' };
  if (!u.searchParams.get('tag')) return { ok: false, reason: 'Amazon link missing ?tag= Associates ID' };
  return { ok: true, reason: 'ok' };
}

// Validation rule (hard): links intended for EMAIL/newsletter/offline content
// must NOT point at Amazon. The email/newsletter builders route through this.
export function assertNoAmazonInEmail(href) {
  let u;
  try { u = new URL(href); } catch { return; }
  if (/(^|\.)amazon\./i.test(u.hostname) || SHORTENER_HOSTS.has(u.hostname)) {
    throw new Error(
      `Amazon Associates policy violation: affiliate/Amazon link "${href}" placed in email/newsletter content. ` +
      `Email content may link ONLY to your own site pages.`
    );
  }
}

// OneLink snippet for geo-routing international clicks. Injected only when
// AMAZON_ONELINK=true and a default tag exists. This is the compliant way to
// send non-US visitors to their local marketplace while still monetizing.
export function oneLinkScript() {
  if (!config.amazon.oneLink) return '';
  const tag = assocTag('default');
  if (!tag) return '';
  // amzn_assoc_tracking_id + OneTag loader. Marketplace subtags configured in
  // the Associates OneLink dashboard; AMAZON_ONELINK_TAGS documents them in SETUP.
  return [
    '<script type="text/javascript">',
    'amzn_assoc_tracking_id = ' + JSON.stringify(tag) + ';',
    "amzn_assoc_ad_mode = 'auto';",
    "amzn_assoc_ad_type = 'smart';",
    "amzn_assoc_marketplace = 'amazon';",
    "amzn_assoc_region = 'US';",
    '</script>',
    '<script src="//z-na.amazon-adsystem.com/widgets/onejs?MarketPlace=US"></script>',
  ].join('\n');
}
