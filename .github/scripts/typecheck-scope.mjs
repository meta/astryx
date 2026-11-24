// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which workspace packages a pull request's typecheck covers
 *   (spec:AST-030 FR13): the packages its change touches, the packages that
 *   depend on those at run time (through `dependencies` or
 *   `peerDependencies`, followed on), and the packages that use any of them
 *   in their own checks (`devDependencies`, not followed on). A shared or
 *   unknown change, a missing merge base, or a diff git cannot read
 *   typechecks everything, as before.
 * @input FULL_SUITE (the trusted scope), MERGE_BASE (the pull request's merge
 *   base, or empty), the diff from it, and the workspace manifests.
 * @output GITHUB_OUTPUT `mode` (all, some or none) and `filters` (the pnpm
 *   filter arguments for `some`), and a log line naming the packages.
 * @position CI tooling for ci.yml's typecheck job.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

/** The packages the root typecheck leaves out: they have their own owners. */
export const EXCLUDED = Object.freeze([
  '@astryxdesign/docsite',
  '@astryxdesign/sandbox',
]);

/**
 * The typecheck's scope.
 * @param {object} input
 * @param {string} input.fullSuite 'true' or 'false', from the trusted scope
 * @param {string} input.mergeBase the merge base, or ''
 * @param {(base: string) => string[]} input.changedFiles the paths changed
 *   since the base
 * @param {Record<string, {name: string, dependencies?: object,
 *   peerDependencies?: object, devDependencies?: object}>} input.manifests
 *   each workspace package's folder and manifest
 * @returns {{mode: 'all' | 'some' | 'none', packages: string[], reason: string}}
 */
export function chooseTypecheck({
  fullSuite,
  mergeBase,
  changedFiles,
  manifests,
}) {
  const all = reason => ({mode: 'all', packages: [], reason});
  if (fullSuite !== 'false')
    return all('the change touches shared or unknown paths');
  if (!/^[0-9a-f]{40}$/.test(mergeBase)) return all('no merge base was found');
  let changed;
  try {
    changed = changedFiles(mergeBase);
  } catch (error) {
    return all(
      `git could not list the changed files (${String(error.message).split('\n')[0]})`,
    );
  }
  const folders = Object.keys(manifests).sort((a, b) => b.length - a.length);
  const touched = new Set();
  for (const file of changed) {
    const folder = folders.find(each => file.startsWith(`${each}/`));
    if (folder) touched.add(manifests[folder].name);
  }
  const uses = (manifest, kinds, names) =>
    kinds.some(kind =>
      Object.keys(manifest[kind] ?? {}).some(name => names.has(name)),
    );
  // Run-time dependents, followed on.
  const affected = new Set(touched);
  for (let grew = true; grew;) {
    grew = false;
    for (const manifest of Object.values(manifests))
      if (
        !affected.has(manifest.name) &&
        uses(manifest, ['dependencies', 'peerDependencies'], affected)
      ) {
        affected.add(manifest.name);
        grew = true;
      }
  }
  // Packages whose own checks use an affected package, one step only.
  const selected = new Set(affected);
  for (const manifest of Object.values(manifests))
    if (uses(manifest, ['devDependencies'], affected))
      selected.add(manifest.name);
  const packages = [...selected]
    .filter(name => !EXCLUDED.includes(name))
    .sort();
  if (packages.length === 0)
    return {
      mode: 'none',
      packages,
      reason: 'the change touches no package that is typechecked',
    };
  return {
    mode: 'some',
    packages,
    reason:
      'the packages the change touches, their run-time dependents, and the packages whose checks use them',
  };
}

/**
 * Every workspace package's folder and manifest, as pnpm lists them.
 * @param {string} root
 * @param {() => {name?: string, path: string}[]} list `pnpm ls -r`
 */
export function readManifests(root, list) {
  const manifests = {};
  for (const entry of list()) {
    const folder = path.relative(root, entry.path).split(path.sep).join('/');
    if (folder === '' || folder.startsWith('..')) continue;
    const manifest = JSON.parse(
      fs.readFileSync(path.join(entry.path, 'package.json'), 'utf8'),
    );
    if (typeof manifest.name === 'string') manifests[folder] = manifest;
  }
  return manifests;
}

function main() {
  const root = process.cwd();
  let manifests = {};
  let listError = '';
  try {
    manifests = readManifests(root, () =>
      JSON.parse(
        execFileSync('pnpm', ['ls', '-r', '--depth', '-1', '--json'], {
          cwd: root,
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
        }),
      ),
    );
  } catch (error) {
    listError = String(error.message).split('\n')[0];
  }
  const choice = listError
    ? {
        mode: 'all',
        packages: [],
        reason: `pnpm could not list the workspace (${listError})`,
      }
    : chooseTypecheck({
        fullSuite: process.env.FULL_SUITE ?? 'true',
        mergeBase: process.env.MERGE_BASE ?? '',
        manifests,
        changedFiles: base =>
          execFileSync('git', ['diff', '--name-only', '-z', base, 'HEAD'], {
            cwd: root,
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
          })
            .split('\0')
            .filter(Boolean),
      });
  const named = choice.mode === 'some' ? `: ${choice.packages.join(', ')}` : '';
  console.log(`Typecheck scope: ${choice.mode} (${choice.reason})${named}.`);
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `mode=${choice.mode}\nfilters=${choice.packages.map(name => `--filter=${name}`).join(' ')}\n`,
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  main();
