// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whether every relative import of a package's shipped modules names a
 * file the package ships, resolved the way an app's bundler resolves it.
 *
 * @input A package directory and the files it ships: what
 *   `npm pack --dry-run` lists for a package's own folder, or the files on
 *   disk for an installed one (npm unpacked exactly those).
 * @output For each relative import no shipped file answers, the importing
 *   file, its line, the specifier, and whether the file exists outside the
 *   package's files (npm leaves it out) or nowhere.
 * @position foundation/integrations, beside the other package checks; run
 *   by `astryx doctor integration validate` (and so `integration check`)
 *   through api/integration/validate-integration.mjs, by the project's
 *   integration issues (`astryx doctor`) for installed packages, and by
 *   doctor's added-theme check for the theme a package ships.
 *
 * Loading a module in Node proves nothing about the package an app installs:
 * in the package's own folder every file is on disk, whether npm packs it or
 * not, and a theme module load reads stylesheets as empty modules, so their
 * `@import` and `url()` references are never followed. This module reads the
 * import graph itself and resolves each relative reference against the
 * shipped files alone.
 *
 * The graph starts at what an app or the CLI loads from the package: every
 * `exports` target (wildcards filled in from the shipped files), `main`,
 * `module` and a string `browser`, the root `index.js` when none of those is
 * set, and the integration manifest; callers may add their own starts (a
 * theme's built module and stylesheets). From a JavaScript or TypeScript
 * module it follows static imports and re-exports, `import()` and
 * `require()` with a literal specifier, and `import x = require()`; an
 * `import type`, an `export type`, and an import whose every binding is an
 * inline `type` are types only and are skipped, as a bundler drops them.
 * From a stylesheet it follows each `@import` and each relative `url()`; an
 * `@import` that is not a `./` or `../` path may name a package, so it is
 * followed only when it names a shipped file, and never reported. Declaration files are never followed.
 *
 * A specifier resolves as bundlers resolve one: the exact file; with
 * `.js`/`.mjs`/`.cjs`/`.jsx`/`.ts`/`.tsx`/`.mts`/`.cts`/`.json` added; a
 * `.js`-family specifier to the TypeScript file of the same stem; a folder
 * through its `package.json` `module` or `main`, then its `index` with any
 * of those extensions. A stylesheet `@import` may also omit `.css` or name a
 * folder with an `index.css`. A `?query` or `#hash` suffix is not part of the
 * file.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {babelParse as parse} from '../runtime/lazy-dependencies.mjs';
import {npmCommand} from '../release/cache.mjs';
import {allTargets, isRecord} from './exports-subpaths.mjs';

const require = createRequire(import.meta.url);
/** @type {typeof import('postcss') | undefined} */
let postcssModule;
/**
 * postcss, loaded on first use: only a package that ships a stylesheet needs
 * it, and every command that loads integrations reaches this module.
 * @returns {typeof import('postcss')}
 */
const postcss = () => (postcssModule ??= require('postcss'));

/** What a bundler adds to an extensionless specifier, in its order. */
const MODULE_EXTENSIONS = [
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.json',
];

/** The TypeScript files a `.js`-family specifier may name. */
const TYPESCRIPT_FOR = /** @type {Record<string, string[]>} */ ({
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
});

const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/u;
const DECLARATION_FILE = /\.d\.[cm]?ts$/u;
const STYLESHEET_FILE = /\.css$/u;
/** A `url()` value that names no file of the package. */
const NOT_A_FILE_URL = /^(?:[a-z][a-z0-9+.-]*:|\/|#|~|%23)/iu;

/**
 * @typedef {object} ShippedFiles
 * @property {(rel: string) => boolean} has whether the package ships the
 *   file at this POSIX path, relative to the package root
 * @property {'npm' | 'disk'} by where the list comes from
 */

/**
 * @typedef {object} UnshippedImport
 * @property {string} file the importing file, relative to the package root
 * @property {number} [line]
 * @property {string} specifier
 * @property {'not_packed' | 'missing' | 'outside'} problem `not_packed`: the
 *   file exists but the package does not ship it; `missing`: no such file;
 *   `outside`: the path leaves the package
 * @property {string} [target] the file it would name, relative to the
 *   package root, for `not_packed`
 */

/** @param {string} file */
const slash = file => file.split(path.sep).join('/');

/**
 * The paths npm packs for the package in `base`, read from
 * `npm pack --dry-run --json --ignore-scripts` (nothing runs, nothing is
 * written), started the way the CLI starts npm everywhere else, or why npm
 * could not answer.
 * @param {string} base
 * @returns {{paths: Set<string>} | {error: string}}
 */
export function npmPackedPaths(base) {
  let npm;
  try {
    npm = npmCommand();
  } catch {
    return {error: 'npm was not found'};
  }
  const result = spawnSync(
    npm.command,
    [
      ...npm.prefix,
      'pack',
      '--dry-run',
      '--json',
      '--ignore-scripts',
      '--silent',
    ],
    {
      cwd: base,
      encoding: 'utf-8',
      shell: false,
      timeout: 60_000,
      // One line per packed file: room for a very large package.
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  if (result.error) return {error: `npm did not run (${result.error.message})`};
  if (result.status !== 0) {
    let code = '';
    try {
      code = JSON.parse(result.stdout)?.error?.code ?? '';
    } catch {
      // not JSON
    }
    return {
      error: `npm pack failed${code ? ` (${code})` : ` with exit ${result.status}`}`,
    };
  }
  try {
    const [info] = JSON.parse(result.stdout);
    if (Array.isArray(info?.files)) {
      return {
        paths: new Set(
          info.files.map((/** @type {{path: string}} */ f) => f.path),
        ),
      };
    }
  } catch {
    // fall through
  }
  return {error: 'npm pack printed no file list'};
}

/**
 * Whether the package in `packageDir` was installed by a package manager:
 * its real path runs through a `node_modules` folder. Its files on disk are
 * then the files it ships.
 * @param {string} packageDir
 */
export function isInstalledPackage(packageDir) {
  let real = packageDir;
  try {
    real = fs.realpathSync(packageDir);
  } catch {
    // An unreadable folder is judged by the path it was given.
  }
  return real.split(path.sep).includes('node_modules');
}

/**
 * The files on disk under `packageDir`, as the files an installed package
 * ships. A path into a nested `node_modules` is another package's.
 * @param {string} packageDir
 * @returns {ShippedFiles}
 */
export function filesOnDisk(packageDir) {
  return {
    by: 'disk',
    has: rel => {
      if (rel.split('/').includes('node_modules')) return false;
      try {
        return fs.statSync(path.join(packageDir, rel)).isFile();
      } catch {
        return false;
      }
    },
  };
}

/**
 * The files the package in `packageDir` ships: the files on disk for an
 * installed package; for a package's own folder, what `npm pack --dry-run`
 * lists. When npm cannot answer, the files on disk stand in, so an import of
 * a file that exists nowhere is still found.
 * @param {string} packageDir
 * @returns {ShippedFiles}
 */
export function shippedFiles(packageDir) {
  if (isInstalledPackage(packageDir)) return filesOnDisk(packageDir);
  const packed = npmPackedPaths(packageDir);
  if ('error' in packed) return filesOnDisk(packageDir);
  return {by: 'npm', has: rel => packed.paths.has(rel)};
}

/**
 * The shipped file a relative specifier names from `fromRel`, or why none.
 * @param {string} specifier
 * @param {string} fromRel importing file, POSIX, relative to the package root
 * @param {ShippedFiles} files
 * @param {{stylesheet?: boolean, read: (rel: string) => string | null}} options
 *   `stylesheet`: a stylesheet `@import`, which may omit `.css`; `read`
 *   reads a shipped file's text (a folder's package.json)
 * @returns {{file: string} | {problem: 'missing' | 'outside', base: string}}
 */
export function resolveShippedImport(specifier, fromRel, files, options) {
  const bare = specifier.replace(/[?#].*$/su, '');
  const base = path.posix.normalize(
    path.posix.join(path.posix.dirname(fromRel), bare),
  );
  if (base === '..' || base.startsWith('../') || path.posix.isAbsolute(base)) {
    return {problem: 'outside', base};
  }
  const candidates = [base];
  const ext = path.posix.extname(base);
  for (const typed of TYPESCRIPT_FOR[ext] ?? []) {
    candidates.push(`${base.slice(0, -ext.length)}${typed}`);
  }
  if (options.stylesheet) {
    candidates.push(`${base}.css`, `${base}/index.css`);
  } else {
    candidates.push(...MODULE_EXTENSIONS.map(each => `${base}${each}`));
    const manifest = files.has(`${base}/package.json`)
      ? options.read(`${base}/package.json`)
      : null;
    if (manifest != null) {
      try {
        const pkg = JSON.parse(manifest);
        for (const field of ['module', 'main']) {
          if (typeof pkg[field] !== 'string') continue;
          const entry = path.posix.normalize(path.posix.join(base, pkg[field]));
          candidates.push(
            entry,
            ...MODULE_EXTENSIONS.map(each => `${entry}${each}`),
          );
        }
      } catch {
        // A package.json that does not parse names no entry.
      }
    }
    candidates.push(...MODULE_EXTENSIONS.map(each => `${base}/index${each}`));
  }
  const found = candidates.find(candidate => files.has(candidate));
  return found ? {file: found} : {problem: 'missing', base};
}

/** @param {string} file */
function parsePlugins(file) {
  const plugins = [
    'decorators-legacy',
    'importAttributes',
    'exportDefaultFrom',
  ];
  if (/\.[cm]?ts$/u.test(file)) return ['typescript', ...plugins];
  if (/\.tsx$/u.test(file)) return ['typescript', 'jsx', ...plugins];
  return ['jsx', ...plugins];
}

/**
 * @param {any} node
 * @returns {string | null} a literal specifier
 */
function literal(node) {
  if (node?.type === 'StringLiteral') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value?.cooked ?? null;
  }
  return null;
}

/**
 * Whether an import or re-export brings in nothing at run time: `import
 * type`/`export type`, or named bindings that are each an inline `type`.
 * @param {any} node
 */
function typesOnly(node) {
  if (node.importKind === 'type' || node.exportKind === 'type') return true;
  const specifiers = node.specifiers ?? [];
  return (
    specifiers.length > 0 &&
    specifiers.every(
      (/** @type {any} */ each) =>
        each.importKind === 'type' || each.exportKind === 'type',
    )
  );
}

/**
 * The relative specifiers a JavaScript or TypeScript module loads at run
 * time, each with its line; null when the module does not parse.
 * @param {string} text
 * @param {string} file
 * @returns {Array<{specifier: string, line?: number}> | null}
 */
function moduleReferences(text, file) {
  let ast;
  try {
    ast = parse(text, {
      sourceType: 'unambiguous',
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      plugins: /** @type {any} */ (parsePlugins(file)),
    });
  } catch {
    return null;
  }
  /** @type {Array<{specifier: string, line?: number}>} */
  const found = [];
  /** @param {string | null} specifier @param {any} node */
  const add = (specifier, node) => {
    if (specifier != null && /^\.\.?(?:\/|$)/u.test(specifier)) {
      found.push({specifier, line: node.loc?.start?.line});
    }
  };
  /** @param {any} node */
  const visit = node => {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const each of node) visit(each);
      return;
    }
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportNamedDeclaration':
      case 'ExportAllDeclaration':
        if (node.source && !typesOnly(node)) add(literal(node.source), node);
        break;
      case 'TSImportEqualsDeclaration':
        if (
          node.importKind !== 'type' &&
          node.moduleReference?.type === 'TSExternalModuleReference'
        ) {
          add(literal(node.moduleReference.expression), node);
        }
        break;
      case 'ImportExpression':
        add(literal(node.source), node);
        break;
      case 'CallExpression':
        if (
          node.callee?.type === 'Import' ||
          (node.callee?.type === 'Identifier' &&
            node.callee.name === 'require' &&
            node.arguments.length === 1)
        ) {
          add(literal(node.arguments[0]), node);
        }
        break;
      default:
        break;
    }
    for (const key of Object.keys(node)) {
      if (
        key === 'loc' ||
        key === 'leadingComments' ||
        key === 'trailingComments' ||
        key === 'innerComments' ||
        // Type positions load nothing at run time.
        key === 'typeAnnotation' ||
        key === 'returnType' ||
        key === 'typeParameters'
      ) {
        continue;
      }
      const value = node[key];
      if (value && typeof value === 'object') visit(value);
    }
  };
  visit(ast.program);
  return found;
}

/** @param {string} value */
function unquote(value) {
  const trimmed = value.trim();
  return /^(['"]).*\1$/su.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
}

/**
 * The file references a stylesheet makes: each `@import` (as a stylesheet
 * import; one that is not a `./` or `../` path is `optional`) and each
 * relative `url()`. Null when the stylesheet does not parse.
 * @param {string} text
 * @returns {Array<{specifier: string, line?: number, stylesheet: boolean, optional?: boolean}> | null}
 */
function stylesheetReferences(text) {
  let root;
  try {
    root = postcss().parse(text);
  } catch {
    return null;
  }
  /** @type {Array<{specifier: string, line?: number, stylesheet: boolean, optional?: boolean}>} */
  const found = [];
  root.walkAtRules('import', rule => {
    const params = rule.params.trim();
    const url = /^url\(\s*([^)]*?)\s*\)/iu.exec(params);
    const quoted = /^(['"])(.*?)\1/su.exec(params);
    const specifier = url ? unquote(url[1]) : quoted ? quoted[2] : null;
    if (specifier == null || NOT_A_FILE_URL.test(specifier)) return;
    found.push({
      specifier,
      line: rule.source?.start?.line,
      stylesheet: true,
      // A bare path may name a package as well as a file beside the
      // stylesheet: it is followed when it names a shipped file, and never
      // reported.
      ...(/^\.\.?\//u.test(specifier) ? {} : {optional: true}),
    });
  });
  root.walkDecls(decl => {
    for (const match of decl.value.matchAll(/url\(\s*([^)]*?)\s*\)/giu)) {
      const specifier = unquote(match[1]);
      if (specifier === '' || NOT_A_FILE_URL.test(specifier)) continue;
      if (/[\s$(]/u.test(specifier)) continue;
      found.push({
        specifier,
        line: decl.source?.start?.line,
        stylesheet: false,
      });
    }
  });
  return found;
}

/**
 * Where the graph starts in a package: each `exports` target (a wildcard
 * filled in from the shipped files under its folder), `main`, `module` and a
 * string `browser`, or the root `index.js` when none of those is set. Only
 * files the package ships, and never a declaration file.
 * @param {string} packageDir
 * @param {Record<string, unknown>} pkg
 * @param {ShippedFiles} files
 * @returns {string[]}
 */
export function packageEntryFiles(packageDir, pkg, files) {
  /** @type {string[]} */
  const targets = [];
  if (pkg.exports != null) {
    targets.push(...allTargets(pkg.exports));
  }
  for (const field of ['main', 'module', 'browser']) {
    if (typeof pkg[field] === 'string') targets.push(pkg[field]);
  }
  if (targets.length === 0) targets.push('./index.js');
  /** @type {Set<string>} */
  const entries = new Set();
  for (const target of targets) {
    if (typeof target !== 'string') continue;
    const rel = path.posix.normalize(target.replace(/^\.\//u, ''));
    if (rel.startsWith('../') || DECLARATION_FILE.test(rel)) continue;
    if (!rel.includes('*')) {
      // `main` may leave out its extension.
      const named = [rel, ...MODULE_EXTENSIONS.map(each => `${rel}${each}`)];
      const found = named.find(each => files.has(each));
      if (found) entries.add(found);
      continue;
    }
    for (const file of wildcardFiles(packageDir, rel, files)) entries.add(file);
  }
  return [...entries];
}

/**
 * The shipped files an `exports` wildcard target names: the files under the
 * folder before its `*` that match the whole pattern.
 * @param {string} packageDir
 * @param {string} pattern POSIX, relative to the package root
 * @param {ShippedFiles} files
 * @returns {string[]}
 */
function wildcardFiles(packageDir, pattern, files) {
  const [head, ...rest] = pattern.split('*');
  const tail = rest.join('*');
  const folder = head.includes('/') ? head.slice(0, head.lastIndexOf('/')) : '';
  /** @type {string[]} */
  const found = [];
  /** @param {string} rel */
  const walk = rel => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(packageDir, rel), {
        withFileTypes: true,
      });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child);
      else if (
        child.startsWith(head) &&
        child.endsWith(tail) &&
        child.length >= head.length + tail.length &&
        files.has(child)
      ) {
        found.push(child);
      }
    }
  };
  walk(folder);
  return found.filter(file => !DECLARATION_FILE.test(file));
}

/**
 * Every relative reference in the graph from `entries` that names no file
 * the package ships, and the shipped files the check could not read.
 * @param {string} packageDir
 * @param {ShippedFiles} files
 * @param {string[]} entries POSIX paths relative to the package root
 * @returns {{unshipped: UnshippedImport[], unread: string[]}}
 */
export function unshippedImports(packageDir, files, entries) {
  /** @param {string} rel */
  const read = rel => {
    try {
      return fs.readFileSync(path.join(packageDir, rel), 'utf8');
    } catch {
      return null;
    }
  };
  /** @type {UnshippedImport[]} */
  const unshipped = [];
  /** @type {string[]} */
  const unread = [];
  const seen = new Set();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = /** @type {string} */ (queue.shift());
    if (seen.has(file)) continue;
    seen.add(file);
    const stylesheet = STYLESHEET_FILE.test(file);
    if (DECLARATION_FILE.test(file)) continue;
    if (!stylesheet && !CODE_FILE.test(file)) continue;
    const text = read(file);
    const references =
      text == null
        ? null
        : stylesheet
          ? stylesheetReferences(text)
          : moduleReferences(text, file);
    if (references == null) {
      unread.push(file);
      continue;
    }
    for (const reference of references) {
      const asStylesheet =
        'stylesheet' in reference && reference.stylesheet === true;
      const resolved = resolveShippedImport(reference.specifier, file, files, {
        stylesheet: asStylesheet,
        read,
      });
      if ('file' in resolved) {
        queue.push(resolved.file);
        continue;
      }
      if ('optional' in reference && reference.optional === true) continue;
      /** @type {UnshippedImport} */
      const finding = {
        file,
        ...(reference.line != null ? {line: reference.line} : {}),
        specifier: reference.specifier,
        problem: resolved.problem,
      };
      if (resolved.problem === 'missing' && files.by === 'npm') {
        // The file a bundler would pick on disk, when npm leaves it out.
        const onDisk = resolveShippedImport(
          reference.specifier,
          file,
          filesOnDisk(packageDir),
          {stylesheet: asStylesheet, read},
        );
        if ('file' in onDisk) {
          finding.problem = 'not_packed';
          finding.target = onDisk.file;
        }
      }
      unshipped.push(finding);
    }
  }
  return {unshipped, unread};
}

/**
 * @typedef {object} ShippedImportFinding
 * @property {'relative_import_not_shipped'} code
 * @property {string} message where, what, and the fix
 * @property {string} file the importing file, relative to the package root
 * @property {number} [line]
 */

/**
 * The finding for one unshipped import, with its fix. Each caller gives it
 * the weight its command reports it at.
 * @param {UnshippedImport} each
 * @returns {ShippedImportFinding}
 */
export function unshippedImportFinding(each) {
  const at = `${each.file}${each.line != null ? `:${each.line}` : ''}`;
  const why =
    each.problem === 'outside'
      ? 'which is outside the package'
      : each.problem === 'not_packed'
        ? `which names ${each.target}, a file npm leaves out of the package`
        : 'which is not a file in the package';
  const fix =
    each.problem === 'not_packed'
      ? `add ${each.target} to package.json \`files\` (or remove the ignore line that drops it), and confirm with \`npm pack --dry-run\``
      : each.problem === 'outside'
        ? 'move the file into the package and import it from there'
        : 'add the file to the package, or correct the import';
  return {
    // A relative import of a shipped module names no file the package ships.
    code: 'relative_import_not_shipped',
    message: `${at}: imports "${each.specifier}", ${why}, so an app that installs it fails to build. Fix: ${fix}.`,
    file: each.file,
    ...(each.line != null ? {line: each.line} : {}),
  };
}

/**
 * A finding for every relative import of the package's shipped modules that
 * names no file it ships. The graph starts from `entries` when given, else
 * from the package's entries (`packageEntryFiles`) and its integration
 * manifest.
 * @param {string} packageDir
 * @param {{files?: ShippedFiles, manifestFile?: string, entries?: string[]}} [options]
 *   `files`: the shipped files (default `shippedFiles(packageDir)`);
 *   `entries`: absolute files to start from instead
 * @returns {ShippedImportFinding[]}
 */
export function shippedImportFindings(packageDir, options = {}) {
  /** @type {Record<string, unknown>} */
  let pkg;
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
    );
    if (!isRecord(parsed)) return [];
    pkg = parsed;
  } catch {
    // package.json problems are reported by their own check.
    return [];
  }
  const files = options.files ?? shippedFiles(packageDir);
  /** @param {string} file */
  const shipped = file => {
    const rel = path.relative(packageDir, file);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return files.has(slash(rel)) ? slash(rel) : null;
  };
  const entries = options.entries
    ? options.entries.map(shipped)
    : [
        ...packageEntryFiles(packageDir, pkg, files),
        options.manifestFile ? shipped(options.manifestFile) : null,
      ];
  return unshippedImports(
    packageDir,
    files,
    entries.filter(each => each != null),
  ).unshipped.map(unshippedImportFinding);
}
