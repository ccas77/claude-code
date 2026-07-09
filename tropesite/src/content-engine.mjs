// Content engine: drafts page copy from catalog metadata and APPROVED comp
// facts. Two modes:
//   - LLM mode (ANTHROPIC_API_KEY set): richer, varied prose, but constrained by
//     a hard system prompt to the supplied facts only.
//   - Fallback mode (no key): deterministic composer that assembles genuinely
//     specific writeups from real metadata. Never fabricates either way.
import { config } from './config.mjs';
import { seededPick, seededShuffle, wordCount } from './util.mjs';

// Hard rules injected into every LLM request. Encodes the no-fabrication and
// Amazon-prohibited-claims requirements.
export const SYSTEM_PROMPT = `You write book-recommendation copy for a genre-reader website.

VOICE: a knowledgeable, warm genre reader talking to other readers. Specific and concrete. No marketing-speak, no hype, no superlatives you cannot support from the supplied facts.

ABSOLUTE RULES — violating any is a failure:
1. Use ONLY the facts provided in the user message. Do NOT invent plot points, character names, quotes, twists, settings, tone, or heat level beyond what is given.
2. For comp titles (books by other authors) you may use ONLY the provided "factual_description". Never add plot detail or claims about them.
3. Never claim or imply endorsement by Amazon or any retailer. Never mention prices, star ratings, review counts, bestseller status, or availability.
4. Never use the word "Amazon" as a descriptor of quality; retailer links are labeled separately by the site, not by you.
5. No fabricated statistics, awards, or comparisons you cannot ground in the facts.
6. Vary sentence structure and openings across entries; do not start every writeup the same way.

OUTPUT: Return ONLY valid minified JSON matching the requested shape. No markdown, no commentary.`;

export class ContentEngine {
  constructor(opts = {}) {
    this.apiKey = opts.apiKey ?? config.anthropic.apiKey;
    this.model = opts.model ?? config.anthropic.model;
    this.baseUrl = opts.baseUrl ?? config.anthropic.baseUrl;
    this.forceFallback = opts.forceFallback ?? false;
  }

  available() { return Boolean(this.apiKey) && !this.forceFallback; }

  async callLLM(userMessage, maxTokens = 2000) {
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const text = (data.content || []).map((b) => b.text || '').join('');
    return parseJson(text);
  }

  // ---- Page drafting --------------------------------------------------------

  async draftTropeHub({ trope, subgenre, entries, seed }) {
    const facts = buildHubFacts({ trope, subgenre, entries });
    if (this.available()) {
      try {
        const msg = hubPrompt(facts);
        const out = await this.callLLM(msg, 3000);
        return normalizeContent(out, entries, seed);
      } catch (e) {
        console.warn(`  (LLM draft failed, using fallback: ${e.message})`);
      }
    }
    return fallbackHub({ trope, subgenre, entries, seed });
  }

  async draftBooksLike({ comp, entries, seed }) {
    if (this.available()) {
      try {
        const msg = booksLikePrompt({ comp, entries });
        const out = await this.callLLM(msg, 3000);
        return normalizeContent(out, entries, seed);
      } catch (e) {
        console.warn(`  (LLM draft failed, using fallback: ${e.message})`);
      }
    }
    return fallbackBooksLike({ comp, entries, seed });
  }

  async draftBook({ book, seed }) {
    if (this.available()) {
      try {
        const msg = bookPrompt(book);
        const out = await this.callLLM(msg, 1500);
        return { summary: out.summary || '', body: out.body || '', faqs: out.faqs || [] };
      } catch (e) {
        console.warn(`  (LLM draft failed, using fallback: ${e.message})`);
      }
    }
    return fallbackBook({ book, seed });
  }

  async proposeCompTitles(trope) {
    if (!this.available()) return [];
    const msg =
      `Propose up to 6 widely-known published books strongly associated with the "${trope.name}" trope ` +
      `(${trope.description}). These are CANDIDATES for a human to verify and approve; do not describe their plots. ` +
      `Return JSON: {"candidates":[{"title":"","author":"","reason":"why it fits the trope in <=12 words"}]}.`;
    const out = await this.callLLM(msg, 1200);
    return (out.candidates || []).filter((c) => c.title && c.author);
  }
}

// ---- Prompt builders --------------------------------------------------------

function entryFact(e) {
  if (e.type === 'book') {
    return {
      ref: e.title, author: e.pen_name, kind: 'my_catalog',
      subgenre: e.subgenre, heat: e.heat_level, content_notes: e.content_notes,
      tropes: (e.tropes || []).map((t) => t.name),
      blurb: e.blurb,
    };
  }
  return {
    ref: e.title, author: e.author, kind: 'comp',
    tropes: (e.tropes || []).map((t) => t.name),
    factual_description: e.factual_description,
  };
}

function buildHubFacts({ trope, subgenre, entries }) {
  return {
    trope: { name: trope.name, definition: trope.description },
    subgenre: subgenre ? { name: subgenre.name, definition: subgenre.description } : null,
    books: entries.map(entryFact),
  };
}

function hubPrompt(facts) {
  return (
    `Draft a recommendation page for this trope${facts.subgenre ? '/subgenre' : ''}.\n\n` +
    `FACTS (use only these):\n${JSON.stringify(facts, null, 2)}\n\n` +
    `Produce JSON:\n` +
    `{"summary":"2-3 sentences: what the trope is + name the top 3 picks with a one-line reason each",` +
    `"intro":"1-2 sentence lead-in (optional)",` +
    `"entries":[{"ref":"<exact title>","writeup":"80-150 words: why THIS book fits THIS trope, its tone and heat level, grounded only in the facts"}],` +
    `"faqs":[{"q":"real reader question","a":"concise factual answer"}]}\n` +
    `Include every book in "entries", keyed by exact title. 3-5 faqs. No prices/ratings/endorsement.`
  );
}

function booksLikePrompt({ comp, entries }) {
  const facts = {
    comp: { title: comp.title, author: comp.author, factual_description: comp.factual_description, tropes: comp.tropes.map((t) => t.name) },
    recommendations: entries.map(entryFact),
  };
  return (
    `Draft a "books like ${comp.title}" page recommending the listed catalog books to fans of the comp.\n\n` +
    `FACTS (use only these; for the comp use only its factual_description):\n${JSON.stringify(facts, null, 2)}\n\n` +
    `Produce JSON: {"summary":"2-3 sentences naming the comp and the top 3 read-alikes with one-line reasons",` +
    `"intro":"1-2 sentences","entries":[{"ref":"<exact title>","writeup":"80-150 words on why this book suits fans of the comp, via shared tropes/tone/heat, grounded only in facts"}],` +
    `"faqs":[{"q":"","a":""}]}. Include every recommendation. 3-5 faqs.`
  );
}

function bookPrompt(book) {
  const facts = {
    title: book.title, author: book.pen_name, subgenre: book.subgenre,
    heat: book.heat_level, content_notes: book.content_notes,
    tropes: (book.tropes || []).map((t) => t.name), blurb: book.blurb,
  };
  return (
    `Write an individual book page from this metadata (use only these facts):\n${JSON.stringify(facts, null, 2)}\n\n` +
    `Produce JSON: {"summary":"2-3 sentence hook grounded in the blurb + tropes",` +
    `"body":"120-200 words: what the book is about (from the blurb), its tropes, tone and heat, who it's for",` +
    `"faqs":[{"q":"","a":""}]}. 3-4 faqs. No prices/ratings/endorsement.`
  );
}

// ---- Deterministic fallback composers (no fabrication) ----------------------

const HEAT_PHRASE = {
  Sweet: 'closed-door / low-heat',
  Steamy: 'steamy, with on-page heat',
  Explicit: 'explicit and high-heat',
};

function tropeList(names, exclude) {
  const list = names.filter((n) => n !== exclude);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
}

// A truthful sentence about the trope itself (its definition) — this is a fact
// about the trope, never an invented claim about the book.
function tropeContext(trope) {
  if (!trope || !trope.description) return '';
  const d = trope.description.replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  return ` ${trope.name} is the draw here: ${d.charAt(0).toLowerCase() + d.slice(1)}.`;
}

function bookWriteup(e, trope, seed) {
  const heat = HEAT_PHRASE[e.heat_level] || (e.heat_level ? `${e.heat_level.toLowerCase()} heat` : 'its own heat level');
  const others = tropeList((e.tropes || []).map((t) => t.name), trope?.name);
  const opener = seededPick(seed + e.title, [
    `${e.title} by ${e.pen_name} leans hard into ${trope ? trope.name.toLowerCase() : 'the trope'}.`,
    `If you came for ${trope ? trope.name.toLowerCase() : 'this trope'}, ${e.pen_name}'s ${e.title} delivers it.`,
    `${e.pen_name} builds ${e.title} around ${trope ? trope.name.toLowerCase() : 'the trope'}.`,
    `In ${e.title}, ${e.pen_name} puts ${trope ? trope.name.toLowerCase() : 'the trope'} front and center.`,
  ]);
  const ctx = tropeContext(trope);
  const blurbBit = e.blurb ? ` ${e.blurb.replace(/\s+/g, ' ').trim()}` : '';
  const tropeBit = others ? ` It also runs on ${others}, if those are your catnip.` : '';
  const subBit = e.subgenre ? ` It sits in ${e.subgenre.toLowerCase()}.` : '';
  const heatBit = ` Expect a ${heat} read` +
    (e.content_notes ? `; content notes: ${e.content_notes.replace(/\.$/, '')}.` : '.');
  const closer = seededPick(seed + 'c' + e.title, [
    ' A strong pick if this trope is your priority.',
    ' Reach for it when you want the trope done straight, no bait-and-switch.',
    ' It earns its place on this list on trope alone.',
    ' Good next-read if the dynamic above is what you came for.',
  ]);
  return clampWords(`${opener}${ctx}${blurbBit}${tropeBit}${subBit}${heatBit}${closer}`, 150);
}

function compWriteup(e, seed, trope) {
  const others = tropeList((e.tropes || []).map((t) => t.name));
  const anchor = trope || (e.tropes || [])[0];
  const opener = seededPick(seed + e.title, [
    `${e.title} by ${e.author} is a frequent touchstone for this list.`,
    `Readers often name ${e.author}'s ${e.title} in the same breath.`,
    `${e.title} (${e.author}) shares the DNA fans of this trope look for.`,
  ]);
  const ctx = tropeContext(anchor);
  const desc = e.factual_description ? ` ${e.factual_description.replace(/\s+/g, ' ').trim()}` : '';
  const tr = others ? ` Shared tropes with the list: ${others}.` : '';
  const closer = ' Included as a well-known comparison point, not a substitute for the catalog picks above.';
  return clampWords(`${opener}${ctx}${desc}${tr}${closer}`, 150);
}

function clampWords(s, max) {
  const w = s.trim().split(/\s+/);
  if (w.length <= max) return s.trim();
  return w.slice(0, max).join(' ').replace(/[,;]$/, '') + '.';
}

function topThree(entries, trope, seed) {
  const picks = seededShuffle(seed, entries).slice(0, 3);
  return picks.map((e) => {
    if (e.type === 'book') {
      const t = tropeList((e.tropes || []).map((x) => x.name), trope?.name);
      return `${e.title} (${e.pen_name})${t ? ` for ${t}` : ''}`;
    }
    return `${e.title} (${e.author})`;
  });
}

function fallbackHub({ trope, subgenre, entries, seed }) {
  const three = topThree(entries, trope, seed);
  const scope = subgenre ? `${subgenre.name.toLowerCase()} ` : '';
  const summary =
    `${trope.name} is ${trope.description ? trope.description.charAt(0).toLowerCase() + trope.description.slice(1) : 'a reader-favorite dynamic'} ` +
    `Top ${scope}picks below: ${three.join('; ')}.`;
  const intro = seededPick(seed + 'intro', [
    `Here are ${entries.length} ${scope}reads where ${trope.name.toLowerCase()} is the main event, not a footnote.`,
    `Every book here earns its ${trope.name.toLowerCase()} label — sorted for readers who want the trope done well.`,
  ]);
  const contentEntries = entries.map((e) => ({
    ref: e.title,
    writeup: e.type === 'book' ? bookWriteup(e, trope, seed) : compWriteup(e, seed, trope),
  }));
  const faqs = hubFaqs(trope, subgenre, entries);
  return { summary: collapse(summary), intro, entries: contentEntries, faqs };
}

function fallbackBooksLike({ comp, entries, seed }) {
  const three = topThree(entries, comp.tropes[0], seed);
  const summary =
    `If you loved ${comp.title} by ${comp.author}, these read-alikes share its trope DNA. ` +
    `Start with: ${three.join('; ')}.`;
  const intro = `${comp.factual_description ? comp.factual_description.trim() + ' ' : ''}Here are catalog reads that scratch the same itch.`;
  const contentEntries = entries.map((e) => ({
    ref: e.title,
    writeup: bookWriteup(e, comp.tropes[0], seed),
  }));
  const faqs = [
    { q: `Are these books like ${comp.title}?`, a: `They share key tropes with ${comp.title} (${comp.tropes.map((t) => t.name).join(', ')}), chosen for readers who want that same dynamic.` },
    { q: `Where can I read them?`, a: `Each pick links to its retailer page; tap through from the entry.` },
    { q: `Is ${comp.title} on this list?`, a: `No — this page recommends read-alikes, not the comp itself.` },
  ];
  return { summary: collapse(summary), intro: collapse(intro), entries: contentEntries, faqs };
}

function fallbackBook({ book, seed }) {
  const heat = HEAT_PHRASE[book.heat_level] || (book.heat_level ? `${book.heat_level.toLowerCase()} heat` : '');
  const tropes = (book.tropes || []).map((t) => t.name);
  const summary = `${book.title} by ${book.pen_name} is a ${book.subgenre ? book.subgenre.toLowerCase() + ' ' : ''}read built on ${tropeList(tropes)}.`;
  const body = clampWords(
    `${book.blurb ? book.blurb.replace(/\s+/g, ' ').trim() + ' ' : ''}` +
    `Tropes: ${tropes.join(', ')}.${heat ? ` It's a ${heat} read.` : ''}` +
    `${book.content_notes ? ` Content notes: ${book.content_notes}` : ''}`,
    200
  );
  const faqs = [
    { q: `What tropes are in ${book.title}?`, a: tropes.join(', ') + '.' },
    { q: `How steamy is ${book.title}?`, a: book.heat_level ? `${book.heat_level}.` : 'See the heat level noted above.' },
    ...(book.content_notes ? [{ q: `Any content warnings?`, a: book.content_notes }] : []),
  ];
  return { summary: collapse(summary), body: collapse(body), faqs };
}

function hubFaqs(trope, subgenre, entries) {
  const scope = subgenre ? `${subgenre.name} ` : '';
  const faqs = [
    { q: `What makes a good ${trope.name.toLowerCase()} ${scope}book?`, a: `${trope.description || `Books where ${trope.name.toLowerCase()} drives the central relationship.`}` },
    { q: `How many ${scope}${trope.name.toLowerCase()} books are on this list?`, a: `${entries.length}, mixing lesser-known catalog titles with widely-read comps.` },
  ];
  const heats = [...new Set(entries.filter((e) => e.heat_level).map((e) => e.heat_level))];
  if (heats.length) faqs.push({ q: `What heat levels do these span?`, a: `From ${heats.join(' to ')} — each entry notes its own.` });
  faqs.push({ q: `Where can I read these?`, a: `Every entry links out to its retailer page.` });
  return faqs;
}

const collapse = (s) => s.replace(/\s+/g, ' ').replace(/\s+([.,;])/g, '$1').trim();

// ---- Normalization ----------------------------------------------------------

// Align LLM output entries back to the ordered catalog entries by exact title,
// falling back to composed writeups for any the model dropped.
function normalizeContent(out, entries, seed) {
  const byRef = new Map((out.entries || []).map((e) => [String(e.ref || '').trim().toLowerCase(), e.writeup]));
  const norm = entries.map((e) => {
    let w = byRef.get(e.title.toLowerCase());
    if (!w || wordCount(w) < 40) {
      const anchor = e.tropes?.[0];
      w = e.type === 'book' ? bookWriteup(e, anchor, seed) : compWriteup(e, seed, anchor);
    }
    return { ref: e.title, writeup: collapse(w) };
  });
  return {
    summary: collapse(out.summary || ''),
    intro: collapse(out.intro || ''),
    entries: norm,
    faqs: (out.faqs || []).map((f) => ({ q: f.q || f.question, a: f.a || f.answer })).filter((f) => f.q && f.a),
  };
}

function parseJson(text) {
  const t = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch {}
  const s = t.indexOf('{'); const e = t.lastIndexOf('}');
  if (s !== -1 && e !== -1) { try { return JSON.parse(t.slice(s, e + 1)); } catch {} }
  throw new Error('LLM did not return parseable JSON');
}
