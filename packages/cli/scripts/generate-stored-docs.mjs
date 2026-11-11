#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Writes assets/docs.generated.json at `prepack`: the exports of each doc
 * file Astryx ships that imports nothing, runs nothing as it loads, and exports
 * only plain data, keyed by a hash of the file's text, so the published package
 * reads such a doc without importing it. The file is not committed; a checkout
 * without it imports every doc, with the same result.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {parse} from '@babel/parser';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';
import {
  docSourceKey,
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
  if (runsCode(program)) return false;
  return program.body.every(
    statement =>
      statement.type === 'VariableDeclaration' ||
      statement.type === 'ExportDefaultDeclaration' ||
      (statement.type === 'ExportNamedDeclaration' && !statement.source),
  );
}

/**
 * Whether a syntax tree loads or reaches anything at run time: a dynamic
 * `import()`, `import.meta`, or a call of `require`.
 * @param {unknown} node
 * @returns {boolean}
 */
function runsCode(node) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(runsCode);
  const n = /** @type {Record<string, any>} */ (node);
  if (n.type === 'Import' || n.type === 'ImportExpression') return true;
  if (n.type === 'MetaProperty') return true;
  if (
    n.type === 'CallExpression' &&
    n.callee?.type === 'Identifier' &&
    n.callee.name === 'require'
  ) {
    return true;
  }
  return Object.entries(n).some(
    ([key, value]) =>
      key !== 'loc' &&
      key !== 'leadingComments' &&
      key !== 'trailingComments' &&
      key !== 'innerComments' &&
      runsCode(value),
  );
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
    byKey[docSourceKey(text)] = data;
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
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(new URL(import.meta.url).pathname);

if (isMain) {
  fs.writeFileSync(STORED_DOCS_FILE, await storedDocsText());
  console.log(`Wrote ${path.relative(process.cwd(), STORED_DOCS_FILE)}.`);
}
