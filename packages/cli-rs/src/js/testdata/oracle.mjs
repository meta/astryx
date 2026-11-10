// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Test oracle for the Rust module loader: import each file the way the JS
 * CLI imports it, convert its namespace with the marker rules in
 * ../convert.rs, and print one JSON line a file: `{file, value}`, where
 * value is the namespace or `{__error: {name, message, code}}`.
 * Node runs only here, to record the snapshot the Rust test compares to.
 *
 * Usage: node oracle.mjs <repo-root> <list-file>  (one repo-relative path a line)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';

const [repo, listFile] = process.argv.slice(2);
const {importUserModule} = await import(
  pathToFileURL(path.join(repo, 'packages/cli/foundation/fs/module-loader.mjs')).href
);

const {createJiti} = await import(
  pathToFileURL(path.join(repo, 'packages/cli/node_modules/jiti/lib/jiti.mjs')).href
);
// Theme sources import JSX icon modules: load them as template discovery's
// JSX-aware jiti does.
const jsxJiti = createJiti(path.join(repo, 'packages/cli/foundation/doc-compiler/import.mjs'), {jsx: true});
const isJsxFile = rel => rel.startsWith('packages/themes/');

const marker = (kind, fields = {}) => ({__js: kind, ...fields});

function convert(v, stack) {
  if (v === null) return null;
  switch (typeof v) {
    case 'undefined':
      return marker('undefined');
    case 'boolean':
    case 'string':
      return v;
    case 'number':
      if (Number.isNaN(v)) return marker('number', {value: 'NaN'});
      if (!Number.isFinite(v)) return marker('number', {value: v > 0 ? 'Infinity' : '-Infinity'});
      return Object.is(v, -0) ? 0 : v;
    case 'bigint':
      return marker('bigint', {value: v.toString()});
    case 'symbol':
      return marker('symbol', {description: v.description ?? null});
    case 'function':
      return marker('function', {name: typeof v.name === 'string' ? v.name : ''});
  }
  if (stack.includes(v)) return marker('circular');
  if (v instanceof Date) return marker('date', {iso: Number.isNaN(v.getTime()) ? null : v.toISOString()});
  if (v instanceof RegExp) return marker('regexp', {source: v.source, flags: v.flags});
  if (v instanceof Promise) return marker('promise');
  if (Object.prototype.toString.call(v) === '[object Error]')
    return marker('error', {name: String(v.name), message: String(v.message)});
  stack.push(v);
  try {
    if (v instanceof Map) return marker('map', {entries: [...v].map(([k, x]) => [convert(k, stack), convert(x, stack)])});
    if (v instanceof Set) return marker('set', {values: [...v].map(x => convert(x, stack))});
    if (Array.isArray(v)) return Array.from({length: v.length}, (_, i) => convert(v[i], stack));
    const out = {};
    for (const k of Object.keys(v)) out[k] = convert(v[k], stack);
    return out;
  } finally {
    stack.pop();
  }
}

const files = fs.readFileSync(listFile, 'utf8').split('\n').filter(Boolean);
const result = {};
const realWrite = process.stderr.write.bind(process.stderr);
for (const rel of files) {
  const file = path.join(repo, rel);
  try {
    const mod = isJsxFile(rel) ? await jsxJiti.import(file) : await importUserModule(file);
    result[rel] = convert(mod, []);
  } catch (e) {
    result[rel] = {__error: {name: e?.name ?? '', message: e?.message ?? String(e), code: e?.code ?? null}};
  }
}
void realWrite;
// Paths inside values are machine-specific: write the repo root as <repo>.
// One line a file: {"file": ..., "value": ...}.
const lines = Object.entries(result).map(([file, value]) =>
  JSON.stringify({file, value}).split(repo).join('<repo>'),
);
process.stdout.write(lines.join('\n') + '\n');
