// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The inputs of each part of the `test-build` job, so a pull request
 *   that changes none of a part's inputs skips that part (spec:AST-030 FR13).
 * @input The repository's tracked files, read as text.
 * @output TEST_BUILD_PARTS (each part's entry files and the paths its tests
 *   read), scopeRegex() for the job's scope step, and namedPaths(), which
 *   the contract test uses to prove the lists name every input.
 * @position CI tooling for ci.yml's test-build job. A shared or unknown change
 *   runs both parts whatever these lists say.
 */

import path from 'node:path';

export const TEST_BUILD_PARTS = Object.freeze({
  // `pnpm test:build`: the packed consumer, the Build package's build, the
  // theme layer cascade, the StyleX resolution and size checks, and the
  // Next.js Turbopack build.
  contracts: Object.freeze({
    entries: Object.freeze([
      'packages/build/src/packed-consumer.test.mjs',
      '.github/scripts/theme-layer-cascade.js',
      'scripts/stylex-module-resolution.browser.test.mjs',
      'scripts/stylex-size-boundary.browser.test.mjs',
      'packages/build/src/next.turbopack.test.mjs',
    ]),
    paths: Object.freeze([
      'packages/build/',
      'packages/core/',
      'packages/lab/',
      // The data-token check the cascade runs builds through the CLI.
      'packages/cli/',
      '.github/scripts/theme-layer-cascade.js',
      'scripts/build-css.data-tokens.browser.test.mjs',
      'scripts/stylex-module-resolution.browser.test.mjs',
      'scripts/stylex-size-boundary.browser.test.mjs',
    ]),
  }),
  // The canonical setup compositions and the guest fixture contrast.
  fixtures: Object.freeze({
    entries: Object.freeze([
      'internal/vibe-tests/setup-test/setup-canonical.test.ts',
      'internal/vibe-tests/scripts/fixture-browser.mjs',
    ]),
    paths: Object.freeze([
      'internal/vibe-tests/',
      'packages/cli/',
      'packages/core/',
      'packages/themes/',
      'scripts/lib/workspace-globs.mjs',
    ]),
  }),
});

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The scope step's pattern for a part: a folder (ending in `/`) covers what
 * is below it; any other entry is one exact file.
 * @param {keyof typeof TEST_BUILD_PARTS} part
 */
export function scopeRegex(part) {
  return `^(?:${TEST_BUILD_PARTS[part].paths
    .map(entry => (entry.endsWith('/') ? escape(entry) : `${escape(entry)}$`))
    .join('|')})`;
}

const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)(['"])([^'"\n]+)\1/gm;
const LITERAL =
  /(['"`])((?:\.\.?\/)+[^'"`\n]*|(?:packages|internal|apps|scripts|docs|\.github)\/[^'"`\n]*)\1/g;
const SEGMENTS =
  /(['"])(packages|internal|apps|scripts)\1\s*,\s*(['"])([\w.@-]+)\3/g;
const EXTENSIONS = ['', '.mjs', '.js', '.cjs', '.ts', '.tsx', '.mts'];

function resolveFile(from, specifier, tracked) {
  const base = path.posix.normalize(
    path.posix.join(path.posix.dirname(from), specifier),
  );
  for (const extension of EXTENSIONS)
    if (tracked.has(base + extension)) return base + extension;
  for (const extension of EXTENSIONS.slice(1))
    if (tracked.has(`${base}/index${extension}`))
      return `${base}/index${extension}`;
  return null;
}

/**
 * Every repository path the entries name: the files their relative imports
 * reach, followed through; scripts they run by path, followed the same way;
 * workspace packages they import by name, as the package folder; and other
 * path literals, relative or from the repository root, cut where code
 * computes the rest.
 *
 * @param {string[]} files tracked repository paths
 * @param {(file: string) => string} read
 * @param {readonly string[]} entries
 * @param {Record<string, string>} packageDirs workspace package name to folder
 * @returns {Set<string>}
 */
export function namedPaths(files, read, entries, packageDirs) {
  const tracked = new Set(files);
  const directories = new Set();
  for (const file of files)
    for (let at = file.indexOf('/'); at !== -1; at = file.indexOf('/', at + 1))
      directories.add(file.slice(0, at));
  const exists = candidate =>
    tracked.has(candidate) || directories.has(candidate);
  const named = new Set();
  const seen = new Set();
  const folders = Object.values(packageDirs).sort(
    (a, b) => b.length - a.length,
  );
  const packageOf = file =>
    folders.find(folder => file.startsWith(`${folder}/`));
  const entryPackages = new Set(entries.map(packageOf).filter(Boolean));
  // A file in another workspace package names that package, whose own
  // runtime dependencies count too; its insides are not followed.
  const reach = file => {
    const folder = packageOf(file);
    if (folder == null || entryPackages.has(folder)) {
      queue.push(file);
      return;
    }
    named.add(`${folder}/`);
  };
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    named.add(file);
    let source = '';
    try {
      source = read(file);
    } catch {
      continue;
    }
    for (const [, , specifier] of source.matchAll(SPECIFIER)) {
      if (specifier.startsWith('.')) {
        const target = resolveFile(file, specifier, tracked);
        if (target == null) continue;
        reach(target);
        continue;
      }
      const name = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];
      if (packageDirs[name]) named.add(`${packageDirs[name]}/`);
    }
    for (const [, , literal] of source.matchAll(LITERAL)) {
      // Only dots (`'../..'`) compute a root from some base, not a file.
      if (/^(?:\.\.?\/?)+$/.test(literal)) continue;
      const fixed = literal.split(/\$\{|[*?[{]/)[0];
      // A workspace glob (`'packages/*'`) lists the folders; the package the
      // code then reads is named on its own.
      if (fixed !== literal && /^(?:packages|apps|internal)\/?$/.test(fixed))
        continue;
      const joined = fixed.startsWith('.')
        ? path.posix.normalize(path.posix.join(path.posix.dirname(file), fixed))
        : fixed;
      if (joined.startsWith('..')) continue;
      const bare = joined.replace(/\/$/, '');
      if (!exists(bare)) continue;
      const entry = directories.has(bare) ? `${bare}/` : bare;
      named.add(entry);
      // A script the code runs by its path is read like an import.
      if (tracked.has(bare) && /\.[cm]?[jt]sx?$/.test(bare)) reach(bare);
    }
    for (const [, , first, , second] of source.matchAll(SEGMENTS)) {
      const folder = `${first}/${second}`;
      if (directories.has(folder)) named.add(`${folder}/`);
    }
  }
  return named;
}
