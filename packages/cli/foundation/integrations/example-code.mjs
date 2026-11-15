// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The scope a package's component examples are read against, and
 *   Doctor's check that each example runs on its own unless it is
 *   `kind: 'setup'`, judged by the rule a live preview uses.
 * @input A loaded integration: its components root, package directory and
 *   package.json, and the Core and React installed beside it.
 * @output `exampleScopeFor`: the ExampleScope as JSON, which
 *   `integrationExampleScope` returns. `exampleCodeCheck`: a note for each
 *   example `previewableExample` refuses, with its fix, and the examples it
 *   could not judge.
 * @position foundation/integrations, beside the other contribution
 *   validators; run by `astryx doctor integration validate` (and so by
 *   `integration check`) through api/integration/validate-integration.mjs,
 *   which marks the notes `next`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {
  packagesInstalledWith,
  previewableExample,
} from '../../authoring/example/preview.mjs';
import {findProjectCoreDir} from '../fs/paths.mjs';
import {
  CORE_PACKAGE,
  discoverComponents,
  discoverIntegrationComponents,
  resolveIntegrationImportPath,
} from '../discovery/component-discovery.mjs';
import {discoverHooks} from '../discovery/hook-discovery.mjs';
import {loadComponentDoc} from '../discovery/component-loader.mjs';
import {babelParse} from '../runtime/lazy-dependencies.mjs';
import {declaredTargets, readImports, subpathFor} from './public-imports.mjs';
import {allTargets, isRecord, subpathDeclaration} from './exports-subpaths.mjs';

/**
 * @typedef {{code: string, message: string}} ExampleCodeNote
 * @typedef {{file: string, example: string, reason: string}} ExampleCodeUnchecked
 * @typedef {import('../../authoring/example/type.ts').ExampleScope} ExampleScope
 */

/** @param {string} from @param {string} to */
function rel(from, to) {
  return path.relative(from, to).split(path.sep).join('/');
}

/**
 * @param {string} packageDir
 * @returns {Record<string, unknown> | null}
 */
function readManifest(packageDir) {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
    );
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * React's named exports, as the package resolves React.
 * @param {string} packageDir
 * @returns {string[] | null} null when React cannot be loaded
 */
function reactExports(packageDir) {
  try {
    const require = createRequire(path.join(packageDir, 'package.json'));
    return Object.keys(require('react'));
  } catch {
    return null;
  }
}

/**
 * Each component and hook Core documents, from the Core installed beside the
 * package.
 * @param {string} packageDir
 * @returns {Array<{name: string, import: string}> | null} null when no Core
 *   is installed, or its docs cannot be read
 */
function coreNames(packageDir) {
  const coreDir = findProjectCoreDir(packageDir);
  if (!coreDir) return null;
  try {
    const names = [
      ...Object.values(discoverComponents(coreDir)).flat(),
      ...Object.values(discoverHooks(coreDir)).flat(),
    ];
    return [...new Set(names)].map(name => ({name, import: CORE_PACKAGE}));
  } catch {
    return null;
  }
}

/**
 * Whether a module imports `server-only`, the marker of code that runs only
 * on a server. A file that cannot be read imports nothing.
 * @param {string} file
 */
function importsServerOnly(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    return (
      text.includes('server-only') &&
      readImports(text).some(
        statement => statement.source === 'server-only' && !statement.typeOnly,
      )
    );
  } catch {
    return false;
  }
}

/** How many files a wildcard `exports` target may be matched against. */
const WILDCARD_FILE_LIMIT = 5_000;

/**
 * The files under a folder, `node_modules` aside, up to a limit.
 * @param {string} dir
 * @param {string[]} [out]
 * @returns {string[]}
 */
function filesUnder(dir, out = []) {
  /** @type {fs.Dirent[]} */
  let entries;
  try {
    entries = fs.readdirSync(dir, {withFileTypes: true});
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (out.length >= WILDCARD_FILE_LIMIT) break;
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/**
 * The package's own import specifiers whose module imports `server-only`:
 * each subpath its `exports` declares, and for a wildcard subpath, each file
 * its target pattern can name, by the subpath that exports that file. A
 * package with no `exports` names none, as no subpath of it is declared.
 * @param {string} packageDir
 * @param {string} packageName
 * @param {unknown} exportsField
 * @returns {string[]}
 */
function serverOnlyModules(packageDir, packageName, exportsField) {
  if (exportsField == null) return [];
  /** @type {Set<string>} */
  const found = new Set();
  /** @param {string} subpath */
  const targets = subpath =>
    declaredTargets(packageDir, subpathDeclaration(exportsField, subpath))
      .files;
  /** @param {string} subpath `.` or `./…` */
  const add = subpath =>
    found.add(
      subpath === '.' ? packageName : `${packageName}${subpath.slice(1)}`,
    );
  const keys = isRecord(exportsField) ? Object.keys(exportsField) : [];
  if (keys.length === 0 || !keys.every(key => key.startsWith('.'))) {
    if (targets('.').some(importsServerOnly)) add('.');
    return [...found];
  }
  const map = /** @type {Record<string, unknown>} */ (exportsField);
  const root = path.resolve(packageDir);
  for (const key of keys) {
    if (!key.includes('*')) {
      if (targets(key).some(importsServerOnly)) add(key);
      continue;
    }
    for (const target of allTargets(map[key])) {
      const star = target.indexOf('*');
      if (!target.startsWith('./') || star === -1) continue;
      const folder = path.resolve(
        root,
        target.slice(0, target.lastIndexOf('/', star) + 1),
      );
      if (folder !== root && !folder.startsWith(root + path.sep)) continue;
      for (const file of filesUnder(folder)) {
        if (!importsServerOnly(file)) continue;
        // This key's own subpath for the file: an earlier key that also
        // names it is a second specifier for the same module.
        const subpath = subpathFor({[key]: map[key]}, packageDir, file);
        if (subpath != null && targets(subpath).includes(file)) add(subpath);
      }
    }
  }
  return [...found].sort();
}

/**
 * The documented components whose source declares them as async functions:
 * server components, which only a server can render. A source that cannot be
 * read or parsed names none.
 * @param {Array<{name: string, sourcePath: string | null}>} records
 * @returns {string[]}
 */
function asyncComponents(records) {
  /** @type {Map<string, Set<string>>} source file → its async function names */
  const bySource = new Map();
  /** @type {string[]} */
  const found = [];
  for (const {name, sourcePath} of records) {
    if (!sourcePath) continue;
    let names = bySource.get(sourcePath);
    if (!names) {
      names = asyncFunctionNames(sourcePath);
      bySource.set(sourcePath, names);
    }
    if (names.has(name)) found.push(name);
  }
  return found;
}

/**
 * The top-level async functions a module declares, exported or not.
 * @param {string} file
 * @returns {Set<string>}
 */
function asyncFunctionNames(file) {
  /** @type {Set<string>} */
  const names = new Set();
  /** @type {any} */
  let ast;
  try {
    ast = babelParse(fs.readFileSync(file, 'utf8'), {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    });
  } catch {
    return names; // an unreadable source names no server component
  }
  for (const statement of ast.program.body) {
    const node =
      statement.type === 'ExportNamedDeclaration' ||
      statement.type === 'ExportDefaultDeclaration'
        ? statement.declaration
        : statement;
    if (node?.type === 'FunctionDeclaration' && node.async && node.id) {
      names.add(node.id.name);
    }
    if (node?.type !== 'VariableDeclaration') continue;
    for (const declarator of node.declarations) {
      const init = declarator.init;
      if (
        declarator.id.type === 'Identifier' &&
        (init?.type === 'ArrowFunctionExpression' ||
          init?.type === 'FunctionExpression') &&
        init.async
      ) {
        names.add(declarator.id.name);
      }
    }
  }
  return names;
}

/**
 * @typedef {object} ExampleScopeRead
 * @property {ExampleScope | null} scope null when there is nothing to read
 *   examples against: no package.json with a name
 * @property {string} [reason] why `scope` is null
 * @property {string} [incomplete] why names Core or React give could not be
 *   read: the scope then lists none of them, so a name it does not list may
 *   still be defined
 * @property {Map<string, any>} docs each component doc that loaded, by path
 */

/**
 * The scope a package's component examples are read against, as JSON: the
 * components the package documents with the import an app uses for each,
 * the components and hooks the Core installed beside it documents, the
 * React it resolves, the packages it declares, and its server-only modules
 * and async components.
 * @param {any} integration a loaded integration
 * @returns {Promise<ExampleScopeRead>}
 */
export async function exampleScopeFor(integration) {
  /** @type {Map<string, any>} */
  const docs = new Map();
  const packageDir = integration?.__packageDir;
  const manifest = packageDir ? readManifest(packageDir) : null;
  const packageName = typeof manifest?.name === 'string' ? manifest.name : null;
  if (!packageDir || !manifest || !packageName) {
    return {scope: null, reason: 'package.json has no name', docs};
  }
  /** @type {ReturnType<typeof discoverIntegrationComponents>} */
  let records = [];
  try {
    records = discoverIntegrationComponents(integration);
  } catch {
    // An unreadable root is reported by the root validators.
  }
  for (const record of records) {
    if (docs.has(record.docPath)) continue;
    try {
      const doc = await loadComponentDoc(record.docPath);
      if (isRecord(doc)) docs.set(record.docPath, doc);
    } catch {
      // A doc that does not load is reported by the doc validators.
    }
  }
  const exportsField = manifest.exports ?? null;
  const react = reactExports(packageDir);
  const core = coreNames(packageDir);
  /** @type {ExampleScope} */
  const scope = {
    packageName,
    packageNames: records.map(record => ({
      name: record.name,
      import: resolveIntegrationImportPath(
        {
          exportsMap: /** @type {any} */ (exportsField),
          packageDir,
          docPath: record.docPath,
          packageName,
        },
        record.name,
        typeof docs.get(record.docPath)?.import === 'string'
          ? docs.get(record.docPath).import
          : null,
      ),
    })),
    coreNames: core ?? [],
    reactNames: react ?? [],
    dependencies: packagesInstalledWith(manifest),
    serverOnlyModules: serverOnlyModules(packageDir, packageName, exportsField),
    serverComponents: asyncComponents(records),
  };
  // Without Core or React, a name either provides cannot be told from an
  // undefined one.
  const incomplete =
    core == null
      ? "Core's docs cannot be read beside the package"
      : react == null
        ? 'React cannot be loaded from the package'
        : null;
  return {scope, ...(incomplete ? {incomplete} : {}), docs};
}

/**
 * Check every example of every component doc the package ships.
 * @param {any} integration a loaded integration
 * @returns {Promise<{notes: ExampleCodeNote[], unchecked: ExampleCodeUnchecked[]}>}
 */
export async function exampleCodeCheck(integration) {
  /** @type {ExampleCodeNote[]} */
  const notes = [];
  /** @type {ExampleCodeUnchecked[]} */
  const unchecked = [];
  const {scope, incomplete: missing, docs} = await exampleScopeFor(integration);
  if (!scope) return {notes, unchecked};
  const packageDir = integration.__packageDir;
  for (const [docPath, doc] of docs) {
    const shownDoc = rel(packageDir, docPath);
    const entries = [
      doc,
      ...(Array.isArray(doc.components) ? doc.components : []),
    ].filter(isRecord);
    for (const entry of entries) {
      const examples = Array.isArray(entry.examples) ? entry.examples : [];
      for (const [index, example] of examples.entries()) {
        if (!isRecord(example) || typeof example.code !== 'string') continue;
        const label =
          typeof example.label === 'string'
            ? `"${example.label}"`
            : `#${index + 1}`;
        const shown =
          entry === doc || typeof entry.name !== 'string'
            ? `example ${label}`
            : `${entry.name} example ${label}`;
        /** @type {import('../../authoring/example/type.ts').PreviewableExample} */
        let read;
        try {
          read = previewableExample(
            {code: example.code, kind: example.kind},
            scope,
          );
        } catch (error) {
          unchecked.push({
            file: shownDoc,
            example: label,
            reason: `it could not be read: ${error instanceof Error ? error.message : String(error)}`,
          });
          continue;
        }
        if (read.previewable || read.setup) continue;
        for (const problem of read.problems) {
          if (problem.code === 'example_undefined_name' && missing) {
            unchecked.push({
              file: shownDoc,
              example: label,
              reason: `${missing}, so its names ${(problem.names ?? []).join(', ')} cannot be judged`,
            });
            continue;
          }
          notes.push({
            code: problem.code,
            message: `Component doc "${shownDoc}" ${shown} ${problem.message}. Fix: ${problem.fix}`,
          });
        }
      }
    }
  }
  return {notes, unchecked};
}
