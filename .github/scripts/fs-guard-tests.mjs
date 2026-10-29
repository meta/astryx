#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

// Lists the tests a scoped pull request runs beyond Vitest's `--changed`
// (spec:AST-030 FR13), in two groups no module graph relates to a change:
//
// - Guards that read repository sources, directly or through a module they
//   import. Any spelling of a module that reads files counts: `fs`,
//   `fs/promises`, `child_process` (`node:` or bare), and the libraries that
//   read sources for the test (the TypeScript compiler and ts-morph, Babel,
//   bundlers, ESLint and Prettier, globs, process runners), through `from`,
//   `require`, `import()` or `vi.importActual`. So do `createRequire`, a
//   computed `import()` and `import.meta.glob`: each loads what it computes
//   or lists.
// - With `--changed <ref>`: the tests that reach a changed workspace package
//   through its built output, by its name (`@astryxdesign/core` and any
//   subpath) or a relative path into its `dist/`. A project that loads a
//   package from its build sees its source change only through those.
//
// Usage: node .github/scripts/fs-guard-tests.mjs [--changed <ref>]
//   (newline-separated paths)

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const TEST_FILE = /\.test\.(?:tsx?|mjs|cjs|js)$/;
const FILE_MODULE = String.raw`(?:fs|fs\/promises|fs-extra|child_process|typescript|ts-morph|@babel\/core|esbuild|vite|rollup|eslint|prettier|glob|fast-glob|tinyglobby|globby|execa|cross-spawn)`;
const READS_FILES = new RegExp(
  [
    String.raw`\bnode:${FILE_MODULE}\b`,
    String.raw`\bfrom\s*['"]${FILE_MODULE}['"]`,
    // Any call naming the module: require, a createRequire require,
    // import(), vi.importActual.
    String.raw`\(\s*['"]${FILE_MODULE}['"]\s*[,)]`,
    String.raw`\bimport\.meta\.glob\b`,
    String.raw`\bcreateRequire\b`,
    String.raw`\bimport\(\s*[^'"\s)]`,
  ].join('|'),
);
/** Every module specifier: `from`, a bare `import '…'`, `import()`, `require()`, `vi.importActual()`, `vi.mock()`. */
const SPECIFIER =
  /(?:\bfrom|\bimport|\brequire|\bimportActual|\bmock)\s*\(?\s*['"]([^'"]+)['"]/g;
const EXTENSIONS = ['', '.ts', '.tsx', '.mjs', '.js', '.cjs', '.mts', '.cts'];

/** Resolves a relative specifier to a tracked file, or null. */
function resolve(from, specifier, tracked) {
  const base = path.posix.normalize(
    path.posix.join(path.posix.dirname(from), specifier),
  );
  // TypeScript ESM imports name the emitted `.js`; the source is `.ts`.
  const stems = [base, base.replace(/\.(?:m|c)?js$/, '')];
  for (const stem of stems) {
    for (const extension of EXTENSIONS) {
      if (tracked.has(stem + extension)) return stem + extension;
    }
    for (const extension of EXTENSIONS.slice(1)) {
      if (tracked.has(`${stem}/index${extension}`))
        return `${stem}/index${extension}`;
    }
  }
  return null;
}

/**
 * The tests whose import closure (relative imports followed) satisfies
 * `matches` for some file's source and specifiers.
 *
 * @param {string[]} files tracked repository paths
 * @param {(file: string) => string} read the file's source
 * @param {(source: string, specifiers: {raw: string, joined: string}[]) => boolean} matches
 */
function testsWhoseClosure(files, read, matches) {
  const tracked = new Set(files);
  const memo = new Map();
  const visit = (file, visiting) => {
    if (memo.has(file)) return memo.get(file);
    if (visiting.has(file)) return false;
    visiting.add(file);
    let source = '';
    try {
      source = read(file);
    } catch {
      source = '';
    }
    const specifiers = [...source.matchAll(SPECIFIER)].map(([, raw]) => ({
      raw,
      joined: raw.startsWith('.')
        ? path.posix.normalize(path.posix.join(path.posix.dirname(file), raw))
        : raw,
    }));
    let result = matches(source, specifiers);
    if (!result) {
      for (const {raw} of specifiers) {
        if (!raw.startsWith('.')) continue;
        const target = resolve(file, raw, tracked);
        if (target != null && visit(target, visiting)) {
          result = true;
          break;
        }
      }
    }
    visiting.delete(file);
    memo.set(file, result);
    return result;
  };
  return files.filter(file => TEST_FILE.test(file) && visit(file, new Set()));
}

/**
 * @param {string[]} files tracked repository paths
 * @param {(file: string) => string} read the file's source
 * @returns {string[]} the tests whose import closure reads files
 */
export function fsGuardTests(files, read) {
  return testsWhoseClosure(files, read, source => READS_FILES.test(source));
}

/**
 * The workspace packages a change touches outside their tests: each tracked
 * `package.json` below the root names its directory's package.
 *
 * @param {string[]} files tracked repository paths
 * @param {(file: string) => string} read
 * @param {string[]} changedFiles
 * @returns {{dir: string, name: string}[]}
 */
export function changedWorkspacePackages(files, read, changedFiles) {
  const packages = files
    .filter(
      file => file.endsWith('/package.json') && !file.includes('node_modules/'),
    )
    .flatMap(file => {
      try {
        const name = JSON.parse(read(file)).name;
        return typeof name === 'string'
          ? [{dir: path.posix.dirname(file), name}]
          : [];
      } catch {
        return [];
      }
    })
    // The deepest directory owns a file.
    .sort((a, b) => b.dir.length - a.dir.length);
  const changed = new Map();
  for (const file of changedFiles) {
    if (TEST_FILE.test(file)) continue;
    const owner = packages.find(pkg => file.startsWith(`${pkg.dir}/`));
    if (owner != null) changed.set(owner.name, owner);
  }
  return [...changed.values()];
}

/**
 * The tests a scoped pull request runs beyond `--changed`: every file-system
 * guard, and every test that reaches a changed workspace package through its
 * name or its `dist/`.
 *
 * @param {string[]} files tracked repository paths
 * @param {(file: string) => string} read
 * @param {string[]} changedFiles the pull request's paths
 */
export function scopedExtraTests(files, read, changedFiles = []) {
  const guards = new Set(fsGuardTests(files, read));
  const changed = changedWorkspacePackages(files, read, changedFiles);
  if (changed.length > 0) {
    const reachesBuild = (_source, specifiers) =>
      specifiers.some(({raw, joined}) =>
        changed.some(
          pkg =>
            raw === pkg.name ||
            raw.startsWith(`${pkg.name}/`) ||
            joined.startsWith(`${pkg.dir}/dist/`),
        ),
      );
    for (const test of testsWhoseClosure(files, read, reachesBuild)) {
      guards.add(test);
    }
  }
  return files.filter(file => guards.has(file));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = execFileSync('git', ['ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
  const changedFlag = process.argv.indexOf('--changed');
  const changedFiles =
    changedFlag === -1
      ? []
      : execFileSync(
          'git',
          ['diff', '--name-only', '-z', process.argv[changedFlag + 1], 'HEAD'],
          {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024},
        )
          .split('\0')
          .filter(Boolean);
  const read = file => fs.readFileSync(file, 'utf8');
  const tests = scopedExtraTests(files, read, changedFiles);
  process.stdout.write(tests.length > 0 ? `${tests.join('\n')}\n` : '');
}
