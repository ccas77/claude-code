#!/usr/bin/env node
// tropesite CLI. Zero runtime dependencies.
//   Requires Node >= 22.5 (built-in node:sqlite) run with --experimental-sqlite,
//   which this shim re-execs itself with if needed.
import { spawnSync } from 'node:child_process';

// Re-exec with the SQLite flag + warning suppression if not already set.
if (!process.env.__TROPESITE_REEXEC) {
  const r = spawnSync(
    process.execPath,
    ['--experimental-sqlite', '--no-warnings=ExperimentalWarning', ...process.argv.slice(1)],
    { stdio: 'inherit', env: { ...process.env, __TROPESITE_REEXEC: '1' } }
  );
  process.exit(r.status ?? 1);
}

const [cmd, ...rest] = process.argv.slice(2);

// Tiny flag parser: --key value | --key=value | --flag
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) out[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i];
      else out[a.slice(2)] = true;
    } else out._.push(a);
  }
  return out;
}
const args = parseArgs(rest);

function help() {
  console.log(`
tropesite — trope-based book recommendation site generator

Usage: tropesite <command> [options]

Setup & data
  seed                      Load the sample catalog (idempotent). Placeholder data.
  plan                      Show the proposed page list (does not generate).

Comps (comp-title intake/approval)
  comps list [--status s]   List comps (proposed|approved|rejected).
  comps review              Show trope inventory gaps + comps awaiting action.
  comps add --title T --author A --tropes "X,Y" [--asin ASIN] [--desc "…"]
  comps approve <id> --desc "one or two true sentences"   (description required)
  comps reject <id>
  comps propose --trope <slug>   Ask the engine to propose candidates (needs API key).

Content
  generate [--pilot] [--changed] [--limit N]    Draft page content.
                                                --pilot = 10 pages across 2 tropes.
                                                --changed = only redraft changed pages.

Build & ship
  review [--port 4321]      Preview the built site locally.
  build [--no-images]       Render the static site to dist/.
  audit                     Compliance + crawlability + schema + link report.
  deploy [--target cloudflare|vercel] [--dry-run]

Docs: see SETUP.md and README.md.
`);
}

async function main() {
  const { seed } = await import('../src/seed.mjs');
  const { dbExists } = await import('../src/db.mjs');

  switch (cmd) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      help(); break;

    case 'seed': {
      const stats = seed();
      console.log(`Seeded sample catalog: ${stats.penNames} pen names, ${stats.books} books, ${stats.subgenres} subgenres, ${stats.tropes} tropes, ${stats.comps} comps.`);
      console.log(`(Placeholder data — point TROPESITE_DB at your real pinfactory.db to replace.)`);
      console.log(`Next: tropesite plan`);
      break;
    }

    case 'plan': {
      requireDb(dbExists);
      const { printPlan } = await import('../src/plan.mjs');
      printPlan();
      break;
    }

    case 'comps': {
      requireDb(dbExists);
      const c = await import('../src/comps.mjs');
      const sub = args._[0];
      if (sub === 'list') c.listComps(args.status);
      else if (sub === 'review') { const { config } = await import('../src/config.mjs'); c.reviewGaps(config.minBooksPerPage); }
      else if (sub === 'add') c.addComp({ title: args.title, author: args.author, tropes: splitList(args.tropes), asin: args.asin, retailer_url: args['retailer-url'], description: args.desc, reason: args.reason });
      else if (sub === 'approve') c.approveComp(Number(args._[1]), args.desc);
      else if (sub === 'reject') c.rejectComp(Number(args._[1]));
      else if (sub === 'propose') { const { ContentEngine } = await import('../src/content-engine.mjs'); await c.proposeComps(args.trope, { engine: new ContentEngine() }); }
      else { console.error('Unknown comps subcommand. See `tropesite help`.'); process.exitCode = 1; }
      break;
    }

    case 'generate': {
      requireDb(dbExists);
      const { generate } = await import('../src/generate.mjs');
      await generate({ changed: !!args.changed, pilot: !!args.pilot, limit: Number(args.limit || 10), noImages: !!args['no-images'] });
      break;
    }

    case 'build': {
      requireDb(dbExists);
      const { build } = await import('../src/build.mjs');
      build({ noImages: !!args['no-images'] });
      break;
    }

    case 'review': {
      const { review } = await import('../src/review.mjs');
      review({ port: Number(args.port || 4321) });
      break;
    }

    case 'audit': {
      const { audit } = await import('../src/audit.mjs');
      audit();
      break;
    }

    case 'deploy': {
      const { deploy } = await import('../src/deploy.mjs');
      deploy({ target: args.target, dryRun: !!args['dry-run'] });
      break;
    }

    default:
      console.error(`Unknown command "${cmd}". Run \`tropesite help\`.`);
      process.exitCode = 1;
  }
}

function requireDb(dbExists) {
  if (!dbExists()) {
    console.error('No catalog database found. Run `tropesite seed` (sample data) or set TROPESITE_DB to your catalog.');
    process.exit(1);
  }
}
function splitList(s) { return s ? String(s).split(',').map((x) => x.trim()).filter(Boolean) : []; }

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
