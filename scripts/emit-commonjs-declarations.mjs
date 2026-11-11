#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Build step: write CommonJS declarations beside the ES module declarations of
 * a `"type": "module"` package's dual entry.
 *
 * TypeScript reads a `.d.ts` file in a `"type": "module"` package as ES module
 * declarations, so a `require` condition that loads a `.cjs` file needs `.d.cts`
 * declarations. Starting at each named entry, this copies every declaration
 * file the entry reaches through relative specifiers to a `.d.cts` sibling and
 * points each relative `.js` specifier at its `.cjs` sibling, so the CommonJS
 * declarations reach only CommonJS declarations. Run it after
 * add-declaration-extensions.mjs, which makes the specifiers fully specified.
 *
 * Usage: node <repo-root>/scripts/emit-commonjs-declarations.mjs <entry.d.ts>...
 *   (run from a package root; entries are paths relative to it)
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// from './x.js' | import './x.js' | import('./x.js')
const RELATIVE_JS =
  /(\bfrom\s*|\bimport\s+|\bimport\(\s*)(["'])(\.\.?\/[^"']*)\.js\2/g;

const SOURCE_MAP = /^\/\/# sourceMappingURL=.*$/m;

/** The CommonJS declarations for one ES module declaration file. */
export function toCommonJsDeclarations(source) {
  return source
    .replace(RELATIVE_JS, '$1$2$3.cjs$2')
    .replace(SOURCE_MAP, '')
    .trimEnd()
    .concat('\n');
}

/**
 * Writes the `.d.cts` copy of each entry and of every declaration file it
 * reaches. Returns the files written, relative to `root`.
 */
export function emitCommonJsDeclarations(root, entries) {
  const written = [];
  const pending = entries.map(entry => path.resolve(root, entry));
  const seen = new Set();
  while (pending.length > 0) {
    const file = pending.pop();
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(RELATIVE_JS)) {
      pending.push(path.resolve(path.dirname(file), `${match[3]}.d.ts`));
    }
    const target = file.replace(/\.d\.ts$/, '.d.cts');
    fs.writeFileSync(target, toCommonJsDeclarations(source));
    written.push(path.relative(root, target));
  }
  return written.sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const entries = process.argv.slice(2);
  if (entries.length === 0) {
    console.error('Usage: emit-commonjs-declarations.mjs <entry.d.ts>...');
    process.exit(2);
  }
  const missing = entries.filter(entry => !fs.existsSync(path.resolve(entry)));
  if (missing.length > 0) {
    console.error(`Declaration entry not found: ${missing.join(', ')}`);
    process.exit(1);
  }
  const written = emitCommonJsDeclarations(process.cwd(), entries);
  console.log(`Wrote ${written.length} CommonJS declaration file(s).`);
}
