// Deploy helper. Static output in dist/ deploys to Cloudflare Pages or Vercel.
// This command runs the audit gate first (nothing deploys that fails), then
// prints/executes the deploy for the configured target. It shells out to the
// provider CLI only if present; otherwise it prints exact copy-paste steps.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { config } from './config.mjs';
import { audit } from './audit.mjs';

export function deploy({ target = process.env.DEPLOY_TARGET || 'cloudflare', dryRun = false } = {}) {
  if (!fs.existsSync(config.distDir)) {
    console.error('No build found. Run `tropesite build` first.');
    process.exitCode = 1; return;
  }
  console.log('Running audit gate before deploy…');
  const res = audit();
  if (!res.ok) {
    console.error('\nDeploy blocked: audit failed. Fix issues and re-run.');
    process.exitCode = 1; return;
  }

  const dist = config.distDir;
  if (target === 'cloudflare') {
    const cmd = ['wrangler', ['pages', 'deploy', dist, '--project-name', process.env.CF_PAGES_PROJECT || 'tropesite']];
    if (dryRun || !hasBin('wrangler')) {
      console.log('\nCloudflare Pages deploy:');
      console.log('  npm i -g wrangler && wrangler login');
      console.log(`  wrangler pages deploy ${dist} --project-name ${process.env.CF_PAGES_PROJECT || 'tropesite'}`);
      return;
    }
    run(...cmd);
  } else if (target === 'vercel') {
    if (dryRun || !hasBin('vercel')) {
      console.log('\nVercel deploy:');
      console.log('  npm i -g vercel && vercel login');
      console.log(`  vercel deploy --prebuilt ${dist}   (or point a Vercel project at this repo; output dir = dist)`);
      return;
    }
    run('vercel', ['deploy', '--prod', dist]);
  } else {
    console.error(`Unknown deploy target "${target}" (use cloudflare|vercel).`);
    process.exitCode = 1;
  }
}

function hasBin(bin) {
  try { execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' }); return true; }
  catch { return false; }
}
function run(bin, args) {
  console.log(`\n$ ${bin} ${args.join(' ')}`);
  execFileSync(bin, args, { stdio: 'inherit' });
}
