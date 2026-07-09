// Comp-title intake & approval flow.
//
// Guardrails (from the brief):
//  - A comp's ONLY usable prose is its human-confirmed `factual_description`.
//  - Approval REQUIRES a non-empty factual description — you cannot approve a
//    comp the site would then have nothing truthful to say about.
//  - The engine may PROPOSE comps, but proposals land as status='proposed' and
//    never appear on the site until explicitly approved.
import { all, get, run } from './db.mjs';
import { getTropes, getComps, getComp } from './catalog.mjs';
import { slugify } from './util.mjs';

export function listComps(status) {
  const comps = getComps(status);
  if (!comps.length) { console.log(`(no comps${status ? ` with status ${status}` : ''})`); return; }
  for (const c of comps) {
    const tr = c.tropes.map((t) => t.name).join(', ');
    console.log(`#${c.id} [${c.status}] “${c.title}” — ${c.author}`);
    console.log(`     tropes: ${tr || '(none)'}`);
    if (c.proposed_reason) console.log(`     reason: ${c.proposed_reason}`);
    if (c.factual_description) console.log(`     desc:   ${c.factual_description}`);
    else console.log(`     desc:   (none — required before approval)`);
  }
}

// Add a comp in 'proposed' state. tropes = array of trope slugs or names.
export function addComp({ title, author, tropes = [], asin = null, retailer_url = null, description = null, reason = null }) {
  if (!title || !author) throw new Error('addComp requires --title and --author');
  const existing = get('SELECT id FROM comps WHERE title=? AND author=?', title, author);
  if (existing) throw new Error(`comp already exists (#${existing.id})`);
  const res = run(
    `INSERT INTO comps(title,author,asin,retailer_url,factual_description,status,proposed_reason)
     VALUES(?,?,?,?,?, 'proposed', ?)`,
    title, author, asin, retailer_url, description || null, reason || null
  );
  const compId = Number(res.lastInsertRowid);
  linkTropes(compId, tropes);
  console.log(`Added comp #${compId} “${title}” — ${author} (proposed).`);
  return compId;
}

function linkTropes(compId, tropes) {
  const byKey = new Map();
  for (const t of getTropes()) { byKey.set(t.slug, t.id); byKey.set(t.name.toLowerCase(), t.id); }
  for (const raw of tropes) {
    const key = slugify(raw);
    const id = byKey.get(key) || byKey.get(String(raw).toLowerCase());
    if (!id) { console.warn(`  ! unknown trope "${raw}" — skipped`); continue; }
    run('INSERT OR IGNORE INTO comp_tropes(comp_id,trope_id) VALUES(?,?)', compId, id);
  }
}

// Approve a comp — REQUIRES a factual description (either already stored or passed now).
export function approveComp(id, description) {
  const c = get('SELECT * FROM comps WHERE id=?', id);
  if (!c) throw new Error(`no comp #${id}`);
  const desc = (description ?? c.factual_description ?? '').trim();
  if (!desc) {
    throw new Error(
      `Cannot approve comp #${id}: a human-confirmed factual description is required.\n` +
      `  Re-run: tropesite comps approve ${id} --desc "One or two true sentences about the book."`
    );
  }
  run(
    `UPDATE comps SET status='approved', factual_description=?, approved_at=date('now') WHERE id=?`,
    desc, id
  );
  console.log(`Approved comp #${id} “${c.title}”.`);
}

export function rejectComp(id) {
  const c = get('SELECT * FROM comps WHERE id=?', id);
  if (!c) throw new Error(`no comp #${id}`);
  run(`UPDATE comps SET status='rejected' WHERE id=?`, id);
  console.log(`Rejected comp #${id} “${c.title}”.`);
}

// Show tropes whose inventory is thin — where new approved comps would unlock or
// strengthen a hub page. This is the signal for what to propose next.
export function reviewGaps(min) {
  console.log(`\n=== Comp intake — trope inventory review ===\n`);
  for (const t of getTropes()) {
    const mine = get('SELECT COUNT(*) n FROM book_tropes WHERE trope_id=?', t.id).n;
    const approved = get(`SELECT COUNT(*) n FROM comp_tropes ct JOIN comps c ON c.id=ct.comp_id WHERE ct.trope_id=? AND c.status='approved'`, t.id).n;
    const proposed = get(`SELECT COUNT(*) n FROM comp_tropes ct JOIN comps c ON c.id=ct.comp_id WHERE ct.trope_id=? AND c.status='proposed'`, t.id).n;
    const total = mine + approved;
    const flag = total < min ? `  ⟵ below hub threshold (${min}); approve comps to unlock` : '';
    console.log(`  ${t.name}: mine ${mine} + approved comps ${approved} = ${total}${flag}` + (proposed ? `   [${proposed} proposed awaiting review]` : ''));
  }
  const pending = getComps('proposed');
  if (pending.length) {
    console.log(`\nProposed comps awaiting your approval/rejection:`);
    for (const c of pending) {
      console.log(`  #${c.id} “${c.title}” — ${c.author}  [${c.tropes.map((x) => x.name).join(', ')}]`);
      console.log(`      approve: tropesite comps approve ${c.id} --desc "…"    reject: tropesite comps reject ${c.id}`);
    }
  }
  console.log('');
}

// Optional: use the content engine to PROPOSE comp candidates for a trope.
// Proposals are inserted as 'proposed' with an empty description (you must add a
// factual description at approval). Requires ANTHROPIC_API_KEY; otherwise prints
// guidance for manual entry. Never auto-approves; never writes descriptions.
export async function proposeComps(tropeSlug, { engine }) {
  const t = getTropes().find((x) => x.slug === tropeSlug || slugify(x.name) === slugify(tropeSlug));
  if (!t) throw new Error(`unknown trope "${tropeSlug}"`);
  if (!engine.available()) {
    console.log(
      `No ANTHROPIC_API_KEY set, so automated comp proposal is off.\n` +
      `Add comps manually:\n` +
      `  tropesite comps add --title "Title" --author "Author" --tropes "${t.name}" --asin ASIN\n` +
      `then confirm facts and approve:\n` +
      `  tropesite comps approve <id> --desc "One or two true sentences."`
    );
    return;
  }
  const names = await engine.proposeCompTitles(t);
  let n = 0;
  for (const cand of names) {
    const exists = get('SELECT id FROM comps WHERE title=? AND author=?', cand.title, cand.author);
    if (exists) continue;
    addComp({ title: cand.title, author: cand.author, tropes: [t.name], reason: cand.reason || `Proposed for ${t.name}.` });
    n++;
  }
  console.log(`\nProposed ${n} candidate comp(s) for “${t.name}”. NONE are live yet.`);
  console.log(`Review each, confirm a factual description, and approve the ones you want:`);
  console.log(`  tropesite comps review`);
}
