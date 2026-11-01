// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Source-level checks that what an integration package tells apps to
 * import is importable, read without a build.
 *
 * @input A package directory and its loaded integration record.
 * @output Notes, listed on validate's result and never counted (they fail
 *   `--strict` from the next minor), for: a component's import (the doc's
 *   `import`, or the one the CLI derives) or a template's public import whose
 *   subpath package.json `exports` does not declare (or that names another
 *   package), or whose module does not export the component; a component
 *   example that imports an undeclared subpath or a name its package does not
 *   export; a template source with no default export, or one that imports a
 *   relative path outside the templates root, an undeclared subpath of its own
 *   package or of Core, or a name its package does not export. Imports it
 *   cannot judge are listed in a report.
 * @position foundation/integrations, beside the other on-disk contribution
 *   validators; run by `astryx doctor integration validate` (and so by
 *   `integration check`) through api/integration/validate-integration.mjs.
 *
 * An `exports` target may point at build output that does not exist yet, so
 * only the declared subpath is judged here, never the target file. A name is
 * judged only when a declared target exists on disk and its export list can be
 * read completely, and (for a name other than a doc's component) no
 * TypeScript file in the package has a `declare module` block for one of its
 * own modules (which can add names to it); anything less is left to
 * `integration verify`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {parse} from '@babel/parser';
import {findProjectCoreDir} from '../fs/paths.mjs';
import {normalizeProviderId} from '../identity/provider-identity.mjs';
import {
  discoverIntegrationComponents,
  resolveIntegrationImportPath,
} from '../discovery/component-discovery.mjs';
import {loadComponentDoc} from '../discovery/component-loader.mjs';
import {discoverIntegrationTemplatesForOne} from '../discovery/template-adapter.mjs';
import {
  allTargets,
  importable,
  isRecord,
  subpathDeclaration,
} from './exports-subpaths.mjs';

/**
 * @typedef {import('./issue').AstryxIntegrationIssue} Issue
 */

const CORE = '@astryxdesign/core';
const MODULE_EXTENSIONS = [
  '.tsx',
  '.ts',
  '.mts',
  '.jsx',
  '.mjs',
  '.js',
  '.cjs',
  '.cts',
];

/** @param {string} file */
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/** @param {string} file */
function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** @param {string} from @param {string} to */
function rel(from, to) {
  return path.relative(from, to).split(path.sep).join('/');
}

// ── Import specifiers ───────────────────────────────────────────────

/**
 * Split a bare specifier into its package name and `./`-prefixed subpath.
 * @param {string} specifier
 * @returns {{pkg: string, subpath: string} | null}
 */
export function splitSpecifier(specifier) {
  const m = /^((?:@[^/\s]+\/)?[^/\s]+)(\/.*)?$/.exec(specifier);
  if (!m || specifier.startsWith('.') || specifier.startsWith('/')) return null;
  return {pkg: m[1], subpath: m[2] ? `.${m[2]}` : '.'};
}

/**
 * @typedef {object} ImportBinding
 * @property {string} imported the exported name (`default` for a default import)
 * @property {boolean} typeOnly
 */

/**
 * @typedef {object} ImportStatement
 * @property {string} source
 * @property {ImportBinding[]} names
 * @property {boolean} namespace
 * @property {boolean} [typeOnly] the whole statement is `import type`
 */

const PARSE_PLUGINS = /** @type {any} */ ([
  'jsx',
  'typescript',
  'decorators-legacy',
  'importAttributes',
  'exportDefaultFrom',
]);

/** The plugins without `jsx`: `.ts` files allow `<T>value` assertions. */
const TS_PARSE_PLUGINS = PARSE_PLUGINS.filter(
  (/** @type {unknown} */ plugin) => plugin !== 'jsx',
);

/**
 * @param {string} text
 * @param {{jsx?: boolean}} [options] `jsx: false` parses TypeScript only
 */
function parseModuleText(text, {jsx = true} = {}) {
  return parse(text, {
    sourceType: 'module',
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
    errorRecovery: true,
    plugins: jsx ? PARSE_PLUGINS : TS_PARSE_PLUGINS,
  });
}

const IMPORT_RE =
  /(?:^|[;\n])\s*import\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g;

/**
 * Read the import statements of a module or a snippet: named, default,
 * aliased, namespace and type-only. A snippet that does not parse (an example
 * with elisions, say) falls back to reading `import … from '…'` lines.
 * @param {string} text
 * @returns {ImportStatement[]}
 */
export function readImports(text) {
  /** @type {ImportStatement[]} */
  const out = [];
  let ast;
  try {
    ast = parseModuleText(text);
  } catch {
    // Not a module: read the import lines below.
  }
  if (ast) {
    for (const node of ast.program.body) {
      if (node.type !== 'ImportDeclaration') continue;
      const typeOnly = node.importKind === 'type';
      /** @type {ImportStatement} */
      const statement = {
        source: String(node.source.value),
        names: [],
        namespace: false,
        typeOnly,
      };
      for (const s of node.specifiers ?? []) {
        if (s.type === 'ImportDefaultSpecifier') {
          statement.names.push({imported: 'default', typeOnly});
        } else if (s.type === 'ImportNamespaceSpecifier') {
          statement.namespace = true;
        } else if (s.type === 'ImportSpecifier') {
          const imported =
            s.imported.type === 'Identifier'
              ? s.imported.name
              : String(s.imported.value);
          statement.names.push({
            imported,
            typeOnly: typeOnly || s.importKind === 'type',
          });
        }
      }
      out.push(statement);
    }
    return out;
  }
  for (const m of text.matchAll(IMPORT_RE)) {
    const typeOnly = Boolean(m[1]);
    const clause = m[2].trim();
    /** @type {ImportStatement} */
    const statement = {
      source: m[3],
      names: [],
      namespace: /\*\s*as\s/.test(clause),
      typeOnly,
    };
    const braces = /\{([^}]*)\}/.exec(clause);
    const head = clause
      .replace(/\{[^}]*\}/, '')
      .replace(/\*\s*as\s+[\w$]+/, '');
    const defaultName = /^([\w$]+)/.exec(head.trim());
    if (defaultName) statement.names.push({imported: 'default', typeOnly});
    if (braces) {
      for (const part of braces[1].split(',')) {
        const item = part.trim();
        if (!item) continue;
        const t = /^type\s+/.test(item);
        const name = item
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0]
          .trim();
        if (/^[\w$]+$/.test(name))
          statement.names.push({imported: name, typeOnly: typeOnly || t});
      }
    }
    out.push(statement);
  }
  return out;
}

// ── package.json exports ────────────────────────────────────────────

/** @typedef {import('./exports-subpaths.mjs').SubpathDeclaration} SubpathDeclaration */

/**
 * The files on disk a declared subpath can load, in condition order of the
 * package.json (any condition); empty when none exists yet (build output).
 * @param {string} packageDir
 * @param {SubpathDeclaration} declaration
 * @returns {string[]}
 */
function existingTargets(packageDir, declaration) {
  if (declaration.state !== 'declared') return [];
  const root = path.resolve(packageDir);
  return allTargets(declaration.value)
    .filter(target => target.startsWith('./'))
    .map(target =>
      path.resolve(root, target.replaceAll('*', declaration.wildcard ?? '')),
    )
    .filter(
      file =>
        (file === root || file.startsWith(root + path.sep)) && isFile(file),
    );
}

/**
 * How a package declares one subpath. A package with no `exports` keeps its
 * legacy deep paths: a subpath that names a file on disk (with or without a
 * module extension, or a folder index) counts as declared.
 * @param {unknown} exportsField
 * @param {string} packageDir
 * @param {string} subpath
 * @returns {SubpathDeclaration}
 */
function declarationIn(exportsField, packageDir, subpath) {
  const declaration = subpathDeclaration(exportsField, subpath);
  if (declaration.state !== 'no_exports') return declaration;
  if (subpath === '.') return {state: 'declared', value: null, wildcard: ''};
  const root = path.resolve(packageDir);
  const base = path.resolve(root, subpath.slice(2));
  if (!base.startsWith(root + path.sep)) return declaration;
  const file = [
    base,
    ...MODULE_EXTENSIONS.map(ext => `${base}${ext}`),
    ...MODULE_EXTENSIONS.map(ext => path.join(base, `index${ext}`)),
  ].find(isFile);
  return file
    ? {state: 'declared', value: `./${rel(root, file)}`, wildcard: ''}
    : declaration;
}

/**
 * A declared subpath of the package whose target is `file`, if any: an exact
 * key, or a wildcard key whose target pattern matches the file.
 * @param {unknown} exportsField
 * @param {string} packageDir
 * @param {string} file
 * @returns {string | null}
 */
function subpathFor(exportsField, packageDir, file) {
  if (!isRecord(exportsField)) return null;
  const wanted = `./${rel(packageDir, file)}`;
  for (const [key, value] of Object.entries(exportsField)) {
    if (!key.startsWith('.') || !importable(value)) continue;
    for (const target of allTargets(value)) {
      if (!key.includes('*')) {
        if (target === wanted) return key;
        continue;
      }
      const star = target.indexOf('*');
      if (star === -1) continue;
      const prefix = target.slice(0, star);
      const suffix = target.slice(star + 1);
      if (
        wanted.startsWith(prefix) &&
        wanted.endsWith(suffix) &&
        wanted.length >= prefix.length + suffix.length
      ) {
        return key.replace(
          '*',
          wanted.slice(prefix.length, wanted.length - suffix.length),
        );
      }
    }
  }
  return null;
}

/**
 * The condition names an export value uses, at any depth, in order.
 * @param {unknown} value
 * @param {string[]} [out]
 * @returns {string[]}
 */
function conditionNames(value, out = []) {
  if (Array.isArray(value)) for (const v of value) conditionNames(v, out);
  else if (isRecord(value)) {
    for (const [key, v] of Object.entries(value)) {
      if (!out.includes(key)) out.push(key);
      conditionNames(v, out);
    }
  }
  return out;
}

/**
 * Why a declared state is not importable, in words.
 * @param {SubpathDeclaration} declaration
 * @param {string} subpath
 */
function whyUndeclared(declaration, subpath) {
  const {state} = declaration;
  switch (state) {
    case 'no_exports':
      return `package.json has no "exports" and no file exists at "${subpath}"`;
    case 'root_only':
      return `package.json "exports" names only the package root, which blocks every subpath`;
    case 'blocked':
      return `package.json "exports" maps "${subpath}" to null`;
    case 'not_importable': {
      const names = conditionNames(declaration.value);
      const listed = names.map(name => `"${name}"`).join(', ');
      return names.length === 0
        ? `package.json "exports" gives "${subpath}" no target an ES module import can load`
        : `package.json "exports" gives "${subpath}" only the ${listed} condition${names.length === 1 ? '' : 's'}, none of which an ES module import loads`;
    }
    default:
      return `package.json "exports" does not declare "${subpath}"`;
  }
}

/**
 * The paste-ready package.json change that declares `subpath` → `target`.
 * @param {unknown} exportsField
 * @param {SubpathDeclaration['state']} state
 * @param {string} subpath
 * @param {string} target `./`-prefixed package-relative file
 */
function exportsFix(exportsField, state, subpath, target) {
  const entry = `${JSON.stringify(subpath)}: ${JSON.stringify(target)}`;
  if (state === 'no_exports') {
    return `point it at a file the package ships, or add "exports": {${entry}} to package.json (an "exports" map makes every path it does not list private, so list "." and the package's other public paths too).`;
  }
  if (state === 'root_only') {
    return `make "exports" a subpath map: {".": ${JSON.stringify(exportsField)}, ${entry}}.`;
  }
  if (state === 'not_importable') {
    return `add an ES module condition to "${subpath}" in package.json "exports", e.g. "default": ${JSON.stringify(target)} (or the built file).`;
  }
  if (state === 'blocked') {
    return `replace the null for "${subpath}" in package.json "exports" with ${JSON.stringify(target)}, or stop advertising it.`;
  }
  return `add ${entry} to package.json "exports" (or the built file it compiles to).`;
}

// ── Module export names ─────────────────────────────────────────────

/**
 * Export lists read during one public-import check, by file. Scoped to that
 * check, so a later check in the same process rereads every module.
 * @typedef {Map<string, {names: Set<string>, complete: boolean, types: Set<string>, typed: boolean}>} ExportNameCache
 */

const DECLARATION_RE = /\.d\.[cm]?ts$/u;
const DECLARATION_EXTENSIONS = ['.d.ts', '.d.mts', '.d.cts'];

/**
 * The declaration file beside a built module (`x.js` → `x.d.ts`), if any.
 * @param {string} file
 * @returns {string | null}
 */
function declarationTwin(file) {
  const m = /\.([cm]?)jsx?$/u.exec(file);
  if (!m) return null;
  const stem = file.slice(0, m.index);
  return (
    [`.d.${m[1]}ts`, '.d.ts'].map(ext => `${stem}${ext}`).find(isFile) ?? null
  );
}

/** @param {string} specifier @param {string} fromFile */
function resolveRelative(specifier, fromFile) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const stripped = base.replace(/\.(?:m?js|jsx|cjs)$/u, '');
  // TypeScript source resolves `./x.js` to `./x.ts` (or .tsx, .d.ts) first.
  if (TYPED_RE.test(fromFile) && !DECLARATION_RE.test(fromFile)) {
    const source = [
      ...['.ts', '.tsx', '.mts', '.cts'].map(ext => `${stripped}${ext}`),
      ...DECLARATION_EXTENSIONS.map(ext => `${stripped}${ext}`),
    ].find(isFile);
    if (source && stripped !== base) return source;
  }
  // A declaration file's `export * from './x.js'` names `./x.d.ts`.
  if (DECLARATION_RE.test(fromFile)) {
    const twin = [
      ...DECLARATION_EXTENSIONS.map(ext => `${stripped}${ext}`),
      ...DECLARATION_EXTENSIONS.map(ext => path.join(base, `index${ext}`)),
    ].find(isFile);
    if (twin) return twin;
  }
  const candidates = [
    base,
    ...MODULE_EXTENSIONS.map(ext => `${base}${ext}`),
    ...MODULE_EXTENSIONS.map(ext => `${stripped}${ext}`),
    ...MODULE_EXTENSIONS.map(ext => path.join(base, `index${ext}`)),
  ];
  return candidates.find(isFile) ?? null;
}

/**
 * Every name (runtime or type) a module exports, and whether the list is
 * complete: an `export *` from another package, `export =`, or a module that
 * does not parse leaves it incomplete, and then no name is judged missing.
 * @param {string} file
 * @param {ExportNameCache} [cache] export lists already read in this check
 * @returns {{names: Set<string>, complete: boolean, types: Set<string>, typed: boolean}}
 *   `types`: the names exported only as types (an interface, a type alias,
 *   `export type`); `typed`: the list includes every type the module
 *   exports (TypeScript source, or a JavaScript module whose declaration
 *   file was read in full), so a name absent from it is absent as a type too
 */
export function moduleExportNames(file, cache = new Map()) {
  const {names, complete, types, typed} = readExportNames(file, cache, []);
  return {names, complete, types, typed};
}

/** TypeScript source or a declaration file: its exports include its types. */
const TYPED_RE = /\.(?:[cm]?tsx?)$/u;

/**
 * One module's export list, following local `export *` declarations. `stack`
 * holds the modules whose lists are being read: an `export *` that reaches one
 * of them closes a cycle, and a list read through a cycle the module does not
 * close is not cached, since it lacks what the module on the stack exports.
 * @param {string} file
 * @param {ExportNameCache} cache
 * @param {string[]} stack
 * @returns {{names: Set<string>, complete: boolean, types: Set<string>, typed: boolean, cycleTo: Set<string>}}
 */
function readExportNames(file, cache, stack) {
  if (stack.includes(file)) {
    return {
      names: new Set(),
      complete: true,
      types: new Set(),
      typed: true,
      cycleTo: new Set([file]),
    };
  }
  const cached = cache.get(file);
  if (cached) return {...cached, cycleTo: new Set()};
  const own = readOwnExportNames(file, cache, stack);
  const {names, types, cycleTo} = own;
  let {complete, typed} = own;
  // A JavaScript module's declaration file lists its types, at every level
  // an `export *` reaches.
  const twin = declarationTwin(file);
  if (twin && !stack.includes(twin)) {
    const declared = readExportNames(twin, cache, [...stack, file]);
    for (const name of declared.names) names.add(name);
    for (const name of declared.types) types.add(name);
    for (const each of declared.cycleTo) cycleTo.add(each);
    if (declared.complete && declared.typed) {
      complete = true;
      typed = true;
    }
  }
  cycleTo.delete(file);
  const value = {names, complete, types, typed};
  if (cycleTo.size === 0) cache.set(file, value);
  return {...value, cycleTo};
}

/**
 * The exports one module itself declares, following local `export *` (each
 * through {@link readExportNames}); its declaration file is merged by the
 * caller.
 * @param {string} file
 * @param {ExportNameCache} cache
 * @param {string[]} stack
 * @returns {{names: Set<string>, complete: boolean, types: Set<string>, typed: boolean, cycleTo: Set<string>}}
 */
function readOwnExportNames(file, cache, stack) {
  /** @type {Set<string>} */
  const names = new Set();
  /** @type {Set<string>} */
  const types = new Set();
  /** @type {Set<string>} */
  const cycleTo = new Set();
  let typed = TYPED_RE.test(file);
  /** @param {boolean} complete */
  const done = complete => ({names, complete, types, typed, cycleTo});
  // A CommonJS module's exports cannot be read from declarations: leave it
  // unjudged rather than read it as exporting nothing. That is any .cjs/.cts
  // file, any file (built `dist/*.js` included) with no ES module import or
  // export, and any file that also assigns `module.exports` or `exports.*`.
  if (/\.c[jt]s$/u.test(file)) return done(false);
  let complete = true;
  let ast;
  let text;
  try {
    text = fs.readFileSync(file, 'utf-8');
    ast = parseModuleText(text);
    if (ast.errors?.length) complete = false;
  } catch {
    return done(false);
  }
  const esm = ast.program.body.some(
    (/** @type {any} */ node) =>
      node.type === 'ImportDeclaration' ||
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportDefaultDeclaration' ||
      node.type === 'ExportAllDeclaration' ||
      node.type === 'TSExportAssignment',
  );
  // A declaration file with no import or export is a global script: no
  // module import can read it (TypeScript: "is not a module"). Not judged.
  if (!esm) return done(false);
  if (/\b(?:module\.exports|exports\.[\w$]+)\s*=/u.test(text)) {
    return done(false);
  }
  // A declaration file that is a module exports every top-level declaration,
  // marked or not, unless it has an export list (`export {}`, `export {…}
  // from`), `export *`, `export =`, or a default export of an expression
  // (TypeScript's rule for ambient modules). A default-exported declaration
  // (`export default function`, `class`, `interface`) does not end it.
  if (DECLARATION_RE.test(file)) {
    const implicit = !ast.program.body.some(
      (/** @type {any} */ node) =>
        (node.type === 'ExportNamedDeclaration' && !node.declaration) ||
        (node.type === 'ExportDefaultDeclaration' &&
          ![
            'FunctionDeclaration',
            'TSDeclareFunction',
            'ClassDeclaration',
            'TSInterfaceDeclaration',
          ].includes(node.declaration?.type)) ||
        node.type === 'TSExportAssignment' ||
        node.type === 'ExportAllDeclaration',
    );
    if (implicit) {
      for (const node of ast.program.body) {
        const d = /** @type {any} */ (
          node.type === 'ExportNamedDeclaration' ? node.declaration : node
        );
        if (!d) continue;
        if (d.type === 'VariableDeclaration') {
          for (const v of d.declarations ?? []) {
            if (v.id?.type === 'Identifier') names.add(v.id.name);
            else complete = false;
          }
        } else if (
          d.type === 'TSInterfaceDeclaration' ||
          d.type === 'TSTypeAliasDeclaration'
        ) {
          names.add(d.id.name);
          types.add(d.id.name);
        } else if (
          [
            'FunctionDeclaration',
            'TSDeclareFunction',
            'ClassDeclaration',
            'TSEnumDeclaration',
            'TSModuleDeclaration',
          ].includes(d.type) &&
          d.id?.type === 'Identifier'
        ) {
          names.add(d.id.name);
        }
      }
    }
  }
  for (const node of ast.program.body) {
    if (node.type === 'ExportDefaultDeclaration') names.add('default');
    else if (node.type === 'TSExportAssignment') complete = false;
    else if (
      node.type === 'TSImportEqualsDeclaration' &&
      /** @type {any} */ (node).isExport
    ) {
      // `export import Alias = Inner.Value` exports Alias. Whether a
      // type-only one names a value cannot be read, so the list is no longer
      // complete.
      names.add(/** @type {any} */ (node).id.name);
      if (/** @type {any} */ (node).importKind === 'type') {
        types.add(/** @type {any} */ (node).id.name);
        complete = false;
      }
    } else if (node.type === 'ExportNamedDeclaration') {
      const d = /** @type {any} */ (node.declaration);
      const typeOnly = /** @type {any} */ (node).exportKind === 'type';
      if (d) {
        if (d.id?.name) {
          names.add(d.id.name);
          if (
            typeOnly ||
            d.type === 'TSInterfaceDeclaration' ||
            d.type === 'TSTypeAliasDeclaration'
          ) {
            types.add(d.id.name);
          }
        }
        for (const v of d.declarations ?? []) {
          if (v.id?.type === 'Identifier') names.add(v.id.name);
          else complete = false;
        }
      }
      for (const sp of /** @type {any[]} */ (node.specifiers ?? [])) {
        const exported = sp.exported?.name ?? sp.exported?.value;
        if (!exported) continue;
        names.add(exported);
        if (typeOnly || sp.exportKind === 'type') types.add(exported);
      }
    } else if (node.type === 'ExportAllDeclaration') {
      const n = /** @type {any} */ (node);
      if (n.exported) {
        names.add(n.exported.name ?? n.exported.value);
        continue;
      }
      const source = String(n.source.value);
      const target = source.startsWith('.')
        ? resolveRelative(source, file)
        : null;
      if (!target) {
        complete = false;
        continue;
      }
      const inner = readExportNames(target, cache, [...stack, file]);
      for (const name of inner.names) if (name !== 'default') names.add(name);
      for (const name of inner.types) types.add(name);
      if (!inner.complete) complete = false;
      if (!inner.typed) typed = false;
      for (const each of inner.cycleTo) cycleTo.add(each);
    }
  }
  return done(complete);
}

/**
 * Every file a declared subpath names, and whether each is on disk.
 * @param {string} packageDir
 * @param {SubpathDeclaration} declaration
 * @returns {{files: string[], allPresent: boolean}}
 */
function declaredTargets(packageDir, declaration) {
  if (declaration.state !== 'declared') return {files: [], allPresent: false};
  const root = path.resolve(packageDir);
  const all = allTargets(declaration.value)
    .filter(target => target.startsWith('./'))
    .map(target =>
      path.resolve(root, target.replaceAll('*', declaration.wildcard ?? '')),
    )
    .filter(file => file === root || file.startsWith(root + path.sep));
  const files = all.filter(isFile);
  return {files, allPresent: files.length === all.length};
}

/**
 * The names an import statement asks for that the module provably lacks.
 * A name is missing only when every file the subpath names is on disk and
 * read in full, and at least one of those lists includes its types: any
 * construct the reader does not model leaves the import unchecked.
 * @param {ImportStatement} statement
 * @param {string[]} files candidate targets on disk
 * @param {ExportNameCache} cache
 * @param {boolean} [allPresent] every target the subpath names is on disk
 * @param {boolean} [values] every name is known to be a value (a component),
 *   so a list without the module's types can still judge it
 * @returns {string[] | null} null when it cannot be judged
 */
function missingNames(
  statement,
  files,
  cache,
  allPresent = true,
  values = false,
) {
  // A type-only name may live only in a declaration file: not judged.
  const wanted = statement.names
    .filter(binding => !binding.typeOnly)
    .map(binding => binding.imported);
  if (wanted.length === 0) return [];
  if (files.length === 0) return null;
  // Any condition's file (source or built) that has every name settles it.
  let incomplete = false;
  let typed = false;
  /** @type {Set<string>} */
  const seen = new Set();
  for (const file of files) {
    const list = moduleExportNames(file, cache);
    if (wanted.every(name => list.names.has(name))) return [];
    if (!list.complete) incomplete = true;
    if (list.typed) typed = true;
    for (const name of list.names) seen.add(name);
  }
  // A target not built yet, a list cut short, or one without the module's
  // types (a name written without `type` may be a type) is not judged.
  if (incomplete || (!typed && !values) || !allPresent) return null;
  return wanted.filter(name => !seen.has(name));
}

const AUGMENTATION_HINT_RE = /\bdeclare\s+module\b/u;
const TYPESCRIPT_FILE_RE = /\.(?:d\.[cm]?ts|[cm]?ts|tsx)$/u;
const AUGMENTATION_WALK_LIMIT = 5000;

/**
 * Whether a TypeScript file has a real `declare module '<spec>'` block for a
 * module of this package: a relative spec, or the package's own name or a
 * subpath of it. Comments, `declare global`, wildcard specs (`'*.css'`) and
 * other packages' names do not count. A `.tsx` file is parsed with JSX, any
 * other TypeScript file without it (so `<T>value` assertions parse); a file
 * with `declare module` in its text that still fails to parse counts as
 * augmenting.
 * @param {Context} ctx
 * @param {string} text
 * @param {string} file
 */
function augmentsOwnModule(ctx, text, file) {
  if (!AUGMENTATION_HINT_RE.test(text)) return false;
  let body;
  try {
    body = parseModuleText(text, {jsx: file.endsWith('.tsx')}).program.body;
  } catch {
    return true;
  }
  return body.some(node => {
    const d = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
    if (d?.type !== 'TSModuleDeclaration' || d.id?.type !== 'StringLiteral')
      return false;
    const spec = String(d.id.value);
    if (spec.includes('*')) return false;
    if (spec.startsWith('./') || spec.startsWith('../')) return true;
    return (
      ctx.name != null && (spec === ctx.name || spec.startsWith(`${ctx.name}/`))
    );
  });
}

/**
 * The first TypeScript file in the package (outside `node_modules` and dot
 * folders) with a `declare module '…'` block for a module of the package,
 * read once per check. Such a block can add names to that module, so while
 * one exists no name is judged missing: what TypeScript merges is not
 * modelled. A package too large to walk counts as augmented.
 * @param {Context} ctx
 * @returns {string | null} the reason names were not checked, or null
 */
function augmentationReason(ctx) {
  if (ctx.augmentation !== undefined) return ctx.augmentation;
  const root = path.resolve(ctx.packageDir);
  /** @type {string[]} */
  const queue = [root];
  let seen = 0;
  /** @type {string | null} */
  let reason = null;
  walk: while (queue.length > 0) {
    const current = /** @type {string} */ (queue.shift());
    let entries;
    try {
      entries = fs.readdirSync(current, {withFileTypes: true});
    } catch {
      continue;
    }
    entries.sort((x, y) => x.name.localeCompare(y.name));
    for (const entry of entries) {
      if (++seen > AUGMENTATION_WALK_LIMIT) {
        reason = `the package has more than ${AUGMENTATION_WALK_LIMIT} files to search for a \`declare module\` block, which can add names to its modules, so the names it imports were not checked`;
        break walk;
      }
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.'))
          queue.push(full);
        continue;
      }
      if (!entry.isFile() || !TYPESCRIPT_FILE_RE.test(entry.name)) continue;
      let text;
      try {
        text = fs.readFileSync(full, 'utf-8');
      } catch {
        continue;
      }
      if (augmentsOwnModule(ctx, text, entry.name)) {
        reason = `"${rel(root, full)}" has a \`declare module\` block for a module of the package, which can add names to it, so the names it imports were not checked`;
        break walk;
      }
    }
  }
  ctx.augmentation = reason;
  return reason;
}

/**
 * Why an import's names could not be judged.
 * @param {string[]} files
 * @param {boolean} [allPresent]
 */
function uncheckedReason(files, allPresent = true) {
  if (files.length === 0 || !allPresent) {
    return 'a file its package.json "exports" entry names does not exist yet (build output), so the names it imports were not checked';
  }
  return "its module's export list cannot be read in full (CommonJS, an `export *` from another package, a parse error, or JavaScript with no declaration file for its types), so the names it imports were not checked";
}

/**
 * Whether `name` reads as a component: PascalCase, not ALL CAPS.
 * @param {string} name
 */
function isComponentName(name) {
  return /^[A-Z]/u.test(name) && /[a-z]/u.test(name);
}

/**
 * The export a template's default export should be: an exported function or
 * class first, else an exported `const`, each only when its name is
 * PascalCase (not ALL CAPS) and not only a type; null when there is none to
 * suggest (a hook such as `useAccount`, a helper such as `formatBalance`, a
 * constant such as `ACCOUNT_LIMIT`), and then the fix stays generic.
 * @param {string} text the template source
 * @param {{names: Set<string>, types: Set<string>}} exported
 * @returns {string | null}
 */
function defaultExportCandidate(text, exported) {
  let body;
  try {
    body = parseModuleText(text).program.body;
  } catch {
    return null;
  }
  /** @type {Map<string, 'callable' | 'const'>} top-level bindings by kind */
  const local = new Map();
  /** @param {any} d */
  const record = d => {
    if (
      (d?.type === 'FunctionDeclaration' || d?.type === 'ClassDeclaration') &&
      d.id?.name
    ) {
      local.set(d.id.name, 'callable');
    } else if (d?.type === 'VariableDeclaration' && d.kind === 'const') {
      for (const v of d.declarations ?? []) {
        if (v.id?.type === 'Identifier') local.set(v.id.name, 'const');
      }
    }
  };
  for (const node of body) {
    record(node.type === 'ExportNamedDeclaration' ? node.declaration : node);
  }
  /** @type {{name: string, kind: 'callable' | 'const'}[]} */
  const candidates = [];
  for (const node of body) {
    if (node.type !== 'ExportNamedDeclaration') continue;
    const n = /** @type {any} */ (node);
    if (n.exportKind === 'type') continue;
    const d = n.declaration;
    /** @type {string[]} */
    const names = d
      ? d.id?.name
        ? [d.id.name]
        : (d.declarations ?? [])
            .map((/** @type {any} */ v) => v.id?.name)
            .filter(Boolean)
      : n.source
        ? []
        : (n.specifiers ?? [])
            .filter((/** @type {any} */ sp) => sp.exportKind !== 'type')
            .filter(
              (/** @type {any} */ sp) =>
                (sp.exported?.name ?? sp.exported?.value) === sp.local?.name,
            )
            .map((/** @type {any} */ sp) => sp.local.name);
    for (const name of names) {
      const kind = local.get(name);
      if (kind) candidates.push({name, kind});
    }
  }
  const fits = (/** @type {{name: string}} */ c) =>
    isComponentName(c.name) && !exported.types.has(c.name);
  return (
    candidates.find(c => c.kind === 'callable' && fits(c))?.name ??
    candidates.find(c => c.kind === 'const' && fits(c))?.name ??
    null
  );
}

/**
 * Whether `name` is a bare npm package name (an optional `@scope/` and a
 * name), the only form an import can name the package by.
 * @param {string} name
 */
function isPackageName(name) {
  try {
    normalizeProviderId(name);
    return true;
  } catch {
    return false;
  }
}

// ── Listed findings ─────────────────────────────────────────────────

/**
 * A public-import finding as a note on validate's result: listed with its
 * fix inside the message, never counted or failed on. It becomes a failing
 * warning in the next minor release (a new failure code joins only in a
 * minor).
 * @param {string} code
 * @param {string} message
 * @returns {PublicImportNote}
 */
function listed(code, message) {
  return {code, message};
}

// ── Checks ──────────────────────────────────────────────────────────

/**
 * @typedef {object} Context
 * @property {string} packageDir
 * @property {string | null} name the package name; null when package.json has
 *   none, and then no import of the package's own name is judged
 * @property {unknown} exportsField
 * @property {string | null} coreDir
 * @property {any} corePkg
 * @property {PublicImportUnchecked[]} unchecked what could not be judged
 * @property {ExportNameCache} exportNames export lists read in this check
 * @property {string | null} [augmentation] why no name is judged missing
 *   (a module augmentation in the package); null when none, unset until read
 * @property {string[]} files the package.json `files` entries, normalized
 * @property {string[]} roots the integration's contribution roots, absolute
 */

const BUILT_EXTENSION_RE = /\.[cm]?jsx?$/u;

/**
 * Whether an undeclared deep path, in a package with no `exports`, points
 * into build output that is not built yet: its top folder is missing, or is
 * a `files` folder that holds no contribution root. Such an import cannot be
 * judged from source.
 * @param {Context} ctx
 * @param {string} subpath
 * @param {SubpathDeclaration} declaration
 */
function unbuiltOutput(ctx, subpath, declaration) {
  if (declaration.state !== 'no_exports' || subpath === '.') return false;
  const top = subpath.slice(2).split('/')[0];
  if (!top) return false;
  const topDir = path.resolve(ctx.packageDir, top);
  if (!fs.existsSync(topDir)) return true;
  return (
    ctx.files.includes(top) &&
    !ctx.roots.some(
      root => root === topDir || root.startsWith(topDir + path.sep),
    )
  );
}

/**
 * The reason an import into unbuilt output is listed as not checked.
 * @param {string} subpath
 */
function unbuiltReason(subpath) {
  return `package.json has no "exports", and "${subpath}" is build output that is not built yet, so it was not checked`;
}

/**
 * The target a fix maps `subpath` to: the component's source for a source
 * path, never a TypeScript source for a built `.js` path.
 * @param {string} subpath
 * @param {string | null} sourceTarget
 */
function fixTarget(subpath, sourceTarget) {
  if (
    sourceTarget &&
    !(
      BUILT_EXTENSION_RE.test(subpath) && !BUILT_EXTENSION_RE.test(sourceTarget)
    )
  ) {
    return sourceTarget;
  }
  return BUILT_EXTENSION_RE.test(subpath)
    ? `<the built file "${subpath}" names>`
    : `./${subpath.slice(2)}.tsx`;
}

/** @typedef {import('../../api/integration/validate-integration.type.mjs').PublicImportUnchecked} PublicImportUnchecked */
/** @typedef {import('../../api/integration/validate-integration.type.mjs').PublicImportsReport} PublicImportsReport */
/** @typedef {{code: string, message: string}} PublicImportNote */

/**
 * Whether nothing a statement imports exists at run time: a statement-level
 * `import type`, or named bindings that are each an inline `type`.
 * @param {ImportStatement} statement
 */
function typeOnlyStatement(statement) {
  if (statement.typeOnly) return true;
  return (
    !statement.namespace &&
    statement.names.length > 0 &&
    statement.names.every(binding => binding.typeOnly)
  );
}

/**
 * The files the `types` conditions of an export value name that an ES module
 * import can reach (never one under `require`), with a wildcard filled in.
 * @param {unknown} value
 * @param {string} wildcard
 * @param {boolean} [underTypes]
 * @param {string[]} [out]
 * @returns {string[]}
 */
function typesTargets(value, wildcard, underTypes = false, out = []) {
  if (typeof value === 'string') {
    if (underTypes) out.push(value.replace('*', wildcard));
  } else if (Array.isArray(value)) {
    for (const v of value) typesTargets(v, wildcard, underTypes, out);
  } else if (isRecord(value)) {
    for (const [condition, v] of Object.entries(value)) {
      if (condition === 'require') continue;
      typesTargets(v, wildcard, underTypes || condition === 'types', out);
    }
  }
  return out;
}

/**
 * The names a declaration file exports as types: exported interfaces and
 * type aliases, `export type {…}`, and `export {…}` of a local interface or
 * type alias. Anything else (a value, an `export *`) is not counted, so an
 * import of it is listed as not checked. Null when the file cannot be read.
 * @param {string} file
 * @returns {Set<string> | null}
 */
function declaredTypeNames(file) {
  let ast;
  try {
    ast = parse(fs.readFileSync(file, 'utf-8'), {
      sourceType: 'module',
      errorRecovery: true,
      plugins: /** @type {any} */ ([
        ['typescript', {dts: /\.d\.[cm]?ts$/u.test(file)}],
      ]),
    });
  } catch {
    return null;
  }
  /** @type {Set<string>} */
  const local = new Set();
  /** @type {Set<string>} */
  const names = new Set();
  /** @param {any} node */
  const typeName = node =>
    node &&
    (node.type === 'TSInterfaceDeclaration' ||
      node.type === 'TSTypeAliasDeclaration')
      ? node.id.name
      : null;
  for (const node of ast.program.body) {
    const own = typeName(node);
    if (own) local.add(own);
    if (node.type === 'ExportNamedDeclaration') {
      const declared = typeName(node.declaration);
      if (declared) local.add(declared);
    }
  }
  /** @param {any} n */
  const exportedName = n =>
    n.type === 'Identifier' ? n.name : String(n.value);
  for (const node of ast.program.body) {
    if (node.type !== 'ExportNamedDeclaration') continue;
    const declared = typeName(node.declaration);
    if (declared) names.add(declared);
    for (const s of node.specifiers ?? []) {
      if (s.type !== 'ExportSpecifier') continue;
      const exported = exportedName(s.exported);
      if (node.exportKind === 'type' || s.exportKind === 'type')
        names.add(exported);
      else if (!node.source && local.has(exportedName(s.local)))
        names.add(exported);
    }
  }
  return names;
}

/**
 * An import of a subpath whose `exports` entry has only `types` targets is
 * never judged as a run-time import: accepted when it is `import type`, its
 * every binding is an inline `type`, or every name it imports is one the
 * `types` file declares as a type; otherwise the reason it was not checked.
 * @param {Context} ctx
 * @param {ImportStatement} statement
 * @param {string} subpath
 * @param {SubpathDeclaration} declaration
 * @returns {string | null}
 */
function typesOnlyImport(ctx, statement, subpath, declaration) {
  if (typeOnlyStatement(statement)) return null;
  const not = `"${subpath}" reaches an ES module import only through a "types" target in package.json "exports", which nothing loads at run time`;
  if (statement.namespace || statement.names.length === 0)
    return `${not}, and a namespace or side-effect import of it cannot be judged from source, so it was not checked`;
  const files = typesTargets(declaration.value, declaration.wildcard ?? '');
  /** @type {Set<string>} */
  const types = new Set();
  let read = false;
  for (const target of files) {
    const found = declaredTypeNames(path.resolve(ctx.packageDir, target));
    if (!found) continue;
    read = true;
    for (const n of found) types.add(n);
  }
  if (!read)
    return `${not}, and its types file ${files.map(f => `"${f}"`).join(', ')} could not be read (it may be build output), so it was not checked`;
  const unknown = statement.names
    .filter(binding => !binding.typeOnly && !types.has(binding.imported))
    .map(binding => binding.imported);
  if (unknown.length === 0) return null;
  return `${not}, and its types file does not declare ${unknown.join(', ')} as a type, so it was not checked`;
}

/**
 * How an import of the package's own name is judged: the declaration when
 * `exports` does not declare its subpath, the names its module provably
 * lacks, or the reason it was not checked.
 * @param {Context} ctx
 * @param {ImportStatement} statement
 * @param {string} subpath
 * @returns {{undeclared: SubpathDeclaration | null, missing: string[] | null, reason: string | null}}
 */
function judgeOwnImport(ctx, statement, subpath) {
  const declaration = declarationIn(ctx.exportsField, ctx.packageDir, subpath);
  // A subpath an ES module import reaches only through `types` (any other
  // condition beside it, such as `require`, loads nothing for it) is judged as
  // a type import, never as a run-time one.
  if (
    declaration.state === 'not_importable' &&
    typesTargets(declaration.value, declaration.wildcard ?? '').length > 0
  ) {
    const reason = typesOnlyImport(ctx, statement, subpath, declaration);
    return {undeclared: null, missing: [], reason};
  }
  if (declaration.state !== 'declared')
    return {undeclared: declaration, missing: null, reason: null};
  if (subpath === '.' && declaration.value == null) {
    return {
      undeclared: null,
      missing: null,
      reason:
        'package.json has no "exports", and the root module "main" names is not read, so the names it imports were not checked',
    };
  }
  const {files, allPresent} = declaredTargets(ctx.packageDir, declaration);
  const missing = missingNames(statement, files, ctx.exportNames, allPresent);
  const augmented = missing?.length ? augmentationReason(ctx) : null;
  if (augmented) return {undeclared: null, missing: null, reason: augmented};
  return {
    undeclared: null,
    missing,
    reason: missing == null ? uncheckedReason(files, allPresent) : null,
  };
}

/**
 * A declared subpath of the package whose module, read in full, exports
 * `name`: the one the component's source is exported under first.
 * @param {Context} ctx
 * @param {string} name
 * @param {string | null} preferred
 * @returns {string | null}
 */
function subpathExporting(ctx, name, preferred) {
  if (!isRecord(ctx.exportsField)) return null;
  /** @param {string} subpath */
  const exportsName = subpath =>
    existingTargets(
      ctx.packageDir,
      declarationIn(ctx.exportsField, ctx.packageDir, subpath),
    ).some(file => moduleExportNames(file, ctx.exportNames).names.has(name));
  // The source's own subpath, which may come from a wildcard key, first.
  if (preferred && exportsName(preferred)) return preferred;
  for (const key of Object.keys(ctx.exportsField)) {
    if (!key.startsWith('.') || key.includes('*') || key === preferred)
      continue;
    if (exportsName(key)) return key;
  }
  return null;
}

/**
 * A component doc's import specifier, and every example's imports.
 * @param {Context} ctx
 * @param {any} integration
 * @returns {Promise<PublicImportNote[]>}
 */
async function componentIssues(ctx, integration) {
  /** @type {PublicImportNote[]} */
  const issues = [];
  // Every component check compares imports with the package's own name.
  if (ctx.name == null) return issues;
  let records;
  try {
    records = discoverIntegrationComponents(integration);
  } catch {
    return issues; // an unreadable root is reported by the root validators
  }
  /** @type {Map<string, typeof records>} */
  const byDoc = new Map();
  for (const record of records) {
    const list = byDoc.get(record.docPath) ?? [];
    list.push(record);
    byDoc.set(record.docPath, list);
  }
  for (const [docPath, list] of byDoc) {
    let doc;
    try {
      doc = await loadComponentDoc(docPath);
    } catch {
      continue; // reported by the doc validators
    }
    if (!isRecord(doc)) continue;
    const shownDoc = rel(ctx.packageDir, docPath);
    const record = list[0];
    const source = record.sourcePath;
    const sourceTarget = source ? `./${rel(ctx.packageDir, source)}` : null;
    // The import the doc writes, or the one the CLI derives for it (its
    // folder's subpath when exported, else the package root).
    const authored = typeof doc.import === 'string' ? doc.import : null;
    const specifier =
      authored ??
      resolveIntegrationImportPath(
        {
          exportsMap: /** @type {any} */ (ctx.exportsField) ?? null,
          packageDir: ctx.packageDir,
          docPath,
          packageName: ctx.name,
        },
        record.name,
      );
    const split = splitSpecifier(specifier);
    // The entry that exports this component alone, and the doc import that
    // uses it: never one component's file as the package root or folder.
    const entryKey = sourceTarget
      ? sourceTarget.replace(/\.[cm]?[jt]sx?$/u, '')
      : null;
    const perComponent = entryKey
      ? `add "${entryKey}": "${sourceTarget}" to package.json "exports" and set import: '${ctx.name}${entryKey.slice(1)}' in the doc`
      : null;
    const gives = authored
      ? `gives import "${specifier}"`
      : `has no import, so apps are told to import from "${specifier}"`;
    const declared = source
      ? subpathFor(ctx.exportsField, ctx.packageDir, source)
      : null;
    const suggested =
      declared ??
      (sourceTarget ? sourceTarget.replace(/\.[cm]?[jt]sx?$/u, '') : null);
    if (split && split.pkg !== ctx.name) {
      issues.push(
        listed(
          'component_import_other_package',
          `Component doc "${shownDoc}" ${gives}, which names package "${split.pkg}", not this package "${ctx.name}", so apps are told to import the component from somewhere it is not. Fix: set import: '${ctx.name}${suggested ? suggested.slice(1) : ''}' in the doc.`,
        ),
      );
    } else if (split) {
      const declaration = declarationIn(
        ctx.exportsField,
        ctx.packageDir,
        split.subpath,
      );
      if (unbuiltOutput(ctx, split.subpath, declaration)) {
        ctx.unchecked.push({
          file: shownDoc,
          specifier,
          reason: unbuiltReason(split.subpath),
        });
      } else if (
        declaration.state === 'declared' &&
        split.subpath === '.' &&
        declaration.value == null
      ) {
        // A package with no exports resolves its root through main: not read.
        ctx.unchecked.push({
          file: shownDoc,
          specifier,
          reason:
            'package.json has no "exports", and the root module "main" names is not read, so the component names were not checked',
        });
      } else if (declaration.state === 'declared') {
        // A doc whose `name` differs from the name it is listed under is
        // judged by the doc-name check (`doc_name_mismatch`), never here.
        const judged = list.filter(
          r => typeof doc.name !== 'string' || doc.name === r.name,
        );
        const {files, allPresent} = declaredTargets(
          ctx.packageDir,
          declaration,
        );
        const statement = {
          source: specifier,
          names: judged.map(r => ({imported: r.name, typeOnly: false})),
          namespace: false,
        };
        // A component is a run-time export, which no augmentation adds, so
        // a missing one is reported whatever the package declares.
        const missing =
          judged.length === 0
            ? []
            : missingNames(statement, files, ctx.exportNames, allPresent, true);
        if (missing == null) {
          ctx.unchecked.push({
            file: shownDoc,
            specifier,
            reason: uncheckedReason(files, allPresent),
          });
        }
        for (const name of missing ?? []) {
          const there = subpathExporting(ctx, name, declared);
          // The per-component entry helps only when the component's source
          // exports the name itself and the doc does not already use it.
          const ownEntry =
            perComponent != null &&
            source != null &&
            entryKey !== split.subpath &&
            moduleExportNames(source, ctx.exportNames).names.has(name);
          const fix = there
            ? `set import: '${ctx.name}${there === '.' ? '' : there.slice(1)}' in the doc (that subpath exports it), or export "${name}" from the module "${specifier}" loads.`
            : `export "${name}" from the module "${specifier}" loads${ownEntry ? `, or ${perComponent}` : ''}.`;
          issues.push(
            listed(
              'component_import_missing_name',
              `Component doc "${shownDoc}" ${gives}, but that module does not export "${name}", so apps that follow the doc get nothing. Fix: ${fix}`,
            ),
          );
        }
      } else {
        const already =
          declared && declared !== split.subpath
            ? `set import: '${ctx.name}${declared.slice(1)}' (already exported), or `
            : '';
        issues.push(
          listed(
            'component_import_not_exported',
            `Component doc "${shownDoc}" ${gives}, but ${whyUndeclared(declaration, split.subpath)}, so apps cannot import the component from it. Fix: ${already}${split.subpath === '.' && perComponent ? `${perComponent}.` : exportsFix(ctx.exportsField, declaration.state, split.subpath, fixTarget(split.subpath, sourceTarget))}`,
          ),
        );
      }
    }

    /**
     * Whether the module at a declared subpath exports every value name the
     * statement imports (and it imports at least one).
     * @param {ImportStatement} statement
     * @param {string} candidate
     */
    const providesAll = (statement, candidate) => {
      if (!statement.names.some(binding => !binding.typeOnly)) return false;
      const declaration = declarationIn(
        ctx.exportsField,
        ctx.packageDir,
        candidate,
      );
      if (declaration.state !== 'declared' || declaration.value == null)
        return false;
      const {files, allPresent} = declaredTargets(ctx.packageDir, declaration);
      const missing = missingNames(
        statement,
        files,
        ctx.exportNames,
        allPresent,
      );
      return Array.isArray(missing) && missing.length === 0;
    };

    /**
     * Where an example with an undeclared import should import from: the
     * doc's own import, when it differs from the example's and is declared;
     * else the subpath the component's source is already exported under;
     * else the exact `exports` entry to add for the example's subpath.
     * Another subpath is offered only when the statement imports at least one
     * value name and its module provably exports every one of them.
     * @param {ImportStatement} statement
     * @param {string} subpath
     * @param {SubpathDeclaration} undeclared
     */
    const exampleFix = (statement, subpath, undeclared) => {
      /** @param {string} candidate */
      const provides = candidate => providesAll(statement, candidate);
      const values = statement.names
        .filter(binding => !binding.typeOnly)
        .map(binding => binding.imported);
      // A statement that imports no value name (a side-effect, namespace or
      // all-type import) is never sent to another subpath: no names prove it.
      const own = authored ? splitSpecifier(authored) : null;
      if (
        values.length > 0 &&
        authored &&
        authored !== statement.source &&
        own?.pkg === ctx.name &&
        provides(own.subpath)
      ) {
        return `import from '${authored}' in the example, as the doc's import does.`;
      }
      if (
        values.length > 0 &&
        declared &&
        declared !== subpath &&
        provides(declared)
      ) {
        return `import from '${ctx.name}${declared.slice(1)}' in the example (already exported).`;
      }
      // The entry for the example's own subpath: the file there, or the
      // component's source when it exports every name, else a placeholder.
      const atSubpath = [
        '',
        ...MODULE_EXTENSIONS,
        ...MODULE_EXTENSIONS.map(ext => `/index${ext}`),
      ]
        .map(ext => path.resolve(ctx.packageDir, subpath.slice(2) + ext))
        .find(
          file =>
            file.startsWith(path.resolve(ctx.packageDir) + path.sep) &&
            isFile(file),
        );
      const sourceHasAll =
        values.length > 0 &&
        source != null &&
        values.every(name =>
          moduleExportNames(source, ctx.exportNames).names.has(name),
        );
      const target = atSubpath
        ? `./${rel(ctx.packageDir, atSubpath)}`
        : sourceHasAll && sourceTarget
          ? fixTarget(subpath, sourceTarget)
          : values.length > 0
            ? `<the file that exports ${values.join(', ')}>`
            : '<the file it loads>';
      return exportsFix(ctx.exportsField, undeclared.state, subpath, target);
    };

    /**
     * The fix for an example that imports names its module lacks: import
     * this doc's components that module does export, else the doc's own
     * import when it differs, else export the names from it.
     * @param {ImportStatement} statement
     * @param {string} subpath
     * @param {string[]} missing
     */
    const missingNameFix = (statement, subpath, missing) => {
      const declaration = declarationIn(
        ctx.exportsField,
        ctx.packageDir,
        subpath,
      );
      /** @type {Set<string>} */
      const there = new Set();
      for (const file of existingTargets(ctx.packageDir, declaration)) {
        for (const name of moduleExportNames(file, ctx.exportNames).names)
          there.add(name);
      }
      const docNames = list.map(r => r.name).filter(name => there.has(name));
      const exportIt = `export ${missing.length === 1 ? 'the name' : 'the names'} from it`;
      if (docNames.length > 0) {
        return `import a name that module exports (${docNames.map(n => `"${n}"`).join(', ')} for this doc), or ${exportIt}.`;
      }
      const own = authored ? splitSpecifier(authored) : null;
      if (
        authored &&
        authored !== statement.source &&
        own?.pkg === ctx.name &&
        providesAll(statement, own.subpath)
      ) {
        return `import from '${authored}', as the doc's import does, or ${exportIt}.`;
      }
      return `${exportIt[0].toUpperCase()}${exportIt.slice(1)}.`;
    };

    const examples = Array.isArray(doc.examples) ? doc.examples : [];
    for (const [index, example] of examples.entries()) {
      if (!isRecord(example) || typeof example.code !== 'string') continue;
      const label =
        typeof example.label === 'string'
          ? `"${example.label}"`
          : `#${index + 1}`;
      for (const statement of readImports(example.code)) {
        const parts = splitSpecifier(statement.source);
        if (!parts || parts.pkg !== ctx.name) continue;
        const {undeclared, missing, reason} = judgeOwnImport(
          ctx,
          statement,
          parts.subpath,
        );
        if (reason) {
          ctx.unchecked.push({
            file: shownDoc,
            specifier: statement.source,
            reason: `example ${label}: ${reason}`,
          });
        }
        if (undeclared && unbuiltOutput(ctx, parts.subpath, undeclared)) {
          ctx.unchecked.push({
            file: shownDoc,
            specifier: statement.source,
            reason: `example ${label}: ${unbuiltReason(parts.subpath)}`,
          });
        } else if (undeclared) {
          issues.push(
            listed(
              'example_import_not_exported',
              `Component doc "${shownDoc}" example ${label} imports "${statement.source}", but ${whyUndeclared(undeclared, parts.subpath)}, so the example fails when an app copies it. Fix: ${exampleFix(statement, parts.subpath, undeclared)}`,
            ),
          );
        } else if (missing && missing.length > 0) {
          issues.push(
            listed(
              'example_import_missing_name',
              `Component doc "${shownDoc}" example ${label} imports ${missing.map(n => `"${n}"`).join(', ')} from "${statement.source}", which does not export ${missing.length === 1 ? 'it' : 'them'}, so the example fails when an app copies it. Fix: ${missingNameFix(statement, parts.subpath, missing)}`,
            ),
          );
        }
      }
    }
  }
  return issues;
}

/**
 * Template public imports and what each template source imports.
 * @param {Context} ctx
 * @param {any} integration
 * @returns {Promise<PublicImportNote[]>}
 */
async function templateIssues(ctx, integration) {
  /** @type {PublicImportNote[]} */
  const issues = [];
  const root = integration.templates;
  if (!root) return issues;
  let templates;
  try {
    ({templates} = await discoverIntegrationTemplatesForOne(integration));
  } catch {
    return issues;
  }
  for (const template of templates) {
    const id = template.dirName;
    const file = template.filePath;
    const shown = rel(ctx.packageDir, file);
    const sourceTarget = `./${shown}`;
    const subpath = `./${shown.replace(/\.tsx?$/u, '')}`;
    const declaration = declarationIn(
      ctx.exportsField,
      ctx.packageDir,
      subpath,
    );
    if (ctx.name != null && declaration.state !== 'declared') {
      issues.push(
        listed(
          'template_import_not_exported',
          `Template "${id}" has public import "${ctx.name}${subpath.slice(1)}", but ${whyUndeclared(declaration, subpath)}, so it cannot be imported once published. Fix: ${exportsFix(ctx.exportsField, declaration.state, subpath, sourceTarget)}`,
        ),
      );
    }

    let text;
    try {
      text = fs.readFileSync(file, 'utf-8');
    } catch {
      text = '';
    }
    // `astryx template` copies the source as written, but the package's
    // public import, the gallery preview and a page that renders the
    // template import its default export.
    const exported = text ? moduleExportNames(file, ctx.exportNames) : null;
    if (exported?.complete && !exported.names.has('default')) {
      const named = defaultExportCandidate(text, exported);
      const fix = named
        ? `add \`export default ${named};\` to ${shown}, or make ${named} the default export`
        : `export the template's component as the default export of ${shown} (\`export default function …\`)`;
      // With no package name there is no public import to name.
      const what =
        ctx.name == null
          ? 'anything that renders the template gets nothing'
          : `its public import "${ctx.name}${subpath.slice(1)}" and anything that renders the template get nothing`;
      issues.push(
        listed(
          'template_no_default_export',
          `Template "${id}" (${shown}) has no default export, so ${what}. Fix: ${fix}.`,
        ),
      );
    }
    for (const statement of readImports(text)) {
      const spec = statement.source;
      if (spec.startsWith('.')) {
        const target = path.resolve(path.dirname(file), spec);
        if (target !== root && !target.startsWith(root + path.sep)) {
          issues.push(
            listed(
              'template_import_outside_root',
              `Template "${id}" (${shown}) imports "${spec}", a path outside the templates root; \`astryx template\` copies only the template into an app, where that path does not exist. Fix: import it through the package's public name (e.g. '${ctx.name ?? '<package name>'}/…' declared in package.json "exports"), or move the code into the template.`,
            ),
          );
        }
        continue;
      }
      const parts = splitSpecifier(spec);
      if (!parts) continue;
      if (ctx.name != null && parts.pkg === ctx.name) {
        const {undeclared, missing, reason} = judgeOwnImport(
          ctx,
          statement,
          parts.subpath,
        );
        if (reason) {
          ctx.unchecked.push({file: shown, specifier: spec, reason});
        }
        if (undeclared && unbuiltOutput(ctx, parts.subpath, undeclared)) {
          ctx.unchecked.push({
            file: shown,
            specifier: spec,
            reason: unbuiltReason(parts.subpath),
          });
        } else if (undeclared) {
          issues.push(
            listed(
              'template_private_import',
              `Template "${id}" (${shown}) imports "${spec}", but ${whyUndeclared(undeclared, parts.subpath)}, so the template breaks in an app. Fix: import from a subpath package.json "exports" declares, or add one for it.`,
            ),
          );
        } else if (missing && missing.length > 0) {
          issues.push(
            listed(
              'template_import_missing_name',
              `Template "${id}" (${shown}) imports ${missing.map(n => `"${n}"`).join(', ')} from "${spec}", which does not export ${missing.length === 1 ? 'it' : 'them'}, so the template breaks in an app. Fix: import a name that module exports, or export the name from it.`,
            ),
          );
        }
      } else if (parts.pkg === CORE && !ctx.corePkg) {
        ctx.unchecked.push({
          file: shown,
          specifier: spec,
          reason:
            '@astryxdesign/core is not installed, so Core\'s package.json "exports" could not be read',
        });
      } else if (parts.pkg === CORE && ctx.corePkg && parts.subpath !== '.') {
        const core = declarationIn(
          ctx.corePkg.exports,
          /** @type {string} */ (ctx.coreDir),
          parts.subpath,
        );
        if (core.state !== 'declared') {
          const top = parts.subpath
            .split('/')
            .filter(s => s && s !== '.' && s !== 'src')[0];
          const hint =
            top &&
            subpathDeclaration(ctx.corePkg.exports, `./${top}`).state ===
              'declared'
              ? `'${CORE}/${top}'`
              : `a subpath Core's package.json "exports" declares`;
          issues.push(
            listed(
              'template_private_import',
              `Template "${id}" (${shown}) imports "${spec}", a path Core's package.json "exports" does not declare, so the template breaks in an app. Fix: import from ${hint}.`,
            ),
          );
        }
      }
    }
  }
  return issues;
}

/**
 * Every public-import finding for one package, as notes, and the report of
 * what could not be judged. It returns no issues: the notes are listed
 * only, and fail `--strict` from the next minor release.
 * @param {string} packageDir
 * @param {any} integration the loaded integration record
 * @returns {Promise<{issues: Issue[], notes: PublicImportNote[], report: PublicImportsReport}>}
 *   `issues` is always empty: kept so validate's call site stays one shape
 */
export async function publicImportIssues(packageDir, integration) {
  /** @type {PublicImportsReport} */
  const report = {status: 'checked', findings: [], unchecked: []};
  const pkg = readJson(path.join(packageDir, 'package.json'));
  // What cannot run is listed as not checked, never a skip `--strict` would
  // fail on.
  if (!isRecord(pkg)) {
    report.unchecked.push({
      file: 'package.json',
      specifier: '',
      reason: 'package.json could not be read, so no import was checked',
    });
    return {issues: [], notes: [], report};
  }
  const raw = typeof pkg.name === 'string' && pkg.name !== '' ? pkg.name : null;
  // A name that is not a bare package name (`acme/kit`) cannot be told apart
  // from an import of another package: checked as if there were none.
  const name = raw != null && isPackageName(raw) ? raw : null;
  if (name == null) {
    report.unchecked.push({
      file: 'package.json',
      specifier: '',
      reason: `${raw == null ? 'package.json has no "name"' : `package.json "name" ${JSON.stringify(raw)} is not a bare package name`}, so imports of the package's own name were not checked; only template imports outside the templates root and of Core were`,
    });
  }
  // The Core installed beside the package, which its templates' imports
  // resolve against; never the CLI's own copy, which may be another release.
  // A workspace's own `packages/core` (another package) is not it: then Core
  // counts as not installed and its imports are listed as not checked.
  const foundCore = name === CORE ? packageDir : findProjectCoreDir(packageDir);
  const foundCorePkg = foundCore
    ? readJson(path.join(foundCore, 'package.json'))
    : null;
  const isCore = isRecord(foundCorePkg) && foundCorePkg.name === CORE;
  /** @type {Context} */
  const ctx = {
    packageDir,
    name,
    exportsField: pkg.exports,
    coreDir: isCore ? foundCore : null,
    corePkg: isCore ? foundCorePkg : null,
    unchecked: report.unchecked,
    exportNames: new Map(),
    files: Array.isArray(pkg.files)
      ? pkg.files
          .filter(entry => typeof entry === 'string')
          .map(entry => entry.replace(/^\.\//u, '').replace(/\/+$/u, ''))
      : [],
    roots: [
      integration.components,
      integration.templates,
      integration.docs,
      integration.themes,
      integration.codemods,
    ]
      .filter(root => typeof root === 'string')
      .map(root => path.resolve(root)),
  };
  const notes = [
    ...(await componentIssues(ctx, integration)),
    ...(await templateIssues(ctx, integration)),
  ];
  // Listed only: none is an issue, so none counts or fails a check.
  return {issues: [], notes, report};
}
