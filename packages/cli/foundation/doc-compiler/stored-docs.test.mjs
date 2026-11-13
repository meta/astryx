// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as util from 'node:util';
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {CLI_ROOT} from '../fs/paths.mjs';
import {importDocModule} from './import.mjs';
import {storedKey, STORED_DOCS_FILE} from './stored-docs.mjs';
import {storedDocsText} from '../../scripts/generate-stored-docs.mjs';

// The file is written at `prepack`, so a checkout has none. These tests
// serve its text from memory to the importer's read of it: writing it into
// the tree would change what other suites, running alongside, read.
const memory = vi.hoisted(() => ({file: '', text: ''}));
vi.mock('node:fs', async importOriginal => {
  const actual = /** @type {typeof import('node:fs')} */ (
    await importOriginal()
  );
  /** @type {typeof actual.readFileSync} */
  const readFileSync = /** @type {any} */ (
    (/** @type {any} */ file, /** @type {any[]} */ ...rest) =>
      memory.file && file === memory.file
        ? rest[0]
          ? memory.text
          : Buffer.from(memory.text)
        : actual.readFileSync(file, ...rest)
  );
  return {...actual, default: {...actual, readFileSync}, readFileSync};
});
/** @type {Record<string, Record<string, unknown>>} */
let stored = {};
beforeAll(async () => {
  memory.text = await storedDocsText();
  memory.file = STORED_DOCS_FILE;
  const bytes = Buffer.from(memory.text);
  const end = bytes.indexOf(0x0a);
  const data = bytes.subarray(end + 1);
  /** @type {Record<string, [number, number]>} */
  const ranges = JSON.parse(bytes.toString('utf-8', 0, end));
  stored = Object.fromEntries(
    Object.entries(ranges).map(([key, [from, length]]) => [
      key,
      JSON.parse(data.toString('utf-8', from, from + length)),
    ]),
  );
});
const GUIDE = path.join(
  CLI_ROOT,
  'assets',
  'docs',
  'tree',
  'page-template.doc.mjs',
);

/** @type {string[]} */
const tmpDirs = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0))
    fs.rmSync(dir, {recursive: true, force: true});
});

describe('stored doc exports', () => {
  it('hold, for every stored doc, the exports an import of it gives', async () => {
    /** @param {string} dir @returns {string[]} */
    const docFiles = dir =>
      fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          return entry.name === 'node_modules' ||
            entry.name === '__tests__' ||
            entry.name.startsWith('.')
            ? []
            : docFiles(file);
        }
        return entry.name.endsWith('.doc.mjs') ? [file] : [];
      });
    let checked = 0;
    for (const file of [
      ...docFiles(CLI_ROOT),
      ...docFiles(path.join(CLI_ROOT, '..', 'core', 'src')),
    ]) {
      const exports = stored[storedKey(fs.readFileSync(file, 'utf-8'))];
      if (!exports) continue;
      const native = await import(`${pathToFileURL(file).href}?native`);
      expect(exports, file).toEqual({...native});
      checked++;
    }
    expect(checked).toBeGreaterThan(1500);
  });

  it('give a shipped doc the module an import of it gives', async () => {
    const text = fs.readFileSync(GUIDE, 'utf-8');
    expect(stored[storedKey(text)]).toBeDefined();
    const read = await importDocModule(GUIDE);
    const native = await import(`${pathToFileURL(GUIDE).href}?native`);
    // The store answered: the importer's own import gives a real module
    // namespace (see the next test).
    expect(util.types.isModuleNamespaceObject(read)).toBe(false);
    expect(Object.keys(read)).toEqual(Object.keys(native));
    expect({...read}).toEqual({...native});
    expect(Object.getPrototypeOf(read)).toBe(null);
    expect(Object.prototype.toString.call(read)).toBe('[object Module]');
    expect(Object.isExtensible(read)).toBe(false);
    expect(await importDocModule(GUIDE)).toBe(read);
  });

  it('import a doc that is not shipped, as before', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stored-docs-'));
    tmpDirs.push(dir);
    const file = path.join(dir, 'outside.doc.mjs');
    // Text no shipped doc has: an edited copy.
    fs.writeFileSync(file, `${fs.readFileSync(GUIDE, 'utf-8')}// edited\n`);
    const read = await importDocModule(file);
    expect(util.types.isModuleNamespaceObject(read)).toBe(true);
    expect(Object.prototype.toString.call(read)).toBe('[object Module]');
    expect({...read}).toEqual({...(await importDocModule(GUIDE))});
  });
});
