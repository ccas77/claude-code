// Seeds a CLEARLY-LABELED SAMPLE catalog so every command is runnable before
// the real pinfactory.db is wired in. Every title, author and pen name here is
// FICTIONAL placeholder data — none of it describes a real book. Replace by
// pointing TROPESITE_DB at your real catalog, or import real rows.
import { db, initSchema, run } from './db.mjs';
import { slugify } from './util.mjs';

const PEN_NAMES = [
  'Nadia Frost', 'Sasha Vane', 'Lena Cross', 'Ivy Marlow',
  'Poppy Reed', 'Mabel Quinn', 'Cora Bell', 'Della Hart',
];

const SUBGENRES = [
  ['Dark Romance', 'Romance with morally grey characters, high stakes and intense conflict; often explicit and heavy on content warnings.'],
  ['Contemporary Romance', 'Present-day love stories centered on relationships, banter and emotional growth, from sweet to steamy.'],
  ['Paranormal Romance', 'Romance featuring supernatural elements — shifters, vampires, fae — alongside the central love story.'],
  ['Romantic Suspense', 'Romance braided with danger, mystery or thriller-style tension.'],
];

const TROPES = [
  ['Enemies to Lovers', 'Two characters who begin as adversaries and, through forced contact and shifting stakes, fall for each other.'],
  ['Grumpy/Sunshine', 'A guarded, irritable character is drawn to a warm, optimistic one; opposites soften each other.'],
  ['Second Chance', 'Former partners reunite and confront old wounds for another shot at love.'],
  ['Forced Proximity', 'Circumstances trap two characters together — one bed, one cabin, one job — accelerating intimacy.'],
  ['Fake Dating', 'A pretend relationship, staged for convenience, becomes real.'],
  ['Marriage of Convenience', 'A practical or contractual marriage grows into genuine attachment.'],
  ['Morally Grey Hero', 'A love interest who operates by his own code, capable of ruthlessness and tenderness alike.'],
  ['Small Town', 'A tight-knit town setting where community, history and gossip shape the romance.'],
];

// [title, penIndex, subgenreName, [tropeNames], heat, notes, asin]
const BOOKS = [
  ['Ashes of the Crown', 0, 'Dark Romance', ['Enemies to Lovers', 'Morally Grey Hero', 'Forced Proximity'], 'Explicit', 'Violence, captivity themes, on-page spice.', 'B0SAMPLE01'],
  ['Velvet Cage', 0, 'Dark Romance', ['Enemies to Lovers', 'Morally Grey Hero'], 'Explicit', 'Dubious consent themes, dark themes.', 'B0SAMPLE02'],
  ["The Bratva's Bargain", 1, 'Dark Romance', ['Marriage of Convenience', 'Morally Grey Hero', 'Enemies to Lovers'], 'Explicit', 'Organized-crime setting, violence.', 'B0SAMPLE03'],
  ['Cruel Sanctuary', 1, 'Dark Romance', ['Enemies to Lovers', 'Forced Proximity'], 'Explicit', 'Kidnapping premise, on-page spice.', 'B0SAMPLE04'],
  ['Midnight Debt', 2, 'Dark Romance', ['Enemies to Lovers', 'Second Chance'], 'Steamy', 'Debt/coercion premise.', 'B0SAMPLE05'],
  ['Thorne & Ruin', 2, 'Dark Romance', ['Enemies to Lovers', 'Morally Grey Hero'], 'Explicit', 'Revenge plot, violence.', 'B0SAMPLE06'],
  ['Frostbite Kingdom', 3, 'Paranormal Romance', ['Enemies to Lovers', 'Forced Proximity'], 'Steamy', 'Shifter fantasy setting.', 'B0SAMPLE07'],
  ['Sunny Side Up', 4, 'Contemporary Romance', ['Grumpy/Sunshine', 'Small Town', 'Forced Proximity'], 'Steamy', 'Low angst, HEA.', 'B0SAMPLE08'],
  ['The Grump Next Door', 4, 'Contemporary Romance', ['Grumpy/Sunshine', 'Forced Proximity'], 'Steamy', 'Neighbors, banter-heavy.', 'B0SAMPLE09'],
  ['Coffee & Consequences', 5, 'Contemporary Romance', ['Grumpy/Sunshine', 'Fake Dating'], 'Sweet', 'Closed door, workplace.', 'B0SAMPLE10'],
  ['Snowed In With Mr. Wrong', 5, 'Contemporary Romance', ['Grumpy/Sunshine', 'Forced Proximity', 'Fake Dating'], 'Steamy', 'Holiday, one-bed.', 'B0SAMPLE11'],
  ['Lighthouse Point', 6, 'Contemporary Romance', ['Grumpy/Sunshine', 'Small Town', 'Second Chance'], 'Sweet', 'Seaside, slow burn.', 'B0SAMPLE12'],
  ["The Baker's Grump", 6, 'Contemporary Romance', ['Grumpy/Sunshine', 'Small Town'], 'Sweet', 'Foodie, closed door.', 'B0SAMPLE13'],
  ['Second Chance Ranch', 7, 'Contemporary Romance', ['Second Chance', 'Small Town', 'Grumpy/Sunshine'], 'Steamy', 'Cowboy, reunion.', 'B0SAMPLE14'],
  ['Fake It Till You Bake It', 7, 'Contemporary Romance', ['Fake Dating', 'Grumpy/Sunshine'], 'Steamy', 'Competition, banter.', 'B0SAMPLE15'],
  ['Rival Hearts', 3, 'Contemporary Romance', ['Enemies to Lovers', 'Grumpy/Sunshine'], 'Steamy', 'Workplace rivals.', 'B0SAMPLE16'],
];

// [title, author, [tropeNames], status, asin, factual_description, proposed_reason]
const COMPS = [
  ['The Winter Vow', 'A. R. Sloane', ['Enemies to Lovers', 'Marriage of Convenience'], 'approved', 'B0COMP0001',
    'A contracted royal marriage between rival houses that thaws into love over a long winter. (SAMPLE placeholder description — confirm real facts before launch.)',
    'Shares enemies-to-lovers + marriage-of-convenience with several of your dark titles.'],
  ['Gilded Ruin', 'Marisa Kohl', ['Enemies to Lovers', 'Morally Grey Hero'], 'approved', 'B0COMP0002',
    'A heist-driven dark romance with a ruthless anti-hero and a heroine who refuses to break. (SAMPLE placeholder — confirm facts.)',
    'Strong morally-grey-hero overlap with Thorne & Ruin and Velvet Cage.'],
  ['Paper Crowns', 'Devon Ash', ['Enemies to Lovers'], 'approved', 'B0COMP0003',
    'Two political rivals forced to campaign together find the line between loathing and longing blurring. (SAMPLE placeholder — confirm facts.)',
    'Popular enemies-to-lovers comp readers search for.'],
  ['Grumpy in Aisle Five', 'Tess Bright', ['Grumpy/Sunshine', 'Small Town'], 'approved', 'B0COMP0004',
    'A sour small-town shopkeeper and a relentlessly cheerful newcomer clash and then click. (SAMPLE placeholder — confirm facts.)',
    'Direct grumpy/sunshine small-town match for your contemporary list.'],
  ['The Sunshine Clause', 'Holly Marsh', ['Grumpy/Sunshine', 'Fake Dating'], 'approved', 'B0COMP0005',
    'A brooding lawyer fake-dates his sunny paralegal to win a case. (SAMPLE placeholder — confirm facts.)',
    'Grumpy/sunshine + fake-dating overlap with Coffee & Consequences.'],
  ['Storm & Stone', 'Ree Calloway', ['Enemies to Lovers', 'Forced Proximity'], 'approved', 'B0COMP0006',
    'Stranded rivals on a research expedition must survive — and each other. (SAMPLE placeholder — confirm facts.)',
    'Forced-proximity enemies-to-lovers, pairs with Cruel Sanctuary.'],
  ['Honey & Thorns', 'Juno Pace', ['Grumpy/Sunshine'], 'approved', 'B0COMP0007',
    'A prickly beekeeper and a bright florist share a market stall and, eventually, a life. (SAMPLE placeholder — confirm facts.)',
    'Clean grumpy/sunshine comp with broad appeal.'],
  ['The Debt We Owe', 'Kian Rho', ['Enemies to Lovers', 'Morally Grey Hero'], 'proposed', 'B0COMP0008',
    '', 'Proposed for the dark enemies-to-lovers hub; awaiting your factual description + approval.'],
  ['Reckless Vows', 'Sable Wynn', ['Marriage of Convenience'], 'proposed', 'B0COMP0009',
    '', 'Proposed for marriage-of-convenience coverage; awaiting approval.'],
  ['Bright Little Liar', 'Tam Odell', ['Fake Dating'], 'rejected', 'B0COMP0010',
    '', 'Rejected in review (kept for audit trail / do-not-repropose).'],
];

export function seed() {
  initSchema();
  const d = db();
  // Idempotent: clear catalog tables (keep meta).
  for (const t of ['page_entries', 'pages', 'comp_tropes', 'comps', 'book_tropes', 'books', 'tropes', 'subgenres', 'pen_names']) {
    d.exec(`DELETE FROM ${t};`);
  }

  const penId = {};
  PEN_NAMES.forEach((n, i) => {
    run('INSERT INTO pen_names(id,name,is_mine,bio) VALUES(?,?,1,?)', i + 1, n, `Sample pen name #${i + 1} (placeholder).`);
    penId[i] = i + 1;
  });

  const subId = {};
  SUBGENRES.forEach(([name, desc], i) => {
    run('INSERT INTO subgenres(id,name,slug,description) VALUES(?,?,?,?)', i + 1, name, slugify(name), desc);
    subId[name] = i + 1;
  });

  const tropeId = {};
  TROPES.forEach(([name, desc], i) => {
    run('INSERT INTO tropes(id,name,slug,description) VALUES(?,?,?,?)', i + 1, name, slugify(name), desc);
    tropeId[name] = i + 1;
  });

  BOOKS.forEach((b, i) => {
    const [title, pen, sub, tropes, heat, notes, asin] = b;
    const id = i + 1;
    run(
      `INSERT INTO books(id,title,pen_name_id,subgenre_id,blurb,heat_level,content_notes,asin,cover_asin,published_year,is_mine)
       VALUES(?,?,?,?,?,?,?,?,?,?,1)`,
      id, title, penId[pen], subId[sub],
      `SAMPLE blurb for “${title}”. This placeholder stands in for your real back-cover copy; import your true blurbs so the content engine drafts from genuine metadata.`,
      heat, notes, asin, asin, 2024
    );
    for (const tn of tropes) run('INSERT INTO book_tropes(book_id,trope_id) VALUES(?,?)', id, tropeId[tn]);
  });

  COMPS.forEach((c, i) => {
    const [title, author, tropes, status, asin, desc, reason] = c;
    const id = i + 1;
    run(
      `INSERT INTO comps(id,title,author,asin,factual_description,status,proposed_reason,approved_at)
       VALUES(?,?,?,?,?,?,?,?)`,
      id, title, author, asin, desc || null, status, reason,
      status === 'approved' ? '2026-01-01' : null
    );
    for (const tn of tropes) run('INSERT INTO comp_tropes(comp_id,trope_id) VALUES(?,?)', id, tropeId[tn]);
  });

  return {
    penNames: PEN_NAMES.length,
    subgenres: SUBGENRES.length,
    tropes: TROPES.length,
    books: BOOKS.length,
    comps: COMPS.length,
  };
}
