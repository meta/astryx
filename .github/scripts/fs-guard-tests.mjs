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
// - With `--spec-readers --changed <ref>`: instead, the tests that read a
//   changed record (spec, component, family, design or theme spec record;
//   a renamed one under both names). A spec-only pull request runs no other
//   Vitest test, so these are the ones its change can break
//   (spec:AST-030 FR2). `--project ui|node` keeps one Vitest project's.
//
// Usage: node .github/scripts/fs-guard-tests.mjs [--spec-readers [--project ui|node]] [--changed <ref>]
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

/**
 * The roots of the records a spec-only change may touch (change-scope.cjs's
 * spec records): spec and component records, family and design contracts,
 * and theme package specs.
 */
const RECORD_ROOTS = [
  'docs/specs/',
  'docs/families/',
  'docs/design/',
  'packages/themes/',
];
/** A path literal into a record root, relative (`../…/docs/specs/…`) or from the root. */
const RECORD_LITERAL =
  /(['"`])((?:\.\.?\/)*(?:docs\/(?:specs|families|design)|packages\/themes)(?:\/[^'"`\n]*)?)\1/g;
/** `path.join(root, 'docs', 'specs', …)` and the like: the whole root. */
const RECORD_SEGMENTS =
  /(['"])(docs|packages)\1\s*,\s*(['"])(specs|families|design|themes)\3/g;
const RECORD_PATH =
  /^(?:docs\/(?:specs|families|design)\/|packages\/themes\/[^/]+\/[^/]+\.spec\.md$)/;

/** The source without block comments and whole-line `//` comments, where prose names records. */
function code(source) {
  // A comment starts a line or follows whitespace; `/**/` inside a glob
  // string (`'docs/specs/**/spec.md'`) does neither.
  return source
    .replace(/(^|\s)\/\*[\s\S]*?\*\//g, '$1')
    .replace(/^\s*\/\/.*$/gm, '');
}

/**
 * The record paths a file names in its code, as repository paths: an exact
 * record, a directory, or a prefix where code computes the rest. A path that
 * is neither a tracked file nor a tracked directory (`docs/specs/AST-` before
 * `${id}` or `+ id`, or a record since renamed) is cut back to its last `/`:
 * `docs/specs/AST-${id}/spec.md` names the whole spec tree.
 *
 * @param {string} file
 * @param {string} source
 * @param {(candidate: string) => boolean} isPath a tracked file or directory
 */
function recordPathsIn(file, source, isPath) {
  const body = code(source);
  const paths = new Set();
  // Theme packages hold sources as well as their spec, and many tests read
  // those sources; a file reads theme specs only if it also names a
  // `.spec.md`.
  const namesSpecFile = /\.spec\.md['"`]/.test(body);
  const counts = root => root !== 'packages/themes/' || namesSpecFile;
  for (const [, , literal] of body.matchAll(RECORD_LITERAL)) {
    // Code or a glob computes the rest: keep the fixed part.
    const fixed = literal.split(/\$\{|[*?[{]/)[0];
    const joined = fixed.startsWith('.')
      ? path.posix.normalize(path.posix.join(path.posix.dirname(file), fixed))
      : fixed;
    const root = RECORD_ROOTS.find(
      prefix => joined === prefix.slice(0, -1) || joined.startsWith(prefix),
    );
    if (!root || !counts(root)) continue;
    if (joined.length < root.length) {
      paths.add(root);
      continue;
    }
    const bare = joined.replace(/\/$/, '');
    paths.add(
      isPath(bare) ? joined : joined.slice(0, joined.lastIndexOf('/') + 1),
    );
  }
  for (const [, , first, , second] of body.matchAll(RECORD_SEGMENTS)) {
    const root = `${first}/${second}/`;
    if (RECORD_ROOTS.includes(root) && counts(root)) paths.add(root);
  }
  return paths;
}

/**
 * The directories whose tests the Vitest `ui` project collects, read from
 * vitest.config.ts so the two cannot drift; every other test belongs to the
 * `node` project. Throws when the config's `ui` include list has another
 * shape, so a config change fails the lister instead of misrouting tests.
 *
 * @param {string} config the source of vitest.config.ts
 * @returns {string[]} directory prefixes, each ending in `/`
 */
export function uiTestRoots(config) {
  const block = /name:\s*'ui'[\s\S]*?include:\s*\[([\s\S]*?)\]/.exec(config);
  if (!block) throw new Error('vitest.config.ts: no ui project include list');
  const roots = [...block[1].matchAll(/'([^']+)'/g)].map(([, glob]) => {
    const match = /^(.+\/)\*\*\/\*\.test\.\{ts,tsx,mjs\}$/.exec(glob);
    if (!match)
      throw new Error(`vitest.config.ts: unexpected ui include ${glob}`);
    return match[1];
  });
  if (roots.length === 0)
    throw new Error('vitest.config.ts: empty ui project include list');
  return roots;
}

/**
 * The tests that read a record a spec-only change may touch: the import
 * closure (relative imports followed, as for the guards above) reads files
 * and names a record path in its code. With `changedFiles`, only those whose
 * named paths cover a changed record: the record itself, a directory above
 * it, or a computed prefix. A renamed record counts under both names, so the
 * caller passes the change's paths without rename detection.
 *
 * @param {string[]} files tracked repository paths
 * @param {(file: string) => string} read
 * @param {string[] | null} changedFiles the change's paths, or null for every reader
 */
export function specReaderTests(files, read, changedFiles = null) {
  const tracked = new Set(files);
  const directories = new Set();
  for (const file of files) {
    for (let at = file.indexOf('/'); at !== -1; at = file.indexOf('/', at + 1))
      directories.add(file.slice(0, at));
  }
  const isPath = candidate =>
    tracked.has(candidate) || directories.has(candidate);
  const memo = new Map();
  const visit = (file, visiting) => {
    if (memo.has(file)) return memo.get(file);
    const result = {reads: false, paths: new Set()};
    if (visiting.has(file)) return result;
    visiting.add(file);
    let source = '';
    try {
      source = read(file);
    } catch {
      source = '';
    }
    result.reads = READS_FILES.test(source);
    for (const named of recordPathsIn(file, source, isPath))
      result.paths.add(named);
    for (const [, raw] of source.matchAll(SPECIFIER)) {
      if (!raw.startsWith('.')) continue;
      const target = resolve(file, raw, tracked);
      if (target == null) continue;
      const inner = visit(target, visiting);
      result.reads ||= inner.reads;
      for (const named of inner.paths) result.paths.add(named);
    }
    visiting.delete(file);
    memo.set(file, result);
    return result;
  };
  const changedSpecs =
    changedFiles == null
      ? null
      : changedFiles.filter(file => RECORD_PATH.test(file));
  return files.filter(file => {
    if (!TEST_FILE.test(file)) return false;
    const {reads, paths} = visit(file, new Set());
    if (!reads || paths.size === 0) return false;
    if (changedSpecs == null) return true;
    return changedSpecs.some(changed =>
      [...paths].some(
        named =>
          changed === named ||
          changed.startsWith(named.endsWith('/') ? named : `${named}/`),
      ),
    );
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = execFileSync('git', ['ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
  const specReaders = process.argv.includes('--spec-readers');
  const changedFlag = process.argv.indexOf('--changed');
  const changedFiles =
    changedFlag === -1
      ? []
      : execFileSync(
          'git',
          [
            'diff',
            '--name-only',
            '-z',
            // A renamed record counts under its old name too: a test that
            // reads the old path is the one the rename breaks.
            ...(specReaders ? ['--no-renames'] : []),
            process.argv[changedFlag + 1],
            'HEAD',
          ],
          {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024},
        )
          .split('\0')
          .filter(Boolean);
  const read = file => fs.readFileSync(file, 'utf8');
  let tests;
  if (specReaders) {
    tests = specReaderTests(
      files,
      read,
      changedFlag === -1 ? null : changedFiles,
    );
    // `--project ui|node`: only that Vitest project's tests.
    const projectFlag = process.argv.indexOf('--project');
    if (projectFlag !== -1) {
      const project = process.argv[projectFlag + 1];
      if (project !== 'ui' && project !== 'node')
        throw new Error(`--project must be ui or node, not ${project}`);
      const roots = uiTestRoots(read('vitest.config.ts'));
      const inUi = test => roots.some(root => test.startsWith(root));
      tests = tests.filter(test => inUi(test) === (project === 'ui'));
    }
  } else {
    tests = scopedExtraTests(files, read, changedFiles);
  }
  process.stdout.write(tests.length > 0 ? `${tests.join('\n')}\n` : '');
}
