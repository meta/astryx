// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A code codemod's run binds jscodeshift to each parser once for all
 * the files it reads, and writes what a run per file, which binds afresh for
 * each file, writes.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import jscodeshift from 'jscodeshift';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {runCodeCodemod} from './run-codemod.mjs';

/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, {recursive: true, force: true});
});

const log = {
  step() {},
  info() {},
  success() {},
  warn() {},
  error() {},
  message() {},
};

/** @type {Record<string, string>} */
const FILES = {
  'a.tsx': 'export const a = <Box oldProp="x" />;\n',
  'b.ts': 'export const b: number = 1;\n',
  'c.jsx': 'export const c = <Box oldProp="y" />;\n',
  'd.tsx': 'export const d = <Box oldProp="z" />;\n',
  'e.js': 'export const e = 2;\n',
};

/** The codemod: rename `oldProp` to `newProp` on JSX elements. */
const RENAME = {
  id: 'rename-old-prop',
  type: 'code',
  package: 'core',
  codemod: {
    title: 'Rename oldProp',
    fileExtensions: ['.tsx', '.ts', '.jsx', '.js'],
    /**
     * @param {{path: string, source: string}} file
     * @param {any} api
     */
    transform(file, api) {
      const root = api.jscodeshift(file.source);
      const attrs = root.find(api.jscodeshift.JSXAttribute, {
        name: {name: 'oldProp'},
      });
      if (attrs.size() === 0) return undefined;
      attrs.forEach((/** @type {any} */ p) => {
        p.node.name.name = 'newProp';
      });
      return root.toSource();
    },
  },
};

/**
 * FILES written to a new folder.
 * @returns {{dir: string, paths: string[]}}
 */
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemod-parsers-'));
  dirs.push(dir);
  const paths = Object.entries(FILES).map(([name, source]) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, source);
    return file;
  });
  return {dir, paths};
}

/**
 * Each file's text in a fixture folder, by name.
 * @param {string} dir
 */
const contents = dir =>
  Object.fromEntries(
    Object.keys(FILES).map(name => [
      name,
      fs.readFileSync(path.join(dir, name), 'utf8'),
    ]),
  );

/**
 * The changed files a run names, relative to its folder.
 * @param {string} dir
 * @param {{changedFiles: string[]}} result
 */
const changed = (dir, result) =>
  result.changedFiles.map(file => path.relative(dir, path.resolve(dir, file)));

describe('code codemod parsers', () => {
  it('binds jscodeshift to each parser once for all the files', () => {
    const shared = fixture();
    const withParser = vi.fn(parser => jscodeshift.withParser(parser));
    const result = runCodeCodemod(RENAME, shared.paths, {
      apply: true,
      log,
      jscodeshift: {withParser},
      root: shared.dir,
    });
    expect(withParser.mock.calls.map(([parser]) => parser).sort()).toEqual([
      'babel',
      'tsx',
    ]);
    expect(result.filesChanged).toBe(3);

    // A run per file binds a fresh jscodeshift for each one; the shared run
    // writes the same files and names the same changes.
    const single = fixture();
    /** @type {string[]} */
    const singleChanged = [];
    for (const file of single.paths) {
      const one = runCodeCodemod(RENAME, [file], {
        apply: true,
        log,
        jscodeshift,
        root: single.dir,
      });
      singleChanged.push(...changed(single.dir, one));
    }
    expect(contents(shared.dir)).toEqual(contents(single.dir));
    expect(changed(shared.dir, result).sort()).toEqual(singleChanged.sort());
    expect(contents(shared.dir)['a.tsx']).toContain('newProp');
  });
});
