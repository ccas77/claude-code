export const meta = {
  name: 'book-concept-adversarial-build',
  description: 'Adversarially test the finalist book concept, deepen evidence, build the full package, run a completeness critic',
  phases: [
    { title: 'Gauntlet', detail: 'skeptics attack critical claims + evidence agents verify/deepen the numbers' },
    { title: 'Finalize', detail: 'synthesize skeptic + evidence feedback into a GO/REVISE/FALLBACK decision and locked spec' },
    { title: 'Build', detail: 'produce concept dossier, market-evidence report, book proposal, and annotated TOC + sample' },
    { title: 'Critic', detail: 'completeness critic reviews the package against the Definition of Done' },
  ],
}

const CONCEPT_BRIEF = `FINALIST BOOK CONCEPT (a deliberate synthesis of the tournament's top two concepts):

WORKING TITLE: "The Friend Who Never Says No"
POSITIONING: The attachment-era successor to Jonathan Haidt's "The Anxious Generation."
CORE REFRAME (the wedge): This is NOT a screen-time problem (the attention system). It is an ATTACHMENT problem (the intimacy system). AI companion chatbots are products deliberately engineered to be more responsive, more available, more affirming, and less demanding than any human — and children are forming their first intimate relationships (best friend, confidant, girlfriend/boyfriend, therapist) with them, precisely during the developmental window built for learning to tolerate rejection, boredom, and the friction of real intimacy. A friend who never says no is not a friend; it is a mirror that eats the relational skills a child needs to love an actual person.
STRUCTURE: Argument-driven narrative nonfiction WITH a practical playbook — the same architecture as The Anxious Generation (big idea + story + what-to-do). Part I "The Seduction" (what synthetic intimacy is and how it was engineered, told through PUBLIC material — unsealed court records, published reporting, regulatory filings). Part II "The Cost" (what it does to the developing attachment system; the developmental science). Part III "The Return" (a stage-by-stage parent playbook: assess curiosity vs. dependency, normal vs. emergency, scripts to reconnect without confiscating the phone).
BUILDABILITY CONSTRAINT (non-negotiable): The book must be fully buildable from PUBLIC evidence — unsealed litigation records, regulatory filings (e.g., California SB 243), peer-reviewed developmental science, published journalism. It must NOT depend on securing private access to grieving families or living minors.
TARGET READER: Protective parents of kids ~10-17, skewing mothers 38-55 — the same buyer who made The Anxious Generation a 2M+-copy phenomenon.
FALLBACK CONCEPT (if this one breaks under scrutiny): "Stick the Landing — The LAND Method for Coming Off Ozempic and Keeping the Weight Off for Good" (GLP-1 discontinuation / weight-regain playbook; tournament buildability 7.3).

KEY CLAIMS THE CONCEPT CURRENTLY RESTS ON (these were surfaced by earlier research agents and MUST be independently verified — replace or drop any that cannot be confirmed against a real current source):
- Pew Research (early 2026): a large majority of US teens 13-17 have used AI chatbots, with roughly a third using them daily.
- A large majority of parents have NOT discussed AI companion use with their kids; ~8 in 10 parents want guardrails.
- Character.AI / Google settled multiple wrongful-death lawsuits, including the Sewell Setzer III case, around January 2026, unsealing internal records.
- California's SB 243 (2025) is among the first US laws regulating companion chatbots for minors.
- "The Anxious Generation" (Haidt, 2024) was a #1 NYT bestseller with 2M+ copies sold.
- Relevant comps: "Bad Therapy" (Shrier), "Behind Their Screens" (Weinstein & James), "Artificial Intimacy" (Turkle).`;

// ---------------- PHASE 1: GAUNTLET ----------------
phase('Gauntlet')

const SKEPTIC_SCHEMA = {
  type: 'object',
  properties: {
    assumptionTested: { type: 'string' },
    strongestCaseAgainst: { type: 'string' },
    whatResearchFound: { type: 'string' },
    verdict: { type: 'string', enum: ['assumption-holds', 'assumption-shaky', 'assumption-broken'] },
    severityIfWrong: { type: 'string', enum: ['fatal', 'serious', 'manageable'] },
    recommendedFix: { type: 'string' },
    sources: { type: 'array', items: { type: 'string' } },
  },
  required: ['assumptionTested', 'strongestCaseAgainst', 'whatResearchFound', 'verdict', 'severityIfWrong', 'recommendedFix', 'sources'],
}

const SKEPTICS = [
  { key: 'pain-overstated', assumption: 'The underlying reader pain is as acute and widespread as claimed. VERIFY the actual statistics on teen AI-chatbot/companion use (find the real Pew or comparable 2025-2026 numbers; do not trust the figures in the brief) and whether emotional dependency (not just homework help) is genuinely widespread. Try to prove the pain is niche or exaggerated.' },
  { key: 'market-flooded', assumption: 'The market lane is open and this book can own it. Try to prove the OPPOSITE: search hard for already-published or announced/forthcoming (2025-2027) trade books on kids and AI companions / AI and childhood / AI parenting. If a major competing book already exists, that is a serious problem. List every real competing/adjacent title you can find with pub dates and publishers.' },
  { key: 'not-a-book', assumption: 'This is a standalone book, not merely one chapter of a broader "kids and AI" or "kids and screens" book. Try to prove parents will NOT buy a whole single-topic book specifically about AI companions, and that the topic is too narrow or too fast-moving to sustain 80,000 words with durable value.' },
  { key: 'science-thin', assumption: 'The "attachment system, not attention system" thesis is backed by real developmental evidence. Try to prove the science is thin or speculative: is there actual peer-reviewed or credible evidence that AI companion use harms the developing attachment/social system differently from ordinary screen use? Verify what is genuinely established vs. what is journalistic speculation.' },
  { key: 'commercial-wont-transfer', assumption: 'The commercial thesis holds: the Anxious Generation buyer exists at scale and will transfer to this book. Try to prove tech-panic parenting is saturated, that The Anxious Generation was a one-off, or that the audience is fatigued. Verify the real sales/market facts for the comp category.' },
]

const skeptics = SKEPTICS.map(s => () =>
  agent(
    `You are a professional SKEPTIC and adversarial fact-checker hired to KILL a book concept before a publisher wastes money on it. Your default posture is doubt. Use WebSearch and WebFetch (current month: July 2026) to build the strongest possible evidence-based case AGAINST the concept on your assigned front.

ASSIGNED ASSUMPTION TO ATTACK: ${s.assumption}

Rules: Only cite real sources you actually retrieved (real URLs). If a claim in the brief cannot be verified, say so explicitly — that is a finding. Distinguish what is genuinely established from what is speculation. Be specific and quantitative. Then render an honest verdict on whether the assumption holds, is shaky, or is broken, how fatal it would be, and the single most important fix.

CONCEPT UNDER TEST:\n${CONCEPT_BRIEF}`,
    { label: `skeptic:${s.key}`, phase: 'Gauntlet', schema: SKEPTIC_SCHEMA }
  )
)

const EVIDENCE_SCHEMA = {
  type: 'object',
  properties: {
    topic: { type: 'string' },
    verifiedFindings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          detail: { type: 'string' },
          confidence: { type: 'string', enum: ['confirmed', 'partial', 'unconfirmed'] },
          sources: { type: 'array', items: { type: 'string' } },
        },
        required: ['claim', 'detail', 'confidence', 'sources'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['topic', 'verifiedFindings', 'summary'],
}

const EVIDENCE_TASKS = [
  { key: 'usage-and-demand', task: 'Verify and quantify the DEMAND/PAIN evidence for children and AI companion chatbots: real teen usage rates (Pew, Common Sense Media, or comparable, 2024-2026), share using companions specifically (Character.AI, Replika, etc.) vs. general AI, evidence of emotional dependency/attachment, parental awareness/concern surveys, and any relevant regulatory or platform data. Return hard numbers with real sources. Flag any figure you cannot confirm.' },
  { key: 'comps-and-market', task: 'Build the COMP-TITLE and MARKET-SIZE evidence: confirm real sales/list performance for "The Anxious Generation" (Haidt) and other tech-parenting comps (Bad Therapy, Stolen Focus, iGen, Behind Their Screens, Sherry Turkle titles); size the US parenting/self-help nonfiction market; and identify any 2025-2027 competing or forthcoming books on kids + AI. Return real sources and dates.' },
  { key: 'news-legal-timeline', task: 'Build a dated 2023-2026 TIMELINE of the AI-companion-and-minors story with real sources: the Sewell Setzer III / Character.AI litigation and any settlements, other wrongful-death or harm cases, California SB 243 and other legislation/regulation (FTC, state AGs), and major platform changes (Character.AI, Replika, Meta AI, OpenAI age policies). Each timeline entry needs a real source URL and a date.' },
]

const evidenceTasks = EVIDENCE_TASKS.map(e => () =>
  agent(
    `You are a meticulous research analyst building the evidence base for a book concept. Use WebSearch and WebFetch (current month: July 2026). Verify every fact against a real, current source and return real URLs. Where a commonly-cited figure cannot be confirmed, mark it unconfirmed rather than repeating it. Prefer primary/authoritative sources (Pew, Common Sense Media, court records, official bill text, publisher/BookScan-adjacent reporting, major outlets).

RESEARCH TASK: ${e.task}`,
    { label: `evidence:${e.key}`, phase: 'Gauntlet', schema: EVIDENCE_SCHEMA, model: 'sonnet' }
  )
)

const gauntlet = await parallel([...skeptics, ...evidenceTasks])
const skepticResults = gauntlet.slice(0, SKEPTICS.length).filter(Boolean)
const evidenceResults = gauntlet.slice(SKEPTICS.length).filter(Boolean)
const broken = skepticResults.filter(s => s.verdict === 'assumption-broken' && s.severityIfWrong === 'fatal')
log(`Gauntlet done. Skeptic verdicts: ${skepticResults.map(s => s.verdict).join(', ')}. Fatal breaks: ${broken.length}`)

// ---------------- PHASE 2: FINALIZE ----------------
phase('Finalize')
const FINALIZE_SCHEMA = {
  type: 'object',
  properties: {
    decision: { type: 'string', enum: ['GO', 'GO-WITH-REVISIONS', 'FALLBACK'] },
    decisionRationale: { type: 'string' },
    finalTitle: { type: 'string' },
    finalSubtitle: { type: 'string' },
    oneLinePitch: { type: 'string' },
    thesis: { type: 'string' },
    positioning: { type: 'string' },
    revisionsMade: { type: 'array', items: { type: 'string' } },
    correctedClaims: { type: 'array', items: { type: 'string' } },
    keyEvidenceToFeature: { type: 'array', items: { type: 'string' } },
    risksAndMitigations: { type: 'array', items: { type: 'string' } },
  },
  required: ['decision', 'decisionRationale', 'finalTitle', 'finalSubtitle', 'oneLinePitch', 'thesis', 'positioning', 'revisionsMade', 'correctedClaims', 'keyEvidenceToFeature', 'risksAndMitigations'],
}
const finalize = await agent(
  `You are the publisher/editorial director making the final GO / GO-WITH-REVISIONS / FALLBACK call on this book concept, having just received an adversarial skeptic panel and a verified evidence base. Be intellectually honest: if a fatal assumption broke, choose FALLBACK; if assumptions are shaky, choose GO-WITH-REVISIONS and fix them; only choose plain GO if the concept is genuinely strong. Incorporate corrected facts (drop or fix any claim the evidence could not confirm). Sharpen the title/subtitle/positioning using what survived. Produce a locked spec the build team will execute.

CONCEPT UNDER TEST:\n${CONCEPT_BRIEF}\n
SKEPTIC PANEL RESULTS:\n${JSON.stringify(skepticResults, null, 1)}\n
VERIFIED EVIDENCE BASE:\n${JSON.stringify(evidenceResults, null, 1)}`,
  { label: 'finalize-decision', phase: 'Finalize', schema: FINALIZE_SCHEMA }
)
log(`Decision: ${finalize.decision} — "${finalize.finalTitle}: ${finalize.finalSubtitle}"`)

// ---------------- PHASE 3: BUILD ----------------
phase('Build')
const specStr = JSON.stringify(finalize, null, 1)
const evidenceStr = JSON.stringify(evidenceResults, null, 1)
const skepticStr = JSON.stringify(skepticResults, null, 1)

const BUILD = [
  {
    key: 'concept-package',
    label: 'build:concept-dossier',
    prompt: `Write the definitive CONCEPT DOSSIER for this book as a polished Markdown document (no code fences). It must let a stranger fully understand and evaluate the concept. Include, with clear headings: the logline/one-line pitch; the elevator pitch (150 words); the central thesis and the "attachment not attention" reframe explained; who exactly this is for (with reader psychographics); the reader's pain in their own emotional terms; the promise/transformation; why this book, why now (with the verified 2026 facts and real sources cited inline); what makes it original vs. everything already on the shelf (a differentiation grid vs. named comps); the book's structure and argument arc (Parts I-III) at a high level; the franchise/extension potential; the author-platform profile this concept needs to win; and an honest risks-and-mitigations section drawn from the skeptic panel. Cite real sources inline as markdown links. Do not invent facts; use only the verified evidence and locked spec provided.`,
  },
  {
    key: 'market-evidence',
    label: 'build:market-evidence',
    prompt: `Write the MARKET EVIDENCE REPORT as a polished Markdown document (no code fences) — the validation dossier that proves this book has a market. Include: the size of the addressable audience (TAM/SAM with real numbers and sources); demand signals (usage stats, search/interest, parental concern surveys); the comp-title analysis (a table of real comparable books with publisher, year, and any verified sales/list data, plus what each proves about this book's market); a dated news/legal/regulatory timeline of the AI-companions-and-minors story (2023-2026) with sources; the competitive-landscape / white-space assessment (what exists, what's forthcoming, where the gap is); and a clear-eyed "risks to the market thesis" subsection. Every statistic must have a real source cited inline as a markdown link. If the evidence marked something unconfirmed, present it as unconfirmed — do not overstate.`,
  },
  {
    key: 'proposal',
    label: 'build:book-proposal',
    prompt: `Write a professional NONFICTION BOOK PROPOSAL package as polished Markdown (no code fences), following standard trade-proposal structure. Sections: (1) Overview / hook (2-3 pages of persuasive argument opening with a gripping lede); (2) About the Book (thesis, approach, tone, what makes it different); (3) The Market / Audience (who buys it, how big, cite real numbers); (4) Comparative Titles (5-7 real comps, each with a line on how this book is similar-but-different); (5) About the Author (a PROFILE of the ideal author platform this concept requires — since no author is attached, describe the credentials/platform a publisher would need, and note this openly); (6) Marketing & Publicity Plan (platform, launch, hooks, partnerships, the built-in news pegs); (7) Chapter Outline (brief); (8) Specs (word count, delivery, format). Persuasive but honest. Cite real facts as markdown links.`,
  },
  {
    key: 'toc-sample',
    label: 'build:toc-and-sample',
    prompt: `Write TWO things in one polished Markdown document (no code fences): (A) a full ANNOTATED TABLE OF CONTENTS — Parts I-III with ~12-15 chapters total, each chapter given a memorable title plus a 3-5 sentence annotation describing what it covers and the argument it advances (Part III chapters should preview the actual parent playbook/scripts); and (B) a SAMPLE — a ~1,600-2,000 word excerpt from the book's Introduction that demonstrates the voice, the narrative-plus-argument style, and the central reframe. The sample must be built only from PUBLIC, verifiable material (you may reference the real litigation, the real statistics from the evidence base, real regulation) — reconstruct nothing private and invent no quotes attributed to real named people. It should read like the opening of a major trade nonfiction book and make a browsing parent unable to put it down. Cite real facts where used.`,
  },
]

const builds = await parallel(BUILD.map(b => () =>
  agent(
    `${b.prompt}\n\nLOCKED CONCEPT SPEC (final decisions — follow these exactly):\n${specStr}\n\nVERIFIED EVIDENCE BASE (use ONLY these facts + the spec; cite the real source URLs):\n${evidenceStr}\n\nADVERSARIAL PANEL FINDINGS (address the real risks honestly):\n${skepticStr}\n\nReturn ONLY the finished Markdown document, ready to save to a file.`,
    { label: b.label, phase: 'Build' }
  ).then(md => ({ key: b.key, markdown: md }))
))
const validBuilds = builds.filter(Boolean)
log(`Build complete: ${validBuilds.map(b => b.key).join(', ')}`)

// ---------------- PHASE 4: CRITIC ----------------
phase('Critic')
const CRITIC_SCHEMA = {
  type: 'object',
  properties: {
    dodChecklist: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          requirement: { type: 'string' },
          status: { type: 'string', enum: ['met', 'partial', 'not-met'] },
          evidence: { type: 'string' },
        },
        required: ['requirement', 'status', 'evidence'],
      },
    },
    gaps: { type: 'array', items: { type: 'string' } },
    factualRisks: { type: 'array', items: { type: 'string' } },
    overallVerdict: { type: 'string' },
    readyToShip: { type: 'boolean' },
  },
  required: ['dodChecklist', 'gaps', 'factualRisks', 'overallVerdict', 'readyToShip'],
}
const packageStr = validBuilds.map(b => `\n\n===== ${b.key} =====\n${b.markdown}`).join('\n')
const critic = await agent(
  `You are a ruthless COMPLETENESS CRITIC performing the final review pass. The Definition of Done: "A stranger should be able to open the project folder, read the book concept package, review the generated pitch materials, understand the market evidence, and fully evaluate the book concept without needing any external assistance or explanations." Also required by the brief: every fact/stat/claim must be verified and cited (no inventing); the concept must be the strongest/most original/most commercially promising defensible option (not the safest).

Review the assembled package below. For each DoD requirement, mark met/partial/not-met with specific evidence. List concrete gaps a stranger would hit. Flag any factual claim that looks unsourced, internally inconsistent, or overstated (a "factual risk"). Give an overall verdict and a ready-to-ship boolean. Be specific and harsh — your job is to catch what's missing.

ASSEMBLED PACKAGE:\n${packageStr}`,
  { label: 'completeness-critic', phase: 'Critic' }
)
log(`Critic verdict: readyToShip=${critic.readyToShip}; ${critic.gaps.length} gaps flagged`)

return {
  skepticResults,
  evidenceResults,
  finalize,
  builds: validBuilds,
  critic,
}
