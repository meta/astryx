// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Write the published packages' API surface, or compare a build with it.
 *
 * @input  the built published packages (run `pnpm build` first)
 * @output with `--surface <dir>`, each package's API report under `<dir>` and
 *         `surface.json` (the surface Main keeps for each commit, or a merge
 *         base built in CI); with `--changes`, `api-changes.md` and
 *         `api-changes.json` comparing the merge base's surface with the
 *         reports generated from this build
 * @position scripts/api-report — the command behind
 *           architecture:public-component-api INV24
 *
 * Usage:
 *   node scripts/api-report/cli.mjs --surface <dir> [--root <repo>]
 *       write the built packages' reports to <dir> (of the checkout at <repo>)
 *   node scripts/api-report/cli.mjs --changes --base <ref>
 *       [--base-surface <dir> --base-record main|build] [--out <dir>]
 *       CI: write the API changes; always exits 0
 *
 * The merge base's report for each package comes from its built surface
 * (`--base-surface`), or from this build when the surface lacks it (a merge
 * base CI built without that package) and neither its directory nor any of
 * SHARED_INPUTS changed since `--base`. A package the surface lists, built
 * or skipped, but has no report for is marked unknown, with no rows. A
 * package the surface does not list is new. With no surface, nothing is
 * compared: each published package whose inputs changed since `--base` (all
 * of them without `--base`) is marked unknown, so the file never reads as a
 * pull request with no API change.
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {expandWorkspaceDirs} from '../lib/workspace-globs.mjs';
import {isStableReleasePackage} from '../release/active-release.mjs';
import {computeChanges, renderChanges} from './changes.mjs';
import {generateReport} from './generate.mjs';

/** Each package's report file inside a surface directory. */
export const REPORT_FILE = 'api-report.md';
export const SURFACE_FILE = 'surface.json';
/**
 * api-changes.json's shape. Its readers (the pull request report and
 * merge-guard) accept version 2 and a missing `baseUnknown`. A package with
 * `baseUnknown: true` has `baseline: true`, `baseSource: 'unknown'` and no
 * rows.
 */
export const CHANGES_VERSION = 2;

/**
 * The object `api-changes.json` holds. Its readers are the pull request report
 * and merge-guard.
 * @param {ReturnType<typeof computeChanges>} changes
 * @param {{haveSurface: boolean, baseRecord?: string}} base whether the merge
 *   base's surface was found, and where it came from
 */
export function changesFile(changes, {haveSurface, baseRecord}) {
  return {
    version: CHANGES_VERSION,
    // Where the merge base's surface came from: Main's record of that commit,
    // a build of it in this run, or neither (nothing compared).
    baseRecord: haveSurface
      ? baseRecord === 'build'
        ? 'build'
        : 'main'
      : null,
    packages: changes,
  };
}
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
    changes: false,
    base: null,
    out: '.',
    surface: null,
    root: null,
    baseSurface: null,
    baseRecord: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--changes') args.changes = true;
    else if (a === '--base') args.base = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--surface') args.surface = argv[++i];
    else if (a === '--root') args.root = argv[++i];
    else if (a === '--base-surface') args.baseSurface = argv[++i];
    else if (a === '--base-record') args.baseRecord = argv[++i];
    else throw new Error(`Unknown option: ${a}`);
  }
  if (!args.surface && !args.changes)
    throw new Error('Pass --surface <dir> or --changes.');
  return args;
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

/**
 * What every report also depends on: themes get their stylesheets from Core
 * through the CLI; every report reads the CLI's theming targets and the lint
 * rule's public attributes; declarations come from `tsc` over the root
 * tsconfig, and stylesheets from the CSS build and StyleX, at the locked
 * versions.
 */
export const SHARED_INPUTS = [
  'packages/core',
  'packages/cli',
  'internal/eslint-plugin-astryx/no-raw-private-attribute.js',
  'tsconfig.json',
  'pnpm-lock.yaml',
  'scripts/build-css.mjs',
  'packages/build/src/source-stylesheet.js',
  'scripts/stylex-module-resolution.cjs',
  'scripts/add-declaration-extensions.mjs',
];

/** Whether a package's report inputs are the same at `ref` as at HEAD. */
function unchangedSince(ref, dir) {
  try {
    execFileSync(
      'git',
      ['diff', '--quiet', ref, 'HEAD', '--', dir, ...SHARED_INPUTS],
      {
        cwd: REPO_ROOT,
        stdio: 'ignore',
      },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * The merge base's report for one package, and where it came from.
 * @param {{surface: string|null, unchanged: boolean, listed?: boolean,
 *   head: string}} input
 *   `listed`: the surface.json lists the package (built or skipped), so the
 *   package existed at the merge base
 * @returns {{base: string|null, baseSource: 'build'|'head'|'unknown',
 *   baseUnknown?: true}}
 */
export function chooseBase({surface, unchanged, listed = false, head}) {
  if (surface != null) return {base: surface, baseSource: 'build'};
  // A merge base built without this package, which has not changed since.
  if (unchanged) return {base: head, baseSource: 'head'};
  if (listed) return {base: null, baseSource: 'unknown', baseUnknown: true};
  return {base: null, baseSource: 'build'};
}

/**
 * The changes when the merge base has no built surface: each published
 * package whose report inputs changed is unknown, with no rows. A pull
 * request that changes no published package lists none.
 * @param {Array<{name: string, dir: string}>} packages
 * @param {(dir: string) => boolean} unchanged
 */
export function uncomparedChanges(packages, unchanged) {
  return computeChanges(
    packages
      .filter(p => !unchanged(p.dir))
      .map(p => ({pkg: p.name, base: null, head: '', baseSource: 'unknown'})),
  );
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

/** The package directories a surface lists, built or skipped. */
function surfaceListing(dir) {
  try {
    const surface = JSON.parse(
      fs.readFileSync(path.join(dir, SURFACE_FILE), 'utf8'),
    );
    return new Set(
      [...(surface.packages ?? []), ...(surface.skipped ?? [])].map(p => p.dir),
    );
  } catch {
    return new Set();
  }
}

/** A report from a surface directory, or null. */
function surfaceReport(dir, pkgDir) {
  const file = path.join(dir, pkgDir, REPORT_FILE);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

/** Compare this build with the merge base's surface and write the changes. */
async function writeChanges(args) {
  const haveSurface =
    !!args.baseSurface &&
    fs.existsSync(path.join(args.baseSurface, SURFACE_FILE));
  const changes = [];
  if (haveSurface) {
    const listed = surfaceListing(args.baseSurface);
    const inputs = [];
    for (const p of publishedPackages(REPO_ROOT)) {
      if (unbuilt(p.dir).length) continue;
      const head = await generateReport({
        repoRoot: REPO_ROOT,
        packageDir: p.dir,
      });
      inputs.push({
        pkg: p.name,
        head,
        ...chooseBase({
          surface: surfaceReport(args.baseSurface, p.dir),
          listed: listed.has(p.dir),
          unchanged: !!args.base && unchangedSince(args.base, p.dir),
          head,
        }),
      });
    }
    changes.push(...computeChanges(inputs));
  } else {
    changes.push(
      ...uncomparedChanges(
        publishedPackages(REPO_ROOT),
        dir => !!args.base && unchangedSince(args.base, dir),
      ),
    );
  }
  fs.mkdirSync(args.out, {recursive: true});
  fs.writeFileSync(
    path.join(args.out, 'api-changes.md'),
    renderChanges(changes, {compared: haveSurface}),
  );
  fs.writeFileSync(
    path.join(args.out, 'api-changes.json'),
    JSON.stringify(
      changesFile(changes, {haveSurface, baseRecord: args.baseRecord}),
      null,
      2,
    ) + '\n',
  );
  const total = changes.reduce((n, c) => n + c.rows.length, 0);
  console.log(
    haveSurface
      ? `API changes: ${total} row(s) against the merge base's built surface (${args.baseRecord ?? 'main'})`
      : `API changes: no built surface of the merge base; nothing compared; unknown: ${changes.length ? changes.map(c => c.pkg).join(', ') : 'none (no published package changed)'}`,
  );
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
  await writeChanges(args);
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
