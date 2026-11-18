// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Every component doc under a Core `src` is read once per process for all of
 * theme build's views of Core's docs, and read again after a doc changes.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const loads = vi.hoisted(() => ({files: /** @type {string[]} */ ([])}));

vi.mock('./component-loader.mjs', async importOriginal => {
  /** @type {typeof import('./component-loader.mjs')} */
  const real = await importOriginal();
  return {
    ...real,
    /** @param {string} file @param {any} [opts] */
    loadComponentDoc: (file, opts) => {
      loads.files.push(file);
      return real.loadComponentDoc(file, opts);
    },
  };
});

const {coreComponentDocs} = await import('./core-component-docs.mjs');

/** @type {string} */
let root;
/** @type {string} */
let src;

/**
 * Write a component doc for `name` in `dir` under `src`.
 * @param {string} dir
 * @param {string} name
 * @param {string} [description]
 */
function writeDoc(dir, name, description = `The ${name} component.`) {
  fs.mkdirSync(path.join(src, dir), {recursive: true});
  const doc = {
    type: 'component',
    name,
    displayName: name,
    description,
    props: [],
  };
  fs.writeFileSync(
    path.join(src, dir, `${name}.doc.mjs`),
    `export default ${JSON.stringify(doc)};\n`,
  );
}

beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-core-docs-')),
  );
  src = path.join(root, 'src');
  loads.files.length = 0;
});

afterEach(() => {
  fs.rmSync(root, {recursive: true, force: true});
});

describe('coreComponentDocs', () => {
  it('lists every component doc, depth first, with its doc or what reading it threw', async () => {
    writeDoc('Alpha', 'Alpha');
    writeDoc('Beta/Gamma', 'Gamma');
    fs.writeFileSync(
      path.join(src, 'Beta', 'Broken.doc.mjs'),
      "throw new Error('broken doc');\n",
    );
    // Neither tests nor installed dependencies hold Core's docs.
    writeDoc('__tests__', 'Fixture');
    writeDoc('node_modules/dep', 'Dep');

    const read = await coreComponentDocs(src);
    expect(read.map(entry => path.relative(src, entry.file))).toEqual(
      expectedOrder([
        'Alpha/Alpha.doc.mjs',
        'Beta/Broken.doc.mjs',
        'Beta/Gamma/Gamma.doc.mjs',
      ]),
    );
    const byFile = new Map(
      read.map(entry => [path.relative(src, entry.file), entry]),
    );
    expect(byFile.get('Alpha/Alpha.doc.mjs')?.doc?.name).toBe('Alpha');
    expect(byFile.get('Beta/Gamma/Gamma.doc.mjs')?.doc?.name).toBe('Gamma');
    expect(byFile.get('Beta/Broken.doc.mjs')).toHaveProperty('error');
  });

  it('reads each doc once while nothing changes, for every caller in the process', async () => {
    writeDoc('Alpha', 'Alpha');
    writeDoc('Beta', 'Beta');
    const first = await coreComponentDocs(src);
    const second = await coreComponentDocs(src);
    expect(second).toBe(first);
    expect(loads.files.length).toBe(2);
  });

  it('reads the docs again once one changes', async () => {
    writeDoc('Alpha', 'Alpha');
    const before = await coreComponentDocs(src);
    expect(before[0].doc.description).toBe('The Alpha component.');
    writeDoc('Alpha', 'Alpha', 'A changed description.');
    const after = await coreComponentDocs(src);
    expect(after[0].doc.description).toBe('A changed description.');
  });

  it("gives a src reached through a symlink the read of its real path, as a project's node_modules reaches Core", async () => {
    writeDoc('Alpha', 'Alpha');
    const linked = path.join(root, 'linked-src');
    fs.symlinkSync(src, linked, 'dir');
    const real = await coreComponentDocs(src);
    expect(await coreComponentDocs(linked)).toBe(real);
    expect(loads.files).toEqual([path.join(src, 'Alpha', 'Alpha.doc.mjs')]);
  });
});

/**
 * The walk's order for `files`: each folder's entries as the file system lists
 * them, a folder's own docs and subfolders in that listing order.
 * @param {string[]} files - paths under `src`
 * @returns {string[]}
 */
function expectedOrder(files) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} rel */
  const visit = rel => {
    for (const entry of fs.readdirSync(path.join(src, rel), {
      withFileTypes: true,
    })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(child);
      else if (files.includes(child)) out.push(child);
    }
  };
  visit('');
  return out;
}
