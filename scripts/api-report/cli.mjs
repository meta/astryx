// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `pnpm api:report`: write, check, or compare the published packages' API reports.
 *
 * @input  the built published packages (run `pnpm build` first)
 * @output `<package>/api-report.md` for each published package; with
 *         `--surface`, the same reports under another directory (the API
 *         surface Main keeps for each commit, or a merge base built in CI);
 *         with `--changes`, `api-changes.md` and `api-changes.json` comparing
 *         the merge base's surface with the reports generated from this build,
 *         and each committed report with this build
 * @position scripts/api-report — the command behind
 *           architecture:public-component-api INV24
 *
 * Usage:
 *   pnpm api:report                      write every published package's report
 *   pnpm api:report --package core       write one (name, short name, or directory)
 *   pnpm api:report --check              exit 1 when a committed report is stale
 *   node scripts/api-report/cli.mjs --surface <dir> [--root <repo>]
 *                                        write the built packages' reports to <dir>
 *                                        (of the checkout at <repo>), committing nothing
 *   node scripts/api-report/cli.mjs --changes --base <ref>
 *       [--base-surface <dir> --base-record main|build] [--out <dir>]
 *                                        CI: write the API changes; always exits 0
 *
 * The merge base's report for each package comes from, best first: its built
 * surface (`--base-surface`); this build, when the package's directory is
 * unchanged since `--base` and the surface lacks it (a merge base CI built
 * without that package); the report committed at `--base`.
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {expandWorkspaceDirs} from '../lib/workspace-globs.mjs';
import {isStableReleasePackage} from '../release/active-release.mjs';
import {computeChanges, renderChanges} from './changes.mjs';
import {generateReport} from './generate.mjs';

export const REPORT_FILE = 'api-report.md';
export const SURFACE_FILE = 'surface.json';
/** api-changes.json's shape; 2 added `baseRecord`, `baseSource`, `staleRows`. */
export const CHANGES_VERSION = 2;
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

/**
 * Every package a stable release publishes, by the release's own rule.
 * @param {string} repoRoot
 * @returns {Array<{name: string, dir: string}>}
 */
export function publishedPackages(repoRoot) {
  const out = [];
  for (const abs of expandWorkspaceDirs(repoRoot)) {
    const manifest = path.join(abs, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (!isStableReleasePackage(pkg)) continue;
    out.push({
      name: pkg.name,
      dir: path.relative(repoRoot, abs).split(path.sep).join('/'),
    });
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
    surface: null,
    root: null,
    baseSurface: null,
    baseRecord: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') args.check = true;
    else if (a === '--changes') args.changes = true;
    else if (a === '--base') args.base = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--package') args.package = argv[++i];
    else if (a === '--surface') args.surface = argv[++i];
    else if (a === '--root') args.root = argv[++i];
    else if (a === '--base-surface') args.baseSurface = argv[++i];
    else if (a === '--base-record') args.baseRecord = argv[++i];
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
function unbuilt(dir, root = REPO_ROOT) {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, dir, 'package.json'), 'utf8'),
  );
  const missing = [];
  const visit = t => {
    if (typeof t === 'string') {
      // A subpath pattern needs its directory; which files match is reported.
      const target = t.includes('*') ? path.dirname(t) : t;
      if (!fs.existsSync(path.join(root, dir, target)))
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

/** Whether `dir` is the same at `ref` as in this checkout's HEAD. */
function unchangedSince(ref, dir) {
  try {
    execFileSync('git', ['diff', '--quiet', ref, 'HEAD', '--', dir], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * The merge base's report for one package, and where it came from.
 * @param {{surface: string|null, unchanged: boolean, haveSurface: boolean,
 *   head: string, committedAtBase: string|null}} input
 * @returns {{base: string|null, baseSource: 'build'|'head'|'committed'}}
 */
export function chooseBase({
  surface,
  unchanged,
  haveSurface,
  head,
  committedAtBase,
}) {
  if (surface != null) return {base: surface, baseSource: 'build'};
  // A merge base built without this package, which has not changed since.
  if (haveSurface && unchanged) return {base: head, baseSource: 'head'};
  return {base: committedAtBase, baseSource: 'committed'};
}

/**
 * Write the built packages' reports of the checkout at `root` under `out`,
 * mirroring their directories, and list them in `surface.json`. A package
 * whose build is missing is listed as skipped.
 */
async function writeSurface(root, out) {
  const written = [];
  const skipped = [];
  for (const p of publishedPackages(root)) {
    const missing = unbuilt(p.dir, root);
    if (missing.length) {
      skipped.push({...p, missing});
      continue;
    }
    const report = await generateReport({repoRoot: root, packageDir: p.dir});
    const file = path.join(out, p.dir, REPORT_FILE);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, report);
    written.push(p);
  }
  fs.mkdirSync(out, {recursive: true});
  fs.writeFileSync(
    path.join(out, SURFACE_FILE),
    JSON.stringify({version: 1, packages: written, skipped}, null, 2) + '\n',
  );
  console.log(
    `API surface: ${written.length} report(s) in ${out}` +
      (skipped.length
        ? `; not built: ${skipped.map(p => p.name).join(', ')}`
        : ''),
  );
}

/** A report from a surface directory, or null. */
function surfaceReport(dir, pkgDir) {
  const file = path.join(dir, pkgDir, REPORT_FILE);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.surface) {
    await writeSurface(
      args.root ? path.resolve(args.root) : REPO_ROOT,
      path.resolve(args.surface),
    );
    return;
  }
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
    const haveSurface =
      !!args.baseSurface &&
      fs.existsSync(path.join(args.baseSurface, SURFACE_FILE));
    const changes = computeChanges(
      results.map(r => {
        const dir = path.posix.dirname(r.file);
        return {
          pkg: r.pkg,
          head: r.head,
          committed: r.committed,
          ...chooseBase({
            surface: haveSurface ? surfaceReport(args.baseSurface, dir) : null,
            haveSurface,
            unchanged: !!args.base && unchangedSince(args.base, dir),
            head: r.head,
            committedAtBase: args.base
              ? showAt(args.base, r.file)
              : r.committed,
          }),
        };
      }),
    );
    fs.mkdirSync(args.out, {recursive: true});
    fs.writeFileSync(
      path.join(args.out, 'api-changes.md'),
      renderChanges(changes),
    );
    fs.writeFileSync(
      path.join(args.out, 'api-changes.json'),
      JSON.stringify(
        {
          version: CHANGES_VERSION,
          // Where the merge base's surface came from: Main's record of that
          // commit, a build of it in this run, or neither (committed reports).
          baseRecord: haveSurface
            ? args.baseRecord === 'build'
              ? 'build'
              : 'main'
            : null,
          packages: changes,
        },
        null,
        2,
      ) + '\n',
    );
    const total = changes.reduce((n, c) => n + c.rows.length, 0);
    const stale = changes.filter(c => c.stale || c.missing).map(c => c.pkg);
    console.log(
      `API changes: ${total} row(s) against the merge base's ${haveSurface ? `built surface (${args.baseRecord ?? 'main'})` : 'committed reports'}; stale reports: ${stale.length ? stale.join(', ') : 'none'}`,
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
