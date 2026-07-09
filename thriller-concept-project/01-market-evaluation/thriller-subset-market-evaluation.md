# Thriller Subset Market Evaluation

**Question:** Of the 15 major thriller subgenres, which offers the strongest *realistic* revenue potential for a **solo indie author** — no platform, no institutional access, modest budget, AI-assisted drafting?

**Method:** Five parallel research agents scored the current (2024–2026) indie-commercial signals of all 15 subsets; a synthesis agent scored each on eight weighted criteria; three adversarial skeptic agents then attacked the top result. This document reports the scoring. The adversarial challenge and the final refined decision are in `skeptic-and-reconciliation.md`. Raw agent outputs and all source URLs are in `../research-data/`.

---

## The scoring model

Each subgenre was scored 1–10 on eight criteria. Because indie economics live or die on read-through and on whether *one person* can actually produce the book, three criteria were up-weighted:

| Criterion | Weight | Why |
|---|---|---|
| Revenue potential | ×2 | The whole point; captures KU page-reads + sales + audio/print stack |
| Buildability (solo) | ×1.5 | Research burden, production scope, craft difficulty for one author |
| Series potential | ×1.5 | Read-through is the master lever of indie fiction income |
| Reader demand | ×1 | Category size, bestseller velocity, KU presence |
| Genre fit | ×1 | How cleanly it sits in a browsable, marketable category |
| Discoverability | ×1 | Ease of ranking / organic (esp. BookTok) discovery |
| Originality opportunity | ×1 | White space for a newcomer with no brand |
| Low gatekeeper dependence | ×1 | Freedom from celebrity platform, institutional access, expensive production |

---

## Results — all 15 subgenres ranked

| # | Subgenre | Demand | Revenue | Fit | Series | Discover | Original | Build | LowGate | **Weighted** |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Romantic-suspense / thriller-romance** | 9 | 9 | 9 | 9 | 8 | 7 | 8 | 10 | **8.7** |
| 2 | Espionage | 9 | 8 | 8 | 9 | 7 | 7 | 8 | 8 | **8.1** |
| 3 | Legal | 8 | 8 | 8 | 9 | 7 | 7 | 8 | 9 | **8.1** |
| 4 | Domestic | 9 | 8 | 9 | 6 | 6 | 6 | 10 | 10 | **8.0** |
| 5 | Crime | 9 | 8 | 9 | 9 | 6 | 6 | 7 | 10 | **8.0** |
| 6 | Small-town | 8 | 7 | 9 | 7 | 6 | 8 | 9 | 10 | **7.9** |
| 7 | Action | 8 | 7 | 8 | 9 | 6 | 6 | 8 | 10 | **7.8** |
| 8 | Psychological | 10 | 7 | 9 | 6 | 5 | 6 | 9 | 10 | **7.7** |
| 9 | Conspiracy | 7 | 7 | 8 | 8 | 6 | 8 | 8 | 9 | **7.6** |
| 10 | Serial-killer | 7 | 6 | 7 | 8 | 4 | 6 | 5 | 8 | **6.3** |
| 11 | Gothic suspense | 6 | 5 | 6 | 6 | 6 | 8 | 5 | 9 | **6.2** |
| 12 | Techno | 6 | 5 | 6 | 6 | 6 | 8 | 4 | 5 | **5.6** |
| 13 | Political | 6 | 5 | 5 | 6 | 4 | 6 | 5 | 5 | **5.2** |
| 14 | Medical | 6 | 5 | 5 | 6 | 5 | 7 | 4 | 4 | **5.2** |
| 15 | Locked-room | 7 | 4 | 5 | 4 | 3 | 6 | 4 | 5 | **4.6** |

*(Per-subgenre justifications and evidence are in `../research-data/eval-matrix.json` and `../research-data/subset-research.json`.)*

---

## What the numbers say

**The top cluster (7.6–8.7) is tight.** Eight subgenres score within ~1.1 points. That is itself a finding: for a disciplined solo author, *several* thriller lanes are viable, and execution matters more than lane choice at the margin. The bottom cluster is where the real disqualifiers live.

**Why the bottom four fall out (revenue-weighted):**
- **Locked-room (4.6):** Beloved but structurally *anti-series* — each book is a fresh closed-circle puzzle, resetting reader acquisition every time. Weakest read-through, lowest revenue score. A trad-standalone format (Foley, Ware), not an indie read-through engine.
- **Medical (5.2) & Techno (5.6):** High **gatekeeper/expertise dependence** — credible medical or technical detail is a research/authority tax a newcomer pays every book, and readers punish inaccuracy. Low buildability for a solo author without the domain.
- **Political (5.2):** Narrow, polarizing, topical (dates fast), and dominated by platform-driven trad names. Poor organic discovery.

**Why the winners win:** the highest-weighted lanes all combine **strong demand + low gatekeeper dependence + genuine series/read-through potential**. Romantic-suspense topped the raw score because it sits on the single largest, most KU-native, most binge-prone indie readership in existence (romance), while a thriller hook supplies the propulsive plot.

---

## The headline result — and the critical caveat

**Raw winner: Romantic-suspense / thriller-romance crossover (8.7).**
**Runner-up: Espionage (8.1), tied with Legal (8.1).**

But this raw winner **did not survive adversarial testing in its literal form.** All three skeptic agents independently attacked the *two-genre crossover* framing and found the same fatal flaw: a true romance×thriller crossover imposes a **dual-craft tax** (mastering romance beats *and* thriller pacing, intertwined, every book) and a **discoverability trap** (Amazon has no native crossover category; the also-bought engine rewards single-niche coherence and punishes "not what I expected" mis-shelving). For a solo author, that is the *opposite* of buildable.

The reconciliation did **not** retreat to the runner-up. It kept the demand insight that made romantic-suspense win — readers want *desire and danger* — but delivered it through **one craft** the author actually masters. See `skeptic-and-reconciliation.md` for the full resolution and the final chosen position: the **"Obsession Thriller."**

---

## Sources (representative — full lists in `../research-data/`)

- K-lytics — Psychological Thrillers genre report: https://k-lytics.com/psychological-thrillers/
- K-lytics — Mystery, Thriller & Suspense report: https://k-lytics.com/product/k-lytics-report-mystery-thriller-suspense/
- Written Word Media — 2025 Indie Author Survey: https://www.writtenwordmedia.com/2025-indie-author-survey-results-insights-into-self-publishing-for-authors/
- Amazon Best Sellers — Romantic Suspense node: https://www.amazon.com/Best-Sellers-Romantic-Suspense/zgbs/books/13389
- Amazon Best Sellers — Psychological Thrillers node: https://www.amazon.com/Best-Sellers-Psychological-Thrillers/zgbs/books/10491
- Self-Publishing's Share of the Kindle Market by Genre — Edward W. Robertson: http://edwardwrobertson.com/self-publishing/self-publishings-share-of-the-kindle-market-by-genre/
- Writers of the West — What Genre Sells the Most (2025/26 trends): https://writersofthewest.net/blog/what-genre-of-book-sells-the-most-in-2025-trends-data-what-it-means-for-authors/
