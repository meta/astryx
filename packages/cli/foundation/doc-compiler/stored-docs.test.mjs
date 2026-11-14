// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as util from 'node:util';
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {CLI_ROOT} from '../fs/paths.mjs';
import {importDocModule} from './import.mjs';
import {storedKey, storedParseKey, STORED_DOCS_FILE} from './stored-docs.mjs';
import {parseReadableDoc} from './parse-readable.mjs';
import {storedDocsText} from '../../scripts/generate-stored-docs.mjs';
import {
  descriptorStoreKey,
  readDescriptorSource,
  readStaticDescriptorValue,
  STATIC_DESCRIPTOR_TYPES,
} from '../discovery/theme-discovery.mjs';
import {ASTRYX_DEFINITIONS_DIR} from '../discovery/icon-definition-discovery.mjs';

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
// Counts the descriptor parses: a descriptor the store answers is never
// parsed.
const parses = vi.hoisted(() => ({count: 0}));
vi.mock('../runtime/lazy-dependencies.mjs', async importOriginal => {
  const actual = /** @type {any} */ (await importOriginal());
  return {
    ...actual,
    babelParser: () => {
      const parser = actual.babelParser();
      return {
        ...parser,
        parse: (/** @type {any[]} */ ...args) => {
          parses.count++;
          return parser.parse(...args);
        },
      };
    },
  };
});
// Counts the doc parser's runs: a parse the store answers never runs it.
const docParses = vi.hoisted(() => ({count: 0}));
vi.mock('../../authoring/doctypes/parse.mjs', async importOriginal => {
  const actual = /** @type {any} */ (await importOriginal());
  return {
    ...actual,
    parseDoc: (/** @type {any[]} */ ...args) => {
      docParses.count++;
      return actual.parseDoc(...args);
    },
  };
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

  it('hold, for every shipped typed descriptor, the value its static read gives', () => {
    /** @param {string} dir @returns {string[]} */
    const docFiles = dir =>
      fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          return entry.name === 'node_modules' || entry.name.startsWith('.')
            ? []
            : docFiles(file);
        }
        return entry.name.endsWith('.doc.mjs') ? [file] : [];
      });
    /** @type {Record<string, number>} */
    const checked = {};
    for (const file of [
      ...docFiles(CLI_ROOT),
      ...docFiles(path.join(CLI_ROOT, '..', 'core', 'src')),
    ]) {
      const text = fs.readFileSync(file, 'utf-8');
      for (const [typeName, data] of STATIC_DESCRIPTOR_TYPES) {
        const value = stored[descriptorStoreKey(text, typeName, data)];
        if (value === undefined) continue;
        expect(value, file).toEqual(
          readDescriptorSource(text, file, typeName, data),
        );
        checked[typeName] = (checked[typeName] ?? 0) + 1;
      }
    }
    // Every icon definition the CLI ships, and Core's themes.
    expect(checked.IconDefinitionDoc).toBe(
      fs
        .readdirSync(ASTRYX_DEFINITIONS_DIR)
        .filter(name => name.endsWith('.doc.mjs')).length,
    );
    expect(checked.ThemeDoc).toBeGreaterThan(0);
  });

  it('answer a shipped descriptor without parsing it, and parse an edited copy', () => {
    const file = path.join(ASTRYX_DEFINITIONS_DIR, 'add.doc.mjs');
    parses.count = 0;
    const read = readStaticDescriptorValue(file, 'add', 'IconDefinitionDoc', {
      data: true,
    });
    expect(parses.count).toBe(0);
    const text = fs.readFileSync(file, 'utf-8');
    expect(read).toEqual(
      readDescriptorSource(text, 'add', 'IconDefinitionDoc', true),
    );
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stored-descriptor-'));
    tmpDirs.push(dir);
    const copy = path.join(dir, 'add.doc.mjs');
    fs.writeFileSync(copy, `${text}// edited\n`);
    parses.count = 0;
    expect(
      readStaticDescriptorValue(copy, 'add', 'IconDefinitionDoc', {data: true}),
    ).toEqual(read);
    expect(parses.count).toBe(1);
  });

  it('hold, for each stored parse, exactly what parsing the doc gives, key order included', async () => {
    const {parseDoc} = await import('../../authoring/doctypes/parse.mjs');
    let checked = 0;
    for (const [key, value] of Object.entries(stored)) {
      if (!key.startsWith('parsed:')) continue;
      const [, name, docKey] = key.split(':');
      const exports = /** @type {Record<string, unknown>} */ (stored[docKey]);
      expect(exports, key).toBeDefined();
      const parsed = parseDoc(structuredClone(exports[name]), key);
      expect(JSON.stringify(value), key).toBe(JSON.stringify(parsed));
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('answer the parse of a shipped doc from the store, as a fresh value', async () => {
    const mod = /** @type {any} */ (await importDocModule(GUIDE));
    const name = mod.docs ? 'docs' : 'default';
    const key = storedParseKey(
      storedKey(fs.readFileSync(GUIDE, 'utf-8')),
      name,
    );
    expect(stored[key]).toBeDefined();
    docParses.count = 0;
    const read = parseReadableDoc(mod[name], 'guide');
    expect(docParses.count).toBe(0);
    expect(JSON.stringify(read)).toBe(JSON.stringify(stored[key]));
    // An edited copy is parsed.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stored-parse-'));
    tmpDirs.push(dir);
    const copy = path.join(dir, 'page-template.doc.mjs');
    fs.writeFileSync(copy, `${fs.readFileSync(GUIDE, 'utf-8')}// edited\n`);
    const edited = /** @type {any} */ (await importDocModule(copy));
    docParses.count = 0;
    expect(JSON.stringify(parseReadableDoc(edited[name], 'guide'))).toBe(
      JSON.stringify(read),
    );
    expect(docParses.count).toBe(1);
    // A parse gives a new value each time, never the shared export.
    expect(read).not.toBe(mod[name]);
    expect(parseReadableDoc(mod[name], 'guide')).not.toBe(read);
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
