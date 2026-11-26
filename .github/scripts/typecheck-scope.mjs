// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which workspace packages a pull request's typecheck covers
 *   (spec:AST-030 FR13): the packages its change touches (a file under a
 *   package, one its tsconfig maps or includes, or one its source imports by
 *   a relative path), the packages that
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
 * @param {Record<string, string[]>} [input.externalInputs] each package
 *   folder's inputs outside it (its tsconfig `paths`, `include` and `files`),
 *   as repository paths: a change under one touches that package
 * @returns {{mode: 'all' | 'some' | 'none', packages: string[], reason: string}}
 */
export function chooseTypecheck({
  fullSuite,
  mergeBase,
  changedFiles,
  manifests,
  externalInputs = {},
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
    for (const [owner, inputs] of Object.entries(externalInputs))
      if (
        manifests[owner] &&
        inputs.some(input =>
          input.endsWith('/')
            ? file.startsWith(input)
            : // A relative import names a file with or without its extension.
              file === input ||
              file.startsWith(`${input}.`) ||
              file.startsWith(`${input}/`),
        )
      )
        touched.add(manifests[owner].name);
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

/** JSON with comments and trailing commas, as tsconfig files allow. */
function parseJsonc(text) {
  return JSON.parse(
    text
      .replace(
        /("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
        (all, string) => string ?? '',
      )
      .replace(/,(\s*[}\]])/g, '$1'),
  );
}

/**
 * Each package's typecheck inputs outside its folder, as repository paths:
 * what its own tsconfig files map (`paths`) or include (`include`, `files`),
 * and what its source files import by a relative path that leaves the folder
 * (Storybook's stories import CLI block templates that way). A folder ends
 * in `/`; a glob is cut at its first `*`; an import names a file with or
 * without its extension.
 * @param {string} root
 * @param {Record<string, object>} manifests
 * @param {string[]} [files] tracked repository paths, for the import scan
 * @returns {Record<string, string[]>}
 */
export function readExternalInputs(root, manifests, files = []) {
  /** @type {Record<string, string[]>} */
  const inputs = {};
  const add = (folder, entry) => {
    inputs[folder] ??= [];
    if (!inputs[folder].includes(entry)) inputs[folder].push(entry);
  };
  const folders = Object.keys(manifests).sort((a, b) => b.length - a.length);
  const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
  const SPECIFIER =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)(['"])(\.{1,2}\/[^'"\n]+)\1/gm;
  for (const file of files) {
    if (!SOURCE.test(file) || file.includes('node_modules/')) continue;
    const folder = folders.find(each => file.startsWith(`${each}/`));
    if (folder == null) continue;
    let source;
    try {
      source = fs.readFileSync(path.join(root, file), 'utf8');
    } catch {
      continue;
    }
    if (!source.includes('../')) continue;
    for (const [, , specifier] of source.matchAll(SPECIFIER)) {
      const target = path.posix.normalize(
        path.posix.join(path.posix.dirname(file), specifier),
      );
      if (
        target.startsWith('..') ||
        target === folder ||
        target.startsWith(`${folder}/`)
      )
        continue;
      add(folder, target.replace(/\.(?:[cm]?[jt]sx?)$/, ''));
    }
  }
  for (const folder of Object.keys(manifests)) {
    const dir = path.join(root, folder);
    let names = [];
    try {
      names = fs
        .readdirSync(dir)
        .filter(name => /^tsconfig[\w.-]*\.json$/.test(name));
    } catch {
      continue;
    }
    for (const name of names) {
      let config;
      try {
        config = parseJsonc(fs.readFileSync(path.join(dir, name), 'utf8'));
      } catch {
        continue;
      }
      const options = config.compilerOptions ?? {};
      const base = path.join(dir, options.baseUrl ?? '.');
      const targets = [
        ...Object.values(options.paths ?? {})
          .flat()
          .map(target => path.join(base, String(target))),
        ...[...(config.include ?? []), ...(config.files ?? [])].map(entry =>
          path.join(dir, String(entry)),
        ),
      ];
      for (const target of targets) {
        const fixed = target.split('*')[0];
        const relative = path.relative(root, fixed).split(path.sep).join('/');
        if (
          relative === '' ||
          relative.startsWith('..') ||
          relative.includes('node_modules') ||
          relative === folder ||
          relative.startsWith(`${folder}/`)
        )
          continue;
        let isFolder = /[\\/]$/.test(fixed);
        try {
          isFolder ||= fs.statSync(fixed).isDirectory();
        } catch {
          // A path that does not exist yet names itself.
        }
        add(folder, isFolder ? `${relative}/` : relative);
      }
    }
  }
  return inputs;
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
        externalInputs: readExternalInputs(
          root,
          manifests,
          execFileSync('git', ['ls-files', '-z'], {
            cwd: root,
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
          })
            .split('\0')
            .filter(Boolean),
        ),
        // Both sides of a move: the package a file left changes too.
        changedFiles: base =>
          execFileSync(
            'git',
            ['diff', '--name-only', '--no-renames', '-z', base, 'HEAD'],
            {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024},
          )
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
