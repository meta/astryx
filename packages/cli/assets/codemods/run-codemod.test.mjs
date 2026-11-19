// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A code codemod's run binds jscodeshift to each grammar once for all
 * the files it reads, and writes what a run per file, which binds afresh for
 * each file, writes. Each file parses in its own grammar: TSX, TypeScript
 * without JSX, a declaration file, or JavaScript.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import jscodeshift from 'jscodeshift';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {grammarOf, runCodeCodemod} from './run-codemod.mjs';

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
      'ts',
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

/**
 * `files` written to a new folder.
 * @param {Record<string, string>} files
 * @returns {{dir: string, paths: string[]}}
 */
function folderWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemod-grammar-'));
  dirs.push(dir);
  const paths = Object.entries(files).map(([name, source]) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, source);
    return file;
  });
  return {dir, paths};
}

/** Syntax only TypeScript without JSX, or only a declaration file, allows. */
const TYPESCRIPT_ONLY = {
  'cast.ts': 'export const asItem = (raw: unknown) => <{id: string}>raw;\n',
  'types.d.ts':
    'export const limit: number;\n' +
    'export declare function load(id: string): Promise<void>;\n',
  'styles.d.css.ts': 'export const root: string;\n',
};

/** The codemod: rename the identifier `oldName` to `newName`. */
const RENAME_IDENTIFIER = {
  id: 'rename-old-name',
  type: 'code',
  package: 'core',
  codemod: {
    title: 'Rename oldName',
    fileExtensions: ['.tsx', '.ts'],
    /**
     * @param {{path: string, source: string}} file
     * @param {any} api
     */
    transform(file, api) {
      const root = api.jscodeshift(file.source);
      const names = root.find(api.jscodeshift.Identifier, {name: 'oldName'});
      if (names.size() === 0) return undefined;
      names.forEach((/** @type {any} */ p) => {
        p.node.name = 'newName';
      });
      return root.toSource();
    },
  },
};

describe('code codemod grammars', () => {
  it('names the grammar of each source file', () => {
    expect(
      [
        'a.tsx',
        'a.ts',
        'a.mts',
        'a.cts',
        'a.d.ts',
        'a.d.mts',
        'a.d.cts',
        'styles.d.css.ts',
        'dir.d.x/a.ts',
        'a.d.tsx',
        'a.js',
        'a.mjs',
        'a.jsx',
      ].map(grammarOf),
    ).toEqual([
      'tsx',
      'ts',
      'ts',
      'ts',
      'dts',
      'dts',
      'dts',
      'dts',
      'ts',
      'tsx',
      'babel',
      'babel',
      'babel',
    ]);
  });

  it('reads a type assertion and declaration files without an error', () => {
    const {dir, paths} = folderWith({
      ...TYPESCRIPT_ONLY,
      'view.tsx': 'export const v = <Box oldProp="q" />;\n',
    });
    // A codemod that declares no words reads every file; one that declares
    // words skips a file that says none of them only when the file parses.
    for (const entry of [
      RENAME,
      {...RENAME, codemod: {...RENAME.codemod, mentions: ['Box']}},
    ]) {
      const result = runCodeCodemod(entry, paths, {
        apply: false,
        log,
        jscodeshift,
        root: dir,
      });
      expect(result.errors).toEqual([]);
      expect(changed(dir, result)).toEqual(['view.tsx']);
    }
  });

  it('changes a TypeScript file and a declaration file in their own grammar', () => {
    const {dir, paths} = folderWith({
      'rename.ts':
        'export const oldName = (raw: unknown) => <{id: string}>raw;\n',
      'decl.d.ts':
        'export declare const oldName: number;\nexport const other: string;\n',
    });
    const result = runCodeCodemod(RENAME_IDENTIFIER, paths, {
      apply: true,
      log,
      jscodeshift,
      root: dir,
    });
    expect(result.errors).toEqual([]);
    expect(changed(dir, result).sort()).toEqual(['decl.d.ts', 'rename.ts']);
    expect(fs.readFileSync(path.join(dir, 'rename.ts'), 'utf8')).toBe(
      'export const newName = (raw: unknown) => <{id: string}>raw;\n',
    );
    expect(fs.readFileSync(path.join(dir, 'decl.d.ts'), 'utf8')).toBe(
      'export declare const newName: number;\nexport const other: string;\n',
    );
  });
});
