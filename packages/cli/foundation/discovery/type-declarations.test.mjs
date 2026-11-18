// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for reading a package's exported type declarations from its
 * `.d.ts` files.
 * @input A temporary package whose declaration files re-export their types
 * @output Verifies which names resolve, the declaration text, and the order
 * @position Unit tests for foundation/discovery/type-declarations.mjs
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  exportedTypeDeclarations,
  packageRootDeclarationFile,
  typeNamesIn,
} from './type-declarations.mjs';

/** @type {string} */
let pkg;

/**
 * @param {string} relative
 * @param {string} text
 */
function write(relative, text) {
  const file = path.join(pkg, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text);
}

beforeAll(() => {
  pkg = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-type-declarations-')),
  );
  write(
    'package.json',
    JSON.stringify({
      name: 'fixture-ui',
      exports: {'.': {types: './dist/index.d.ts', default: './dist/index.js'}},
    }),
  );
  write(
    'dist/index.d.ts',
    [
      "export * from './Search/index.js';",
      "export { Widget } from './Widget.js';",
      "export type { Size as WidgetSize } from './utils/types.js';",
      '',
    ].join('\n'),
  );
  write(
    'dist/Search/index.d.ts',
    "export type { SearchSource, SearchItem } from './types.js';\n",
  );
  write(
    'dist/Search/types.d.ts',
    [
      'import type { ReactNode } from "react";',
      '/**',
      ' * Where the matches come from.',
      ' */',
      'export interface SearchSource<T extends SearchItem = SearchItem> {',
      '    /** Finds the matches for a query. */',
      '    search(query: string): Promise<T[]>;',
      '}',
      'export type SearchItem = {',
      '    id: string;',
      '    label: ReactNode;',
      '};',
      'export type Internal = number;',
      '',
    ].join('\n'),
  );
  write('dist/utils/types.d.ts', 'export type Size = number | string;\n');
  write('dist/Widget.d.ts', 'export declare function Widget(): null;\n');
});

afterAll(() => {
  if (pkg) fs.rmSync(pkg, {recursive: true, force: true});
});

describe('exportedTypeDeclarations', () => {
  it('reads a type through `export *` and an export list, without its comments', () => {
    const root = packageRootDeclarationFile(pkg);
    expect(root).toBe(path.join(pkg, 'dist/index.d.ts'));
    expect(
      exportedTypeDeclarations(/** @type {string} */ (root), ['SearchSource']),
    ).toEqual([
      {
        name: 'SearchSource',
        via: ['SearchSource'],
        declaration: [
          'interface SearchSource<T extends SearchItem = SearchItem> {',
          '    search(query: string): Promise<T[]>;',
          '}',
        ].join('\n'),
      },
      {
        name: 'SearchItem',
        via: ['SearchSource'],
        declaration: [
          'type SearchItem = {',
          '    id: string;',
          '    label: ReactNode;',
          '};',
        ].join('\n'),
      },
    ]);
  });

  it('reads a type the root renames, under the name the root gives it', () => {
    const root = /** @type {string} */ (packageRootDeclarationFile(pkg));
    expect(exportedTypeDeclarations(root, ['WidgetSize'])).toEqual([
      {
        name: 'WidgetSize',
        via: ['WidgetSize'],
        declaration: 'type Size = number | string;',
      },
    ]);
  });

  it('leaves out a component, a type the root does not export, and a React type', () => {
    const root = /** @type {string} */ (packageRootDeclarationFile(pkg));
    expect(
      exportedTypeDeclarations(root, ['Widget', 'Internal', 'ReactNode']),
    ).toEqual([]);
  });

  it('gives a type that two names reach to both of them', () => {
    const root = /** @type {string} */ (packageRootDeclarationFile(pkg));
    const found = exportedTypeDeclarations(root, [
      'SearchItem',
      'SearchSource',
    ]);
    expect(found.find(type => type.name === 'SearchItem')?.via).toEqual([
      'SearchItem',
      'SearchSource',
    ]);
  });

  it('names a nested type without its declaration once the nested budget is spent', () => {
    const root = /** @type {string} */ (packageRootDeclarationFile(pkg));
    expect(
      exportedTypeDeclarations(root, ['SearchSource'], {nestedChars: 10}),
    ).toEqual([
      expect.objectContaining({name: 'SearchSource'}),
      {name: 'SearchItem', via: ['SearchSource']},
    ]);
  });
});

describe('typeNamesIn', () => {
  it('names each capitalized identifier, but not the member of a qualified name', () => {
    expect(
      typeNamesIn('SearchSource<T> | React.ReactNode | Array<SearchItem>'),
    ).toEqual(['SearchSource', 'T', 'Array', 'SearchItem']);
  });
});
