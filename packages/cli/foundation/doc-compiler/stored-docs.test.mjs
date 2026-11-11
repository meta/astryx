// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest';
import {CLI_ROOT} from '../fs/paths.mjs';
import {importDocModule} from './import.mjs';
import {docSourceKey, STORED_DOCS_FILE} from './stored-docs.mjs';
import {storedDocsText} from '../../scripts/generate-stored-docs.mjs';

// The file is written at `prepack`, so a checkout has none: write it for
// these tests (the importer reads it once per process) and remove it.
const written = !fs.existsSync(STORED_DOCS_FILE);
/** @type {Record<string, Record<string, unknown>>} */
let stored = {};
beforeAll(async () => {
  if (written) fs.writeFileSync(STORED_DOCS_FILE, await storedDocsText());
  stored = JSON.parse(fs.readFileSync(STORED_DOCS_FILE, 'utf-8'));
});
afterAll(() => {
  if (written) fs.rmSync(STORED_DOCS_FILE, {force: true});
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
        if (entry.isDirectory()) return docFiles(file);
        return entry.name.endsWith('.doc.mjs') ? [file] : [];
      });
    let checked = 0;
    for (const file of docFiles(path.join(CLI_ROOT, 'assets'))) {
      const exports = stored[docSourceKey(fs.readFileSync(file, 'utf-8'))];
      if (!exports) continue;
      const native = await import(`${pathToFileURL(file).href}?native`);
      expect(exports, file).toEqual({...native});
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('give a shipped doc the module an import of it gives', async () => {
    const text = fs.readFileSync(GUIDE, 'utf-8');
    expect(stored[docSourceKey(text)]).toBeDefined();
    const read = await importDocModule(GUIDE);
    const native = await import(`${pathToFileURL(GUIDE).href}?native`);
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
    fs.copyFileSync(GUIDE, file);
    const read = await importDocModule(file);
    expect(Object.prototype.toString.call(read)).toBe('[object Module]');
    expect({...read}).toEqual({...(await importDocModule(GUIDE))});
  });
});
