// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whether every relative import of a package's shipped modules names a
 * file the package ships, resolved the way an app's bundler resolves it.
 *
 * @input A package directory and the files it ships: for a package's own
 *   folder, the files on disk that npm packs (pack-state.mjs); for an
 *   installed package, the files on disk (npm unpacked exactly those).
 * @output For each relative import no shipped file answers, a finding naming
 *   the importing file, its line, the specifier, and whether the file exists
 *   but is left out of the package or exists nowhere, with its fix; and each
 *   import whose file npm could not be asked about, as not checked. Each
 *   caller decides how much a finding weighs.
 * @position foundation/integrations, beside the other package checks; run
 *   by `astryx doctor integration validate` (and so `integration check`)
 *   through api/integration/validate-integration.mjs, and by doctor's
 *   added-theme check for the theme a package ships. Everyday commands never
 *   run it.
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
 * set, and the integration manifest; a caller may start it elsewhere (a
 * theme's built module and stylesheets). From a JavaScript or TypeScript
 * module it follows static imports and re-exports, `import()` and
 * `require()` with a literal specifier (moduleImports, in
 * ../render/embedded-imports.mjs); an import or re-export that brings in
 * types only is skipped, as a bundler drops it. From a stylesheet it follows
 * each `@import` and each relative `url()` (cssReferences, beside it); an
 * `@import` that is not a `./` or `../` path may name a package, so it is
 * followed only when it names a shipped file, and never reported.
 * Declaration files are never followed. A specifier resolves as a bundler
 * resolves it (resolveLocalModule with `bundler`, in
 * ../discovery/module-exports.mjs); a stylesheet `@import` may also omit
 * `.css` or name a folder with an `index.css`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {resolveLocalModule} from '../discovery/module-exports.mjs';
import {THEME_BUILD_MARKER} from '../config/theme-build-header.mjs';
import {cssReferences, moduleImports} from '../render/embedded-imports.mjs';
import {allTargets, isRecord} from './exports-subpaths.mjs';
import {outsideFiles, packState} from './pack-state.mjs';

const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/u;
const DECLARATION_FILE = /\.d\.[cm]?ts$/u;
/** Built JavaScript, which an app's bundler loads as it is. */
const BUILT_FILE = /\.[cm]?js$/u;
/** TypeScript source, which only a bundler set to compile it can load. */
const TYPESCRIPT_FILE = /\.[cm]?tsx?$/u;
const STYLESHEET_FILE = /\.css$/iu;
const RELATIVE = /^\.\.?(?:\/|$)/u;
/** A `url()` value that names no file of the package. */
const NOT_A_FILE_URL = /^(?:[a-z][a-z0-9+.-]*:|\/|#|~|%23)/iu;
/** What `main` may leave out, as Node and bundlers read it. */
const ENTRY_EXTENSIONS = ['.js', '.mjs', '.cjs', '.json'];

/**
 * @typedef {object} ShippedFiles
 * @property {(rel: string) => true | false | {unknown: string}} state
 *   whether the package ships the file at this POSIX path, relative to the
 *   package root, or why that cannot be told
 * @property {'npm' | 'disk'} by where the answer comes from
 */

/**
 * @typedef {object} UnshippedImport
 * @property {string} file the importing file, relative to the package root
 * @property {number} [line]
 * @property {string} specifier
 * @property {'not_packed' | 'missing' | 'outside' | 'typescript'} problem
 *   `not_packed`: the file exists but the package does not ship it;
 *   `missing`: no such file; `outside`: the path leaves the package;
 *   `typescript`: a theme module `theme build` wrote imports TypeScript
 *   source, which an app's bundler does not compile from `node_modules` by
 *   default
 * @property {string} [target] the file it names, for `not_packed` and
 *   `typescript`
 */

/**
 * @typedef {object} UncheckedImport
 * @property {string} file the importing file, relative to the package root
 * @property {string} specifier
 * @property {string} reason
 */

/**
 * @typedef {object} ShippedImportFinding
 * @property {'relative_import_not_shipped' | 'built_module_imports_typescript'} code
 * @property {string} message where, what, and the fix
 * @property {string} file the importing file, relative to the package root
 * @property {number} [line]
 */

/** @param {string} file */
const slash = file => file.split(path.sep).join('/');

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

/** @param {string} packageDir @param {string} rel */
function onDisk(packageDir, rel) {
  if (rel.split('/').includes('node_modules')) return false;
  try {
    return fs.statSync(path.join(packageDir, rel)).isFile();
  } catch {
    return false;
  }
}

/**
 * The files on disk under `packageDir`, as the files a package ships: an
 * installed package's, or a linked one's. A path into a nested
 * `node_modules` is another package's.
 * @param {string} packageDir
 * @returns {ShippedFiles}
 */
export function filesOnDisk(packageDir) {
  return {by: 'disk', state: rel => onDisk(packageDir, rel)};
}

/**
 * The files the package in `packageDir` ships: an installed package's files
 * on disk; for a package's own folder, the files on disk that npm packs. npm
 * is asked only about a file that is on disk, only when a `files` field or
 * an ignore file on its path can leave it out, and at most once for this
 * list. When npm cannot answer, a file no `files` entry can reach is left
 * out and any other cannot be told (pack-state.mjs).
 * @param {string} packageDir
 * @returns {ShippedFiles}
 */
export function shippedFiles(packageDir) {
  if (isInstalledPackage(packageDir)) return filesOnDisk(packageDir);
  /** @type {unknown} package.json `files` */
  let declared;
  try {
    declared = JSON.parse(
      fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
    )?.files;
  } catch {
    declared = undefined;
  }
  /** @type {{packed?: {paths: Set<string>} | {error: string}}} what npm packs, asked once */
  const npm = {};
  return {
    by: 'npm',
    state: rel => {
      if (!onDisk(packageDir, rel)) return false;
      const packed = packState(packageDir, rel, declared, npm);
      if (packed.packed === 'unknown') {
        return {
          unknown: Array.isArray(declared)
            ? `${packed.error}, and a \`files\` entry may reach ${rel}`
            : `${packed.error}, and an ignore file may drop ${rel}`,
        };
      }
      return packed.packed;
    },
  };
}

/**
 * The shipped file a relative reference names from `fromRel`, through
 * resolveLocalModule as a bundler resolves it, or why none.
 * @param {string} packageDir
 * @param {string} specifier
 * @param {string} fromRel importing file, POSIX, relative to the package root
 * @param {ShippedFiles} files
 * @param {boolean} stylesheet a stylesheet `@import`
 * @returns {{file: string} | {problem: 'missing' | 'outside'}}
 */
function resolveShipped(packageDir, specifier, fromRel, files, stylesheet) {
  const written = RELATIVE.test(specifier) ? specifier : `./${specifier}`;
  /** @param {string} file */
  const relOf = file => {
    const rel = path.relative(packageDir, file);
    return rel && !rel.startsWith('..') && !path.isAbsolute(rel)
      ? slash(rel)
      : null;
  };
  const found = resolveLocalModule(written, path.join(packageDir, fromRel), {
    bundler: true,
    ...(stylesheet ? {extensions: ['.css']} : {}),
    isFile: file => {
      const rel = relOf(file);
      return rel != null && files.state(rel) !== false;
    },
  });
  const rel = found ? relOf(found) : null;
  if (rel) return {file: rel};
  const base = path.posix.normalize(
    path.posix.join(
      path.posix.dirname(fromRel),
      written.replace(/[?#].*$/su, ''),
    ),
  );
  return base === '..' || base.startsWith('../')
    ? {problem: 'outside'}
    : {problem: 'missing'};
}

/**
 * The relative references one shipped file makes, each with its line; null
 * when it cannot be read or parsed.
 * @param {string} text
 * @param {string} file
 * @returns {Array<{specifier: string, line?: number, stylesheet: boolean, optional: boolean}> | null}
 */
function referencesOf(text, file) {
  if (STYLESHEET_FILE.test(file)) {
    const css = cssReferences(text);
    if (!css) return null;
    return [
      ...css.imports
        .filter(each => !NOT_A_FILE_URL.test(each.url))
        .map(each => ({
          specifier: each.url,
          line: each.line,
          stylesheet: true,
          // A bare path may name a package as well as a file beside the
          // stylesheet.
          optional: !RELATIVE.test(each.url),
        })),
      ...css.urls
        .filter(
          each => !NOT_A_FILE_URL.test(each.url) && !/[\s$(]/u.test(each.url),
        )
        .map(each => ({
          specifier: each.url,
          line: each.line,
          stylesheet: false,
          optional: false,
        })),
    ];
  }
  const imports = moduleImports(text, file);
  if (!imports) return null;
  return imports
    .filter(each => !each.typeOnly && RELATIVE.test(each.specifier))
    .map(each => ({
      specifier: each.specifier,
      line: each.line,
      stylesheet: false,
      optional: false,
    }));
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
  /** @type {unknown[]} */
  const targets = pkg.exports != null ? allTargets(pkg.exports) : [];
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
      const found = [
        rel,
        ...ENTRY_EXTENSIONS.map(each => `${rel}${each}`),
      ].find(each => files.state(each) !== false);
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
        !DECLARATION_FILE.test(child) &&
        files.state(child) !== false
      ) {
        found.push(child);
      }
    }
  };
  walk(folder);
  return found;
}

/**
 * Every relative reference in the graph from `entries` that names no file
 * the package ships, and each whose file cannot be told shipped or not.
 * @param {string} packageDir
 * @param {ShippedFiles} files
 * @param {string[]} entries POSIX paths relative to the package root
 * @returns {{unshipped: UnshippedImport[], unchecked: UncheckedImport[]}}
 */
export function unshippedImports(packageDir, files, entries) {
  /** @type {UnshippedImport[]} */
  const unshipped = [];
  /** @type {UncheckedImport[]} */
  const unchecked = [];
  const disk = filesOnDisk(packageDir);
  const seen = new Set();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = /** @type {string} */ (queue.shift());
    if (seen.has(file)) continue;
    seen.add(file);
    if (DECLARATION_FILE.test(file)) continue;
    if (!STYLESHEET_FILE.test(file) && !CODE_FILE.test(file)) continue;
    let text;
    try {
      text = fs.readFileSync(path.join(packageDir, file), 'utf8');
    } catch {
      continue;
    }
    // A file that does not parse fails the app's build on its own terms.
    for (const reference of referencesOf(text, file) ?? []) {
      const resolved = resolveShipped(
        packageDir,
        reference.specifier,
        file,
        files,
        reference.stylesheet,
      );
      if ('file' in resolved) {
        // A theme module `theme build` wrote that imports TypeScript source:
        // an app's bundler leaves an installed package's TypeScript alone.
        if (
          BUILT_FILE.test(file) &&
          text.slice(0, 400).includes(THEME_BUILD_MARKER) &&
          TYPESCRIPT_FILE.test(resolved.file) &&
          !DECLARATION_FILE.test(resolved.file) &&
          !reference.optional
        )
          unshipped.push({
            file,
            ...(reference.line != null ? {line: reference.line} : {}),
            specifier: reference.specifier,
            problem: 'typescript',
            target: resolved.file,
          });
        const state = files.state(resolved.file);
        if (typeof state === 'object') {
          unchecked.push({
            file,
            specifier: reference.specifier,
            reason: state.unknown,
          });
        }
        queue.push(resolved.file);
        continue;
      }
      if (reference.optional) continue;
      /** @type {UnshippedImport} */
      const finding = {
        file,
        ...(reference.line != null ? {line: reference.line} : {}),
        specifier: reference.specifier,
        problem: resolved.problem,
      };
      if (resolved.problem === 'missing' && files.by === 'npm') {
        // The file a bundler would pick on disk, which the package leaves out.
        const there = resolveShipped(
          packageDir,
          reference.specifier,
          file,
          disk,
          reference.stylesheet,
        );
        if ('file' in there) {
          finding.problem = 'not_packed';
          finding.target = there.file;
        }
      }
      unshipped.push(finding);
    }
  }
  return {unshipped, unchecked};
}

/**
 * The finding for one unshipped import, with its fix. Each caller gives it
 * the weight its command reports it at.
 * @param {UnshippedImport} each
 * @param {unknown} declared package.json `files`
 * @returns {ShippedImportFinding}
 */
function unshippedImportFinding(each, declared) {
  const at = `${each.file}${each.line != null ? `:${each.line}` : ''}`;
  if (each.problem === 'typescript')
    return {
      // A built module that imports TypeScript source.
      code: 'built_module_imports_typescript',
      message: `${at}: built module imports TypeScript source: "${each.specifier}" names ${each.target}, which an app's bundler does not compile from an installed package by default (a plain Next.js app), so the app fails to build. Fix: import a JavaScript build of it, with its extension; for a theme, \`astryx theme build\` compiles the theme's local modules to JavaScript beside its built module.`,
      file: each.file,
      ...(each.line != null ? {line: each.line} : {}),
    };
  const why =
    each.problem === 'outside'
      ? 'which is outside the package'
      : each.problem === 'not_packed'
        ? `which names ${each.target}, a file npm leaves out of the package`
        : 'which is not a file in the package';
  const fix =
    each.problem === 'not_packed'
      ? Array.isArray(declared) && outsideFiles(each.target ?? '', declared)
        ? `add ${each.target} to package.json \`files\`, and confirm with \`npm pack --dry-run\``
        : `make npm pack ${each.target} (a \`files\` entry or an ignore line drops it), and confirm with \`npm pack --dry-run\``
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
 * names no file it ships, and each import it could not check. The graph
 * starts from `entries` when given, else from the package's entries
 * (`packageEntryFiles`) and its integration manifest.
 * @param {string} packageDir
 * @param {{files?: ShippedFiles, manifestFile?: string, entries?: string[]}} [options]
 *   `files`: the shipped files (default `shippedFiles(packageDir)`);
 *   `entries`: absolute files to start from instead
 * @returns {{findings: ShippedImportFinding[], unchecked: UncheckedImport[]}}
 */
export function shippedImportFindings(packageDir, options = {}) {
  /** @type {Record<string, unknown>} */
  let pkg;
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
    );
    if (!isRecord(parsed)) return {findings: [], unchecked: []};
    pkg = parsed;
  } catch {
    // package.json problems are reported by their own check.
    return {findings: [], unchecked: []};
  }
  const files = options.files ?? shippedFiles(packageDir);
  /** @param {string} file */
  const shipped = file => {
    const rel = slash(path.relative(packageDir, file));
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return files.state(rel) !== false ? rel : null;
  };
  const entries = options.entries
    ? options.entries.map(shipped)
    : [
        ...packageEntryFiles(packageDir, pkg, files),
        options.manifestFile ? shipped(options.manifestFile) : null,
      ];
  const {unshipped, unchecked} = unshippedImports(
    packageDir,
    files,
    entries.filter(each => each != null),
  );
  return {
    findings: unshipped.map(each => unshippedImportFinding(each, pkg.files)),
    unchecked,
  };
}
