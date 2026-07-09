import { config } from './config.mjs';

// robots.txt that EXPLICITLY ALLOWS the major AI crawlers and standard search
// bots, and points to the sitemap.
//
// User-agent tokens verified July 2026 (families confirmed via current crawler
// references; re-verify periodically as vendors add bots — see SETUP.md).
//   OpenAI:     GPTBot, OAI-SearchBot, ChatGPT-User
//   Anthropic:  ClaudeBot, Claude-User, Claude-SearchBot, anthropic-ai
//   Perplexity: PerplexityBot, Perplexity-User
//   Google:     Googlebot (search), Google-Extended (AI training opt-in)
//   Microsoft:  Bingbot (Bing index also feeds several AI assistants)
//   Apple:      Applebot, Applebot-Extended
//   Amazon:     Amazonbot
//   Common Crawl: CCBot
// "Allow: /" for each = we WANT to be crawled and cited by AI search.
const AI_AND_SEARCH_BOTS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai',
  'PerplexityBot', 'Perplexity-User',
  'Googlebot', 'Google-Extended',
  'Bingbot',
  'Applebot', 'Applebot-Extended',
  'Amazonbot',
  'CCBot',
  'DuckDuckBot',
];

export function robotsTxt() {
  const lines = [];
  for (const ua of AI_AND_SEARCH_BOTS) {
    lines.push(`User-agent: ${ua}`);
    lines.push('Allow: /');
    lines.push('');
  }
  // Everyone else: allowed too (this is a public recommendation site).
  lines.push('User-agent: *');
  lines.push('Allow: /');
  lines.push('');
  lines.push(`Sitemap: ${config.site.url}/sitemap.xml`);
  lines.push('');
  return lines.join('\n');
}
