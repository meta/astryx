// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for declared-types: the types a component's prop texts name
 * that its own package declares, read from the declaration files its
 * `exports` map names under `types`.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  CUT_MARK,
  MAX_MEMBERS,
  MAX_TYPE_TEXT,
  declaredTypes,
  typeNamesIn,
} from './declared-types.mjs';

/** @type {string} */
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-declared-types-'));
});

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/**
 * @param {string} file
 * @param {string} text
 */
function write(file, text) {
  const at = path.join(dir, file);
  fs.mkdirSync(path.dirname(at), {recursive: true});
  fs.writeFileSync(at, text);
}

/**
 * A package `@acme/ui` with the `exports` map given.
 * @param {Record<string, unknown>} exportsMap
 */
function pkg(exportsMap) {
  write(
    'package.json',
    JSON.stringify({name: '@acme/ui', version: '1.0.0', exports: exportsMap}),
  );
}

/**
 * @param {string} importSpecifier
 * @param {string[]} typeTexts
 */
const read = (importSpecifier, typeTexts) =>
  declaredTypes({
    packageDir: dir,
    packageName: '@acme/ui',
    importSpecifier,
    typeTexts,
  });

describe('typeNamesIn', () => {
  it('leaves out names in a callback parameter list when asked', () => {
    const text = '(item: Row, ctx: RowContext) => Cell | Fallback';
    expect(typeNamesIn(text)).toEqual([
      'Row',
      'RowContext',
      'Cell',
      'Fallback',
    ]);
    expect(typeNamesIn(text, {skipCallbackArgs: true})).toEqual([
      'Cell',
      'Fallback',
    ]);
  });

  it('names the identifiers a type text uses, outside strings, keys and dotted names', () => {
    expect(
      typeNamesIn(
        "React.Ref<Handle> | {type: 'Warning'; size?: SizeValue} | keyof T & string",
      ),
    ).toEqual(['React', 'Handle', 'SizeValue', 'T']);
  });
});

describe('declaredTypes', () => {
  it('lists an interface as its members, with optional and the JSDoc first sentence', () => {
    pkg({'./Thing': {types: './dist/Thing/index.d.ts', default: './x.js'}});
    write(
      'dist/Thing/index.d.ts',
      [
        'export interface ThingOptions {',
        '  /** The label. Shown above. */',
        '  label: string;',
        '  /**',
        '   * Called on change.',
        '   * @param value the value',
        '   */',
        '  onChange?(value: number): void;',
        '}',
        'export declare function Thing(props: {options: ThingOptions}): null;',
      ].join('\n'),
    );
    expect(read('@acme/ui/Thing', ['ThingOptions'])).toEqual([
      {
        name: 'ThingOptions',
        import: "import type { ThingOptions } from '@acme/ui/Thing';",
        members: [
          {
            name: 'label',
            type: 'string',
            optional: false,
            description: 'The label.',
          },
          {
            name: 'onChange',
            type: '(value: number) => void',
            optional: true,
            description: 'Called on change.',
          },
        ],
      },
    ]);
  });

  it('keeps type parameters and expands only one level', () => {
    pkg({'./List': {types: './dist/List/index.d.ts'}});
    write(
      'dist/List/index.d.ts',
      [
        'export interface Column<T extends object = object> {',
        '  key: keyof T;',
        '  sort?: SortConfig;',
        '}',
        'export interface SortConfig { direction: "asc" | "desc"; }',
      ].join('\n'),
    );
    const types = read('@acme/ui/List', ['Column<T>[]']);
    expect(types).toHaveLength(1);
    expect(types[0]).toMatchObject({
      name: 'Column',
      typeParameters: '<T extends object = object>',
      members: [
        {name: 'key', type: 'keyof T', optional: false},
        {name: 'sort', type: 'SortConfig', optional: true},
      ],
    });
  });

  it('gives an alias as its text on one line, comments left out', () => {
    pkg({'./Size': {types: './dist/Size/index.d.ts'}});
    write(
      'dist/Size/index.d.ts',
      "export type Size =\n  | 'sm' /** small */\n  | 'md';\nexport type Opaque = any;\n",
    );
    expect(read('@acme/ui/Size', ['Size', 'Opaque'])).toEqual([
      {
        name: 'Size',
        import: "import type { Size } from '@acme/ui/Size';",
        text: "'sm' | 'md'",
      },
    ]);
  });

  it('follows a chain of local re-exports and imports', () => {
    pkg({'./Menu': {types: './dist/Menu/index.d.ts'}});
    write('dist/Menu/index.d.ts', "export * from './Menu.js';\n");
    write(
      'dist/Menu/Menu.d.ts',
      "import type {MenuItem} from './types.js';\nexport type {MenuItem};\nexport declare function Menu(p: {items: MenuItem[]}): null;\n",
    );
    write('dist/Menu/types.d.ts', 'export type MenuItem = {id: string};\n');
    expect(read('@acme/ui/Menu', ['MenuItem[]'])).toEqual([
      {
        name: 'MenuItem',
        import: "import type { MenuItem } from '@acme/ui/Menu';",
        members: [{name: 'id', type: 'string', optional: false}],
      },
    ]);
  });

  it('names the entry the type is imported through, or none when no entry exports it', () => {
    pkg({
      '.': {types: './dist/index.d.ts'},
      './Date': {types: './dist/Date/index.d.ts'},
      './Calendar': {types: './dist/Calendar/index.d.ts'},
    });
    write('dist/index.d.ts', "export * from './Date/index.js';\n");
    write(
      'dist/Date/index.d.ts',
      "import type {ISODate} from '../Calendar/index.js';\nimport type {Hidden} from '../internal.js';\nexport declare function DateInput(p: {value: ISODate; h: Hidden}): null;\n",
    );
    write(
      'dist/Calendar/index.d.ts',
      "export type {ISODate} from '../utils.js';\n",
    );
    write('dist/utils.d.ts', 'export type ISODate = `${number}-${number}`;\n');
    write('dist/internal.d.ts', 'export type Hidden = number;\n');
    expect(read('@acme/ui/Date', ['ISODate', 'Hidden'])).toEqual([
      {
        name: 'ISODate',
        import: "import type { ISODate } from '@acme/ui/Calendar';",
        text: '`${number}-${number}`',
      },
      {name: 'Hidden', text: 'number'},
    ]);
  });

  it('skips a type another package declares', () => {
    pkg({'./Box': {types: './dist/Box/index.d.ts'}});
    write(
      'dist/Box/index.d.ts',
      "import type {StyleXStyles} from '@stylexjs/stylex';\nimport type {ReactNode} from 'react';\nexport declare function Box(p: {x: StyleXStyles; c: ReactNode}): null;\n",
    );
    write(
      'node_modules/@stylexjs/stylex/package.json',
      JSON.stringify({name: '@stylexjs/stylex', types: './index.d.ts'}),
    );
    write(
      'node_modules/@stylexjs/stylex/index.d.ts',
      'export type StyleXStyles = {a: 1};\n',
    );
    expect(read('@acme/ui/Box', ['StyleXStyles', 'ReactNode'])).toEqual([]);
  });

  it('answers with nothing when the package ships no declarations', () => {
    pkg({'./Plain': {default: './dist/Plain/index.js'}});
    write('dist/Plain/index.js', 'export const Plain = 1;\n');
    expect(read('@acme/ui/Plain', ['PlainOptions'])).toEqual([]);
    // An import from another package is never read.
    expect(
      declaredTypes({
        packageDir: dir,
        packageName: '@acme/ui',
        importSpecifier: '@other/ui/Plain',
        typeTexts: ['PlainOptions'],
      }),
    ).toEqual([]);
  });

  it('caps a long member list and a long text, and marks the cut', () => {
    pkg({'./Big': {types: './dist/Big/index.d.ts'}});
    const members = Array.from(
      {length: MAX_MEMBERS + 3},
      (_, i) => `  m${i}: number;`,
    );
    const long = Array.from({length: 80}, (_, i) => `Value${i}`).join(' | ');
    write(
      'dist/Big/index.d.ts',
      `export interface Big {\n${members.join('\n')}\n}\nexport type Long = ${long};\n`,
    );
    const [big, longType] = read('@acme/ui/Big', ['Big', 'Long']);
    expect(big.members).toHaveLength(MAX_MEMBERS);
    expect(big.more).toBe(3);
    expect(longType.text?.length).toBe(MAX_TYPE_TEXT);
    expect(longType.text?.endsWith(CUT_MARK)).toBe(true);
  });

  it('writes typographic punctuation in plain ASCII', () => {
    pkg({'./Note': {types: './dist/Note/index.d.ts'}});
    write(
      'dist/Note/index.d.ts',
      'export interface Note {\n  /** The body \u2014 shown \u201cas is\u201d. */\n  body: string;\n}\n',
    );
    expect(read('@acme/ui/Note', ['Note'])[0].members?.[0].description).toBe(
      'The body - shown "as is".',
    );
  });

  it('prints a string-literal union whole however long', () => {
    pkg({'./Icon': {types: './dist/Icon/index.d.ts'}});
    const names = Array.from({length: 80}, (_, i) => `'icon${i}'`).join(' | ');
    write('dist/Icon/index.d.ts', `export type IconName = ${names};\n`);
    const [icon] = read('@acme/ui/Icon', ['IconName']);
    expect(icon.text).toBe(names);
    expect(icon.text?.length).toBeGreaterThan(MAX_TYPE_TEXT);
  });

  it('skips a brand whose members are all never', () => {
    pkg({'./Grid': {types: './dist/Grid/index.d.ts'}});
    write(
      'dist/Grid/index.d.ts',
      "export interface Capability { readonly '@acme/ui/capability/v1': never; }\nexport interface Options { size: number; }\n",
    );
    expect(
      read('@acme/ui/Grid', ['Capability | Capability[]', 'Options']).map(
        t => t.name,
      ),
    ).toEqual(['Options']);
  });

  it('skips a type a prop names only as a callback parameter', () => {
    pkg({'./Row': {types: './dist/Row/index.d.ts'}});
    write(
      'dist/Row/index.d.ts',
      'export interface RowContext { index: number; }\nexport interface RowStyle { dense: boolean; }\n',
    );
    expect(
      read('@acme/ui/Row', [
        '(ctx: RowContext) => void',
        '(ctx: RowStyle) => void',
        'RowStyle',
      ]).map(t => t.name),
    ).toEqual(['RowStyle']);
  });

  it("reads a hook's declared signature and its texts whole", () => {
    pkg({'./Toast': {types: './dist/Toast/index.d.ts'}});
    write(
      'dist/Toast/index.d.ts',
      "export { useToast } from './useToast.js';\nexport type { ToastOptions, ShowToastFn } from './types.js';\n",
    );
    write(
      'dist/Toast/useToast.d.ts',
      "import type { ShowToastFn } from './types.js';\nexport declare function useToast(): ShowToastFn;\n",
    );
    write(
      'dist/Toast/types.d.ts',
      'export interface ToastOptions { body: string; }\nexport type ShowToastFn = (options: ToastOptions) => () => void;\n',
    );
    expect(
      declaredTypes({
        packageDir: dir,
        packageName: '@acme/ui',
        importSpecifier: '@acme/ui/Toast',
        wholeTexts: ['(options: ToastOptions) => () => void'],
        declaredFunction: 'useToast',
      }).map(t => [t.name, t.import]),
    ).toEqual([
      ['ToastOptions', "import type { ToastOptions } from '@acme/ui/Toast';"],
      ['ShowToastFn', "import type { ShowToastFn } from '@acme/ui/Toast';"],
    ]);
  });
});
