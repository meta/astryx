// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `pnpm api:report`: write, check, or compare the published packages' API reports.
 *
 * @input  the built published packages (run `pnpm build` first)
 * @output `<package>/api-report.md` for each published package; with
 *         `--changes`, `api-changes.md` and `api-changes.json` comparing the
 *         reports generated from this build with those committed at `--base`
 * @position scripts/api-report — the command behind
 *           architecture:public-component-api INV24
 *
 * Usage:
 *   pnpm api:report                      write every published package's report
 *   pnpm api:report --package core       write one (name, short name, or directory)
 *   pnpm api:report --check              exit 1 when a committed report is stale
 *   node scripts/api-report/cli.mjs --changes --base <ref> [--out <dir>]
 *                                        CI: write the API changes; always exits 0
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeChanges, renderChanges} from './changes.mjs';
import {generateReport} from './generate.mjs';

export const REPORT_FILE = 'api-report.md';
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const PACKAGE_PARENTS = ['packages', 'packages/themes'];

/**
 * Every published workspace package: not private, with an `exports` map.
 * @param {string} repoRoot
 * @returns {Array<{name: string, dir: string}>}
 */
export function publishedPackages(repoRoot) {
  const out = [];
  for (const parent of PACKAGE_PARENTS) {
    const abs = path.join(repoRoot, parent);
    if (!fs.existsSync(abs)) continue;
    for (const ent of fs.readdirSync(abs, {withFileTypes: true})) {
      const manifest = path.join(abs, ent.name, 'package.json');
      if (!ent.isDirectory() || !fs.existsSync(manifest)) continue;
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (pkg.private || !pkg.exports) continue;
      out.push({name: pkg.name, dir: `${parent}/${ent.name}`});
    }
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function parseArgs(argv) {
  const args = {
    check: false,
    changes: false,
    base: null,
    out: '.',
    package: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') args.check = true;
    else if (a === '--changes') args.changes = true;
    else if (a === '--base') args.base = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--package') args.package = argv[++i];
    else throw new Error(`Unknown option: ${a}`);
  }
  return args;
}

function select(packages, wanted) {
  if (!wanted) return packages;
  const dir = path
    .relative(REPO_ROOT, path.resolve(process.cwd(), wanted))
    .split(path.sep)
    .join('/');
  const hit = packages.filter(
    p =>
      p.name === wanted ||
      p.name === `@astryxdesign/${wanted}` ||
      p.dir === wanted ||
      p.dir === dir,
  );
  if (!hit.length) throw new Error(`Not a published package: ${wanted}`);
  return hit;
}

/** Files an entry point names that the build has not produced. */
function unbuilt(dir) {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, dir, 'package.json'), 'utf8'),
  );
  const missing = [];
  const visit = t => {
    if (typeof t === 'string') {
      // A subpath pattern needs its directory; which files match is reported.
      const target = t.includes('*') ? path.dirname(t) : t;
      if (!fs.existsSync(path.join(REPO_ROOT, dir, target)))
        missing.push(`${dir}/${t.replace(/^\.\//, '')}`);
    } else if (t && typeof t === 'object') Object.values(t).forEach(visit);
  };
  visit(pkg.exports);
  return missing;
}

function showAt(ref, file) {
  try {
    return execFileSync('git', ['show', `${ref}:${file}`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packages = select(publishedPackages(REPO_ROOT), args.package);

  const missing = packages.flatMap(p => unbuilt(p.dir));
  if (missing.length && !args.changes) {
    console.error(
      `Build the packages first (pnpm build). Missing:\n  ${missing.join('\n  ')}`,
    );
    process.exit(1);
  }

  const results = [];
  for (const p of packages) {
    const file = `${p.dir}/${REPORT_FILE}`;
    const head = await generateReport({repoRoot: REPO_ROOT, packageDir: p.dir});
    const abs = path.join(REPO_ROOT, file);
    const committed = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    results.push({pkg: p.name, file, head, committed});
  }

  if (args.changes) {
    const changes = computeChanges(
      results.map(r => ({
        pkg: r.pkg,
        head: r.head,
        committed: r.committed,
        base: args.base ? showAt(args.base, r.file) : r.committed,
      })),
    );
    fs.mkdirSync(args.out, {recursive: true});
    fs.writeFileSync(
      path.join(args.out, 'api-changes.md'),
      renderChanges(changes),
    );
    fs.writeFileSync(
      path.join(args.out, 'api-changes.json'),
      JSON.stringify({version: 1, packages: changes}, null, 2) + '\n',
    );
    const total = changes.reduce((n, c) => n + c.rows.length, 0);
    const stale = changes.filter(c => c.stale || c.missing).map(c => c.pkg);
    console.log(
      `API changes: ${total} row(s); stale reports: ${stale.length ? stale.join(', ') : 'none'}`,
    );
    return;
  }

  if (args.check) {
    const stale = results.filter(r => r.committed !== r.head);
    for (const r of stale)
      console.error(`stale: ${r.file} (run pnpm api:report)`);
    process.exit(stale.length ? 1 : 0);
  }

  for (const r of results) {
    if (r.committed !== r.head)
      fs.writeFileSync(path.join(REPO_ROOT, r.file), r.head);
    console.log(
      `${r.committed === r.head ? 'unchanged' : 'wrote'} ${r.file} (${r.head.split('\n').length - 1} lines)`,
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(err => {
    console.error(err?.stack ?? err);
    // In CI `--changes` is evidence (INV24): report the error, never fail the job.
    process.exit(process.argv.includes('--changes') ? 0 : 1);
  });
}
