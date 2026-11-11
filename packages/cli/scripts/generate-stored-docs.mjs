#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Writes assets/docs.generated.json at `prepack`: the exports of each doc
 * file Astryx ships that imports nothing, calls nothing as it loads, reads no
 * name it does not declare, and exports only plain data, keyed by a hash of
 * the file's text, so the published package
 * reads such a doc without importing it. The file is not committed; a checkout
 * without it imports every doc, with the same result. `--clean` (at
 * `postpack`) removes it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {parse} from '@babel/parser';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';
import {
  storedKey,
  STORED_DOCS_FILE,
} from '../foundation/doc-compiler/stored-docs.mjs';

const ASSETS = path.join(CLI_ROOT, 'assets');

/**
 * Every `.doc.mjs` file under `dir`, sorted.
 * @param {string} dir
 * @returns {string[]}
 */
function docFilesIn(dir) {
  return fs
    .readdirSync(dir, {withFileTypes: true})
    .flatMap(entry => {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return entry.name === 'node_modules' || entry.name === '__tests__'
          ? []
          : docFilesIn(file);
      }
      return entry.name.endsWith('.doc.mjs') ? [file] : [];
    })
    .sort();
}

/**
 * Whether a doc's text only declares and exports: no import, no re-export, no
 * statement that runs as it loads.
 * @param {string} text
 * @returns {boolean}
 */
function onlyDeclares(text) {
  let program;
  try {
    program = parse(text, {sourceType: 'module'}).program;
  } catch {
    return false;
  }
  if (
    !program.body.every(
      statement =>
        statement.type === 'VariableDeclaration' ||
        statement.type === 'ExportDefaultDeclaration' ||
        (statement.type === 'ExportNamedDeclaration' && !statement.source),
    )
  ) {
    return false;
  }
  /** @type {Set<string>} */
  const declared = new Set();
  for (const statement of program.body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration'
        ? statement.declaration
        : statement;
    if (declaration?.type !== 'VariableDeclaration') continue;
    for (const declarator of declaration.declarations) {
      if (declarator.id.type !== 'Identifier') return false;
      declared.add(declarator.id.name);
    }
  }
  return !runsCode(program, declared);
}

/**
 * Node types whose value comes from running code, or is not plain data: a
 * call (`Object.freeze`, `.map`, `Date.now()`), a construction, a tagged
 * template, a function or class, an import, `this`, or an assignment.
 */
const RUNS_CODE = new Set([
  'CallExpression',
  'OptionalCallExpression',
  'NewExpression',
  'TaggedTemplateExpression',
  'Import',
  'ImportExpression',
  'MetaProperty',
  'ThisExpression',
  'Super',
  'AwaitExpression',
  'YieldExpression',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'FunctionDeclaration',
  'ClassExpression',
  'ClassDeclaration',
  'ObjectMethod',
  'UpdateExpression',
  'AssignmentExpression',
]);

/**
 * Whether a syntax tree's values depend on anything but its own literals and
 * the names it declares: code that runs as it loads (see {@link RUNS_CODE}),
 * or a name it does not declare, such as `process`, `Date` or `globalThis`,
 * whose value would be the publishing machine's.
 * @param {unknown} node
 * @param {Set<string>} declared the file's top-level names
 * @returns {boolean}
 */
function runsCode(node, declared) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(n => runsCode(n, declared));
  const n = /** @type {Record<string, any>} */ (node);
  if (RUNS_CODE.has(n.type)) return true;
  if (n.type === 'Identifier') {
    return !declared.has(n.name) && n.name !== 'undefined';
  }
  return Object.entries(n).some(([key, value]) => {
    if (
      key === 'loc' ||
      key === 'leadingComments' ||
      key === 'trailingComments' ||
      key === 'innerComments' ||
      key === 'extra'
    ) {
      return false;
    }
    // Names that are not references: a declared name, a property key, a
    // member's property, an export's outside name.
    if (key === 'id' && n.type === 'VariableDeclarator') return false;
    if (key === 'key' && !n.computed) return false;
    if (key === 'property' && n.type === 'MemberExpression' && !n.computed) {
      return false;
    }
    if (key === 'exported') return false;
    return runsCode(value, declared);
  });
}

/**
 * The file's text: each storable doc's exports, by key, in key order.
 * @returns {Promise<string>}
 */
export async function storedDocsText() {
  /** @type {Record<string, Record<string, unknown>>} */
  const byKey = {};
  for (const file of docFilesIn(ASSETS)) {
    const text = fs.readFileSync(file, 'utf-8');
    if (!onlyDeclares(text)) continue;
    const exports = {...(await import(pathToFileURL(file).href))};
    let data;
    try {
      data = JSON.parse(JSON.stringify(exports));
    } catch {
      continue;
    }
    if (!isDeepStrictEqual(data, exports)) continue;
    byKey[storedKey(text)] = data;
  }
  return (
    JSON.stringify(
      Object.fromEntries(
        Object.keys(byKey)
          .sort()
          .map(key => [key, byKey[key]]),
      ),
    ) + '\n'
  );
}

const isMain =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain && process.argv.includes('--clean')) {
  // `postpack`: the checkout goes back to importing every doc, so a later
  // edit to a doc or the importer shows there.
  fs.rmSync(STORED_DOCS_FILE, {force: true});
} else if (isMain) {
  fs.writeFileSync(STORED_DOCS_FILE, await storedDocsText());
  console.log(`Wrote ${path.relative(process.cwd(), STORED_DOCS_FILE)}.`);
}
