// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file readLiteralDoc: a doc module of exported literals reads as the value
 * an import gives; any other module reads as null, so the caller imports it.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {afterAll, describe, expect, it} from 'vitest';
import {readLiteralDoc} from './literal-doc.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-literal-doc-'));
let count = 0;

afterAll(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/**
 * A doc file with this text.
 * @param {string} text
 * @param {string} [suffix]
 */
function docFile(text, suffix = '.doc.mjs') {
  count += 1;
  const file = path.join(dir, `d${count}${suffix}`);
  fs.writeFileSync(file, text);
  return file;
}

/**
 * The doc an import of `file` gives, as loadTopicModule takes it.
 * @param {string} file
 */
async function imported(file) {
  const mod = await import(pathToFileURL(file).href);
  return mod.docs ?? mod.default;
}

describe('readLiteralDoc', () => {
  it.each([
    [
      'a const docs export with comments',
      `// header\n/** @type {any} */\nexport const docs = {\n  type: 'generic', // kind\n  name: "a-b",\n  /* note */ 'quoted key': [1, -2.5, 3e2, true, false, null,],\n};\n`,
    ],
    ['a default export', `export default {name: 'x', nested: {deep: []}}`],
    [
      'docs before default',
      `export const docs = {name: 'docs'};\nexport default {name: 'default'};`,
    ],
    [
      'default when docs is null',
      `export const docs = null; export default {name: 'd'};`,
    ],
    [
      'string escapes',
      String.raw`export const docs = {s: 'a\'b\n\t\x41\u0042\u{1F600}\0\q\
c', d: "\"\\"};`,
    ],
    [
      'a template without substitutions',
      'export const docs = {t: `line one\r\nline two \\` \\${not} $ {}`};',
    ],
    ['a duplicate key, the last winning', `export default {a: 1, a: 2}`],
    [
      'other exported literals',
      `export const other = [1];\nexport const docs = {n: 1}`,
    ],
    ['a BOM', `\uFEFFexport const docs = {n: 1};`],
  ])('reads %s as an import does', async (_, text) => {
    const file = docFile(text);
    const doc = readLiteralDoc(file);
    expect(doc).not.toBeNull();
    expect(doc).toStrictEqual(await imported(file));
  });

  it.each([
    ['an import', `import x from 'node:path';\nexport const docs = {n: 1};`],
    ['a reference', `const n = 1;\nexport const docs = {n};`],
    ['a call', `export const docs = {n: ['a', 'b'].join('/')};`],
    ['a substitution', 'export const docs = {n: `${1}`};'],
    ['a spread', `export const docs = {...{}};`],
    ['undefined', `export const docs = {n: undefined};`],
    ['a __proto__ key', `export const docs = {__proto__: {n: 1}};`],
    ['a hole', `export const docs = [1,,2];`],
    ['a legacy octal escape', `export const docs = {s: '\\01'};`],
    ['two exports on one line', `export const a = 1 export const docs = 2`],
    ['a second default', `export default 1;\nexport default 2;`],
    ['no export', `const docs = {};`],
    ['a function export', `export default function Doc() {}`],
    ['an unterminated object', `export const docs = {n: 1`],
    ['a hex number', `export const docs = {n: 0x10};`],
  ])('reads %s as null', (_, text) => {
    expect(readLiteralDoc(docFile(text))).toBeNull();
  });

  it('leaves a TypeScript doc to an import', () => {
    expect(
      readLiteralDoc(docFile(`export default {n: 1};`, '.doc.ts')),
    ).toBeNull();
  });
});
