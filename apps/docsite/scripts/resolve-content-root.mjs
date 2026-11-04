#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resolve-content-root.mjs
 *
 * Resolves the CONTENT ROOT the docsite data pipeline reads package
 * documentation from (component .doc.mjs prop tables, package.json versions,
 * READMEs, CHANGELOGs).
 *
 * The docsite CODE is always the current checkout. What varies per deploy is
 * *which version of the @astryxdesign/* packages* supplies that documentation:
 *
 *   canary  → the live monorepo workspace (REPO_ROOT). Documents main / WIP.
 *             Used for the canary deploy AND every PR preview.
 *   latest  → the last PUBLISHED release on npm. Documents exactly what
 *             `npm install` gives a consumer today. Used for production.
 *
 * Target selection (no manual config in the common case):
 *   - Explicit override: DOCSITE_TARGET=latest|canary always wins.
 *   - Otherwise derived from Vercel's VERCEL_ENV: `production` → latest,
 *     everything else (preview, development, unset) → canary.
 *
 * How `latest` sources are materialized: the version is read live from npm
 * (`npm view @astryxdesign/core version`) so it always tracks the current
 * published release with nothing to hand-maintain. Each docsite @astryxdesign/*
 * dependency's published tarball is downloaded and unpacked into a cache dir
 * laid out like the monorepo, so generate-data.mjs's workspace discovery works
 * unchanged. The published tarballs ship `src/` (see each package's
 * package.json "files"), so the .doc.mjs docs the pipeline reads are present.
 *
 * This module is the SINGLE place that maps a target to a filesystem root.
 * generate-data.mjs consumes CONTENT_ROOT from here; every generated registry
 * keeps its exact shape, so no consuming page code changes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {execFileSync} from 'node:child_process';
import * as os from 'node:os';
import {fileURLToPath} from 'node:url';
import {isStableRelease} from '../src/lib/integrationTargets.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCSITE_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(DOCSITE_ROOT, '..', '..');

/** The npm dist-tag whose version `latest` documents. */
const PUBLISHED_DIST_TAG = 'latest';
/** Package whose published version defines the release the docsite pins to. */
const VERSION_SOURCE_PKG = '@astryxdesign/core';

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {encoding: 'utf-8', ...opts});
}

/**
 * Resolve the build target. Explicit DOCSITE_TARGET wins; otherwise derive from
 * VERCEL_ENV (production → latest, else canary).
 */
export function getTarget() {
  const explicit = (process.env.DOCSITE_TARGET || '').trim();
  if (explicit) {
    if (explicit !== 'canary' && explicit !== 'latest') {
      throw new Error(
        `Invalid DOCSITE_TARGET="${explicit}". Expected "canary" or "latest".`,
      );
    }
    return explicit;
  }
  return process.env.VERCEL_ENV === 'production' ? 'latest' : 'canary';
}

/**
 * The docsite's @astryxdesign/* dependencies that are documented on the
 * `latest` (production) site: the ones actually published to the stable npm
 * `latest` dist-tag. Mapped to the monorepo-relative dir each occupies (so the
 * materialized cache mirrors REPO_ROOT's layout — themes under
 * packages/themes/<name>, everything else under packages/<name>).
 *
 * Packages that never reach the stable tag are EXCLUDED from `latest`:
 *   - `private` packages, and
 *   - `astryx.canaryOnly` packages (e.g. @astryxdesign/charts, @astryxdesign/lab)
 *     — these publish only as canaries, so no stable version exists to document.
 * This mirrors the publishable predicate in .github/workflows/release.yml's
 * stable-publish step (`isStableRelease`), so production documents exactly the
 * stable release set. (On canary these still appear, sourced from the
 * workspace like everything else.)
 */
function latestPublishablePackages() {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(DOCSITE_ROOT, 'package.json'), 'utf-8'),
  );
  const deps = {...pkg.dependencies, ...pkg.devDependencies};
  return Object.keys(deps)
    .filter(name => name.startsWith('@astryxdesign/'))
    .map(name => ({name, dir: packageDirFor(name)}))
    .filter(({dir}) => {
      // Read the package's own workspace manifest for its publish flags. Same
      // rule release.yml uses for the stable `latest` tag.
      const manifestPath = path.join(REPO_ROOT, dir, 'package.json');
      if (!fs.existsSync(manifestPath)) {
        return false;
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      return isStableRelease(manifest);
    });
}

/** Monorepo-relative directory of a documented @astryxdesign/* package. */
function packageDirFor(name) {
  const short = name.slice('@astryxdesign/'.length);
  return short.startsWith('theme-')
    ? path.join('packages', 'themes', short.slice('theme-'.length))
    : path.join('packages', short);
}

/**
 * The `latest` admission predicate for configured integration packages (see
 * src/lib/integrationTargets.mjs): a configured package is admitted when its
 * workspace manifest is a stable release AND the materialized content
 * snapshot holds it. The second half matters between a package's promotion
 * and its first stable publish: the package is publishable, but no tarball
 * exists at the documented version yet, so `latest` keeps documenting the
 * release that is actually on npm.
 *
 * @param {string} contentRoot the resolved `latest` content root
 * @returns {(name: string) => boolean}
 */
export function admittedStableIntegration(contentRoot) {
  return name => {
    if (typeof name !== 'string' || !name.startsWith('@astryxdesign/')) {
      return false;
    }
    const dir = packageDirFor(name);
    const manifestPath = path.join(REPO_ROOT, dir, 'package.json');
    if (!fs.existsSync(manifestPath)) return false;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    return (
      isStableRelease(manifest) &&
      fs.existsSync(path.join(contentRoot, dir, 'package.json'))
    );
  };
}

/** Latest published version of the version-source package, read live from npm. */
function latestPublishedVersion() {
  const out = run(
    'npm',
    [
      'view',
      `${VERSION_SOURCE_PKG}@${PUBLISHED_DIST_TAG}`,
      'version',
      '--json',
    ],
    {maxBuffer: 8 * 1024 * 1024},
  ).trim();
  // `npm view … version` prints a bare quoted string for a single match.
  const version = JSON.parse(out);
  if (typeof version !== 'string' || !version) {
    throw new Error(
      `Could not resolve a published version for ${VERSION_SOURCE_PKG}@${PUBLISHED_DIST_TAG}.`,
    );
  }
  return version;
}

/**
 * Materialize the published package sources for `latest` into a cache dir by
 * downloading each package's PUBLISHED TARBALL from npm.
 *
 * Layout produced (mirrors a real monorepo release so generate-data.mjs's
 * workspace discovery works unchanged):
 *   <cache>/pnpm-workspace.yaml          — synthetic layout declaration
 *   <cache>/package.json                 — synthetic private root manifest
 *   <cache>/packages/core/…              — @astryxdesign/core tarball
 *   <cache>/packages/themes/<name>/…     — @astryxdesign/theme-<name> tarballs
 *
 * `exec` runs npm and tar (tests inject a fake); `cacheDir` is where the
 * version caches live.
 */
export function materializeFromNpm(
  version,
  packages,
  {exec = run, cacheDir = path.join(DOCSITE_ROOT, '.content-cache')} = {},
) {
  const cacheRoot = path.join(cacheDir, `npm-${version}`);
  const stamp = path.join(cacheRoot, '.stamp');
  // The stamp names the packages the cache actually holds. It is reused only
  // when it names every expected package, so a cache built while a package
  // awaited its first stable release (see below) is rebuilt on the next run
  // instead of keeping that gap.
  // v3: the stamp lists materialized packages, not expected ones. v2 declared
  // the layout through a synthetic pnpm-workspace.yaml (pre-#3752 caches
  // cannot be read by the new discovery).
  const expectedStamp = stampFor(
    version,
    packages.map(p => p.name),
  );
  if (
    fs.existsSync(stamp) &&
    fs.readFileSync(stamp, 'utf-8').trim() === expectedStamp
  ) {
    return cacheRoot;
  }
  fs.rmSync(cacheRoot, {recursive: true, force: true});
  fs.mkdirSync(cacheRoot, {recursive: true});

  // Synthetic root manifests mirroring the real monorepo: pnpm-workspace.yaml
  // declares the layout (the single source of truth discoverPackageDirs()
  // expands — the root package.json no longer carries a `workspaces` array),
  // and a minimal package.json marks the cache root as a private package.
  fs.writeFileSync(
    path.join(cacheRoot, 'pnpm-workspace.yaml'),
    ['packages:', "  - 'packages/*'", "  - 'packages/themes/*'", ''].join('\n'),
  );
  fs.writeFileSync(
    path.join(cacheRoot, 'package.json'),
    JSON.stringify(
      {
        name: 'astryx-pinned-content',
        private: true,
        version,
      },
      null,
      2,
    ),
  );

  const materialized = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-pin-'));
  try {
    for (const {name, dir} of packages) {
      const spec = `${name}@${version}`;
      // `npm pack` downloads the exact published tarball and prints its
      // filename; --pack-destination keeps it out of the cwd.
      //
      // Run it from the tmp dir (OUTSIDE the repo), NOT from the workspace: the
      // root package.json declares `devEngines.packageManager: pnpm`, which
      // makes npm hard-error EBADDEVENGINES if it discovers that manifest by
      // walking up from the cwd. The tmp dir has no package.json, so npm skips
      // the engine guard. (COREPACK_ENABLE_STRICT=0 as belt-and-suspenders.)
      const out = packPublished(spec, tmp, exec);
      if (out == null) {
        // No tarball at the documented version. For a package that has
        // never had a stable release this is the gap between its promotion
        // and the next cut: `latest` documents what is on npm, and the
        // package appears once that cut publishes it. For a package with a
        // stable release behind it, the release itself is only partly
        // published, and the build fails as before.
        const prior = latestStableVersion(name, exec);
        if (prior != null) {
          throw new Error(
            `${spec} is not on npm, but ${name} already has stable release ${prior}: ` +
              'the documented release is only partly published.',
          );
        }
        console.log(
          `  ${spec} is not on npm yet; ${name} joins latest after its first stable release`,
        );
        continue;
      }
      const tgz = path.join(tmp, JSON.parse(out)[0].filename);
      const dest = path.join(cacheRoot, dir);
      fs.mkdirSync(dest, {recursive: true});
      // npm tarballs wrap everything under a top-level "package/" dir.
      exec('tar', ['-x', '-z', '-f', tgz, '--strip-components=1', '-C', dest]);
      materialized.push(name);
    }
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }

  fs.writeFileSync(stamp, stampFor(version, materialized));
  return cacheRoot;
}

function stampFor(version, names) {
  return `v3:npm-${version}:${[...names].sort().join(',')}`;
}

/**
 * Whether an npm error is "no such package or version": E404 for a package
 * that is not on npm at all, ETARGET for a published package without the
 * requested version (`npm pack` reports the latter as "No matching version").
 */
function isNotFound(error) {
  return /\b(?:E404|ETARGET)\b/.test(String(error?.stderr ?? error));
}

/**
 * Download `spec`'s published tarball into `tmp` and return npm's JSON
 * report, or null when no such version is published. Any other failure
 * propagates.
 */
function packPublished(spec, tmp, exec) {
  try {
    return exec('npm', ['pack', spec, '--pack-destination', tmp, '--json'], {
      cwd: tmp,
      maxBuffer: 256 * 1024 * 1024,
      // stderr is read from the error, not inherited, so an expected E404
      // does not print as a failure in the build log.
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {...process.env, COREPACK_ENABLE_STRICT: '0'},
    });
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/**
 * The version on `name`'s stable npm dist-tag, or null when the package has
 * never had a stable release: it is not on npm at all, or its `latest` tag
 * still points at a prerelease placeholder (the bootstrap publish that
 * reserves a package name before its first real release).
 */
export function latestStableVersion(name, exec = run) {
  let out;
  try {
    out = exec('npm', ['view', name, 'dist-tags', '--json'], {
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {...process.env, COREPACK_ENABLE_STRICT: '0'},
    });
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  const latest = JSON.parse(out)?.[PUBLISHED_DIST_TAG];
  if (typeof latest !== 'string' || latest.includes('-')) return null;
  return latest;
}

/**
 * Returns {target, contentRoot, cliRoot, version} for the current target.
 * contentRoot mirrors REPO_ROOT layout (has packages/* and pnpm-workspace.yaml).
 */
export function resolveContentRoot() {
  const target = getTarget();

  if (target === 'canary') {
    return {
      target,
      contentRoot: REPO_ROOT,
      cliRoot: path.join(REPO_ROOT, 'packages', 'cli'),
      version: null,
    };
  }

  // latest
  const version = latestPublishedVersion();
  const packages = latestPublishablePackages();
  const contentRoot = materializeFromNpm(version, packages);
  return {
    target,
    // DATA (component .doc.mjs prop tables, package.json versions, READMEs) is
    // read from the published release — that's the point of `latest`.
    contentRoot,
    // EXECUTABLE content (CLI templates: showcases, examples, blocks, pages,
    // long-form docs) is LIVE-RENDERED as React and always resolves
    // @astryxdesign/core from node_modules — i.e. the version the docsite
    // bundles. Pinning it would make a stale release's demo use API the bundled
    // core no longer exposes, breaking render AND typecheck. So it always comes
    // from the real workspace; only the documented DATA is pinned.
    cliRoot: path.join(REPO_ROOT, 'packages', 'cli'),
    version,
  };
}

// CLI usage: `node resolve-content-root.mjs` prints the resolution as JSON.
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = resolveContentRoot();
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
}
