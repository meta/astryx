// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file readDocView and the loaders built on it: every component and hook read
 *   is the authored doc, compiled losslessly, and each reader keeps its own
 *   strictness.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Project} from '../config/project.mjs';
import {CLI_ROOT} from '../fs/paths.mjs';
import {loadComponentDoc, loadDocs} from '../discovery/component-loader.mjs';
import {compileDocFile, readDocView} from './read.mjs';
import {importDocModule, importNativeModule} from './import.mjs';
import {collectDocInputs} from './inputs.mjs';

const REPO_ROOT = path.resolve(CLI_ROOT, '..', '..');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-doc-read-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * @param {string} name
 * @param {string} text
 */
function write(name, text) {
  const file = path.join(tmpDir, name);
  fs.writeFileSync(file, text);
  return file;
}

/** Drop what JSON drops, keep key order: the compiled form of a value. */
const asJson = (/** @type {unknown} */ value) =>
  JSON.parse(JSON.stringify(value));

describe('component and hook reads over what this repo ships', () => {
  it('are the authored docs, compiled without loss', async () => {
    const dir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-doc-read-'));
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"consumer"}');
      const {inputs} = await collectDocInputs(await Project.load(dir));
      const docs = inputs.filter(
        input => input.root === 'components' || input.root === 'hooks',
      );
      expect(docs.length).toBeGreaterThan(200);
      for (const input of docs) {
        const mod = await import(pathToFileURL(input.file).href);
        const authored = mod.default ?? mod.docs;
        const root = /** @type {'components' | 'hooks'} */ (input.root);
        // Byte-for-byte what JSON output has always printed for the doc.
        expect(JSON.stringify(await loadDocs(input.file, {root}))).toBe(
          JSON.stringify(authored),
        );
        // A checked load passes every shipped doc.
        await expect(loadComponentDoc(input.file, {root})).resolves.toEqual(
          asJson(authored),
        );
      }
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }, 180_000);
});

describe('readDocView', () => {
  const card =
    "export default {type: 'component', name: 'Card', displayName: 'Card', usage: {description: 'A card.'}, props: []};\n";

  it('freezes the node a whole-project compile collects', async () => {
    const file = write('Card.doc.mjs', card);
    const {node} = await compileDocFile(
      file,
      {root: 'components', check: true},
      {node: true},
    );
    expect(node).not.toBeNull();
    expect(Object.isFrozen(node)).toBe(true);
    expect(Object.isFrozen(node?.doc.props)).toBe(true);
  });

  it("keeps each reader's strictness for a doc that fails its parser", async () => {
    const file = write(
      'Bad.doc.mjs',
      "export default {type: 'component', name: 'Bad'};\n",
    );
    await expect(loadDocs(file)).resolves.toEqual({
      type: 'component',
      name: 'Bad',
    });
    await expect(loadComponentDoc(file)).rejects.toThrow(`${file} is invalid`);
  });

  it('passes on what a file throws when it is imported, unchanged', async () => {
    const file = write('Throws.doc.mjs', "throw new RangeError('no way');\n");
    for (const read of [loadDocs, loadComponentDoc]) {
      await expect(read(file)).rejects.toThrow(RangeError);
      await expect(read(file)).rejects.toThrow('no way');
    }
  });

  it('reads a file with no doc as undefined, or, checked, says what it exports instead', async () => {
    const file = write('Empty.doc.mjs', 'export const unrelated = 1;\n');
    await expect(loadDocs(file)).resolves.toBeUndefined();
    await expect(loadComponentDoc(file)).rejects.toThrow(
      `${file} has no default export or \`docs\` export (it exports \`unrelated\`), so it documents nothing. Fix: export the doc object as the default export`,
    );
  });

  it('says a checked doc file is empty', async () => {
    const file = write('Blank.doc.mjs', '// nothing yet\n');
    await expect(loadComponentDoc(file)).rejects.toThrow(
      `${file} is empty, so it documents nothing.`,
    );
  });

  it('applies the translation a module exports for the reading language', async () => {
    const file = write(
      'Card.doc.mjs',
      card + "export const docsZh = {usage: {description: '卡片。'}};\n",
    );
    expect((await loadDocs(file, {zh: true})).usage.description).toBe('卡片。');
    expect((await loadDocs(file, {lang: 'zh'})).usage.description).toBe(
      '卡片。',
    );
    expect((await loadDocs(file)).usage.description).toBe('A card.');
    expect((await loadDocs(file, {dense: true})).usage.description).toBe(
      'A card.',
    );
  });

  it('reads a narrower set of exports when a reader always has', async () => {
    const file = write(
      'Both.doc.mjs',
      card +
        "export const docs = {name: 'Legacy', description: 'Old.', props: []};\n",
    );
    expect((await readDocView(file, {root: 'components'})).name).toBe('Card');
    expect(
      (await readDocView(file, {root: 'components', exports: ['docs']})).name,
    ).toBe('Legacy');
  });

  it('reads each file once while it is unchanged, and retries a file that failed to load', async () => {
    const file = write('Card.doc.mjs', card);
    const before = await compileDocFile(file, {root: 'components'});
    expect(await compileDocFile(file, {root: 'components'})).toBe(before);
    const broken = write('Broken.doc.mjs', 'export default {;\n');
    const failed = await compileDocFile(broken, {root: 'components'});
    expect(failed.loadFailure).toBeInstanceOf(Error);
    expect(await compileDocFile(broken, {root: 'components'})).not.toBe(failed);
  });

  it('prints what the module holds: no JSON anywhere a reader looks', async () => {
    const file = write(
      'Odd.doc.mjs',
      `const doc = {
  type: 'component', name: 'Odd', displayName: 'Odd', usage: {description: 'd'},
  props: undefined, big: 10n, when: new Date(0), limit: Infinity,
  examples: [{title: 'x', code() { return 1; }}],
  get lazy() { throw new Error('never read'); },
};
doc.self = doc;
export default doc;
`,
    );
    const view = await loadDocs(file);
    expect(Object.keys(view)).toContain('props');
    expect(view.props).toBeUndefined();
    expect(view.big).toBe(10n);
    expect(view.when).toBeInstanceOf(Date);
    expect(view.limit).toBe(Infinity);
    expect(typeof view.examples[0].code).toBe('function');
    expect(view.self).toBe(view);
    expect(() => view.lazy).toThrow('never read');
    // A checked read of a valid doc with odd values is no different.
    const ok = write(
      'Big.doc.mjs',
      "export default {type: 'component', name: 'Big', displayName: 'Big', usage: {description: 'd'}, props: [], playground: {seed: 10n}};\n",
    );
    expect((await loadComponentDoc(ok)).playground.seed).toBe(10n);
  });

  it("hands readers the module's own doc, as main always did", async () => {
    const file = write(
      'Deep.doc.mjs',
      `let deep = {};
const root = deep;
for (let i = 0; i < 5000; i++) deep = deep.next = {};
const doc = new Proxy(
  {type: 'component', name: 'Deep', displayName: 'Deep', usage: {description: 'd'}, props: [], root},
  {get: (target, key) => (key === 'displayName' ? 'From the proxy' : target[key])},
);
export default doc;
`,
    );
    const mod = await import(pathToFileURL(file).href);
    const view = await loadDocs(file);
    expect(view).toBe(mod.default);
    expect(view.displayName).toBe('From the proxy');
    expect(await loadComponentDoc(file)).toBe(mod.default);
  });

  it('translates and checks afresh on every read, as main did', async () => {
    const file = write(
      'Counted.doc.mjs',
      `let reads = 0;
export default {
  type: 'component', name: 'Counted', displayName: 'Counted', props: [],
  get usage() { reads += 1; return {description: 'read ' + reads}; },
};
export const docsZh = {get props() { throw new TypeError('bad translation'); }};
`,
    );
    const first = await loadDocs(file, {lang: 'zh'}).catch(error => error);
    const second = await loadDocs(file, {lang: 'zh'}).catch(error => error);
    expect(first).toBeInstanceOf(TypeError);
    expect(second).not.toBe(first);
    const template = write(
      'Block.doc.mjs',
      "export default {type: 'block', name: 'Block', description: 'd', componentsUsed: ['A']};\n",
    );
    const read = () =>
      readDocView(template, {
        root: 'templates',
        exports: ['default'],
        strict: true,
        value: 'parsed',
      });
    const one = await read();
    one.componentsUsed.push('mutated');
    expect((await read()).componentsUsed).toEqual(['A']);
  });

  it('treats any thrown value as a failure, undefined included, as main did', async () => {
    const strict = write(
      'ThrowsUndefined.doc.mjs',
      "export default {type: 'component', name: 'ThrowsUndefined', displayName: 'T', props: [], get usage() { throw undefined; }};\n",
    );
    await expect(loadComponentDoc(strict)).rejects.toBeUndefined();
    const translated = write(
      'ZhUndefined.doc.mjs',
      "export default {type: 'component', name: 'ZhUndefined', displayName: 'Z', props: [], usage: {description: 'd'}};\nexport const docsZh = {get usage() { throw undefined; }};\n",
    );
    await expect(loadDocs(translated, {lang: 'zh'})).rejects.toBeUndefined();
    const imported = write('ImportUndefined.doc.mjs', 'throw undefined;\n');
    await expect(loadDocs(imported)).rejects.toBeUndefined();
    const bare = write(
      'NullProto.doc.mjs',
      'const e = Object.create(null);\ne.tag = 1;\nthrow e;\n',
    );
    const thrown = await loadDocs(bare).catch(error => error);
    expect(Object.getPrototypeOf(thrown)).toBeNull();
    expect(thrown.tag).toBe(1);
  });

  it('never lets a message that is not a path break a read', async () => {
    const file = write(
      'Odd.doc.mjs',
      "throw new Error('Could not read file:///tmp/data/100%-coverage.json');\n",
    );
    await expect(loadDocs(file)).rejects.toThrow('100%-coverage.json');
    const empty = write('Empty.doc.mjs', "throw new Error('');\n");
    const {diagnostics} = await compileDocFile(empty, {root: 'components'});
    expect(diagnostics[0].message).not.toBe('');
  });

  it('reads an empty export as that value, and checks it as that value', async () => {
    const file = write('Null.doc.mjs', 'export default null;\n');
    await expect(
      readDocView(file, {root: 'templates', exports: ['default']}),
    ).resolves.toBeNull();
    await expect(
      readDocView(file, {
        root: 'templates',
        exports: ['default'],
        strict: true,
        label: 'Template "t"',
      }),
    ).rejects.toThrow(/received null/);
  });

  it('keeps the unchecked readers on a plain import', () => {
    // Outside vitest's own loader: a plain import cannot strip types under
    // node_modules, and the checked loader (jiti) can, as on main.
    const dir = path.join(tmpDir, 'node_modules', 'kit');
    fs.mkdirSync(dir, {recursive: true});
    const file = path.join(dir, 'Typed.doc.ts');
    fs.writeFileSync(
      file,
      "export default {name: 'Typed'} as {name: string};\n",
    );
    const loader = path.join(
      CLI_ROOT,
      'foundation/discovery/component-loader.mjs',
    );
    const run = (/** @type {string} */ call) =>
      spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `const m = await import(${JSON.stringify(pathToFileURL(loader).href)});
try { const d = await m.${call}(${JSON.stringify(file)}); console.log('ok', d.name); }
catch (e) { console.log('threw', e.message.split('\\n')[0]); }`,
        ],
        {encoding: 'utf8'},
      ).stdout.trim();
    expect(run('loadDocs')).toMatch(/^threw .*node_modules/);
    expect(run('loadComponentDoc')).toMatch(/^(ok Typed|threw .*is invalid)/);
  });
});

describe('an edited doc file, read again in the same process', () => {
  /** @param {string} displayName */
  const doc = displayName =>
    `export default {type: 'component', name: 'Edited', displayName: ${JSON.stringify(displayName)}, usage: {description: 'd'}, props: []};\n`;

  it('reads the new content, and shares each version while it is unchanged', async () => {
    const file = write('Edited.doc.mjs', doc('First'));
    const first = await loadDocs(file);
    expect(first.displayName).toBe('First');
    expect(await loadDocs(file)).toBe(first);
    fs.writeFileSync(file, doc('Second, longer'));
    const second = await loadDocs(file);
    expect(second.displayName).toBe('Second, longer');
    expect(await loadDocs(file)).toBe(second);
    expect((await loadComponentDoc(file)).displayName).toBe('Second, longer');
  });

  it('reads an edited TypeScript doc again', async () => {
    const file = write('Edited.doc.ts', doc('First'));
    expect((await loadComponentDoc(file)).displayName).toBe('First');
    fs.writeFileSync(file, doc('Second, longer'));
    expect((await loadComponentDoc(file)).displayName).toBe('Second, longer');
  });

  it('gives each importer its own read of an edited TypeScript doc, as a new process would', async () => {
    const file = write('Pair.doc.ts', doc('First'));
    const nativeBefore = await importNativeModule(file);
    expect(await importDocModule(file)).not.toBe(nativeBefore);
    fs.writeFileSync(file, doc('Second, longer'));
    // The unchecked reader (a plain import) first, then the checked one (jiti).
    expect((await loadDocs(file)).displayName).toBe('Second, longer');
    expect((await loadComponentDoc(file)).displayName).toBe('Second, longer');
    const nativeAfter = await importNativeModule(file);
    const docAfter = await importDocModule(file);
    expect(docAfter).not.toBe(nativeAfter);
    expect(await importNativeModule(file)).toBe(nativeAfter);
    expect(await importDocModule(file)).toBe(docAfter);
  });

  it('lowers an edited file again for a whole-project compile', async () => {
    const file = write('Edited.doc.mjs', doc('First'));
    const read = () => compileDocFile(file, {root: 'components'});
    expect((await read()).view.displayName).toBe('First');
    fs.writeFileSync(file, doc('Second, longer'));
    expect((await read()).view.displayName).toBe('Second, longer');
  });

  it('reads a fix after an edit that broke the file', async () => {
    const file = write('Edited.doc.mjs', doc('First'));
    expect((await loadDocs(file)).displayName).toBe('First');
    fs.writeFileSync(file, 'export default {;\n');
    await expect(loadDocs(file)).rejects.toThrow();
    fs.writeFileSync(file, doc('Fixed again'));
    expect((await loadDocs(file)).displayName).toBe('Fixed again');
  });
});
