// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the types a `component.detail.props` answer gives each prop.
 * @input A temporary package with a component doc and declaration files
 * @output Verifies the per-prop `types` and the text block that prints them
 * @position Unit tests for api/component/detail/props
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {componentDetailProps} from './props.mjs';
import {formatPropTypes} from '../../../../clients/cli/lib/component-format.mjs';

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

const PROPS = [
  {name: 'label', type: 'string', description: 'The label.', required: true},
  {
    name: 'searchSource',
    type: 'SearchSource<T>',
    description: 'Where the matches come from.',
  },
  {name: 'width', type: 'SizeValue', description: 'The width.'},
  {name: 'onOpen', type: '() => void', description: 'Runs when it opens.'},
];

beforeAll(() => {
  pkg = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-props-types-')),
  );
  write(
    'package.json',
    JSON.stringify({name: 'fixture-ui', types: './dist/index.d.ts'}),
  );
  write(
    'dist/index.d.ts',
    "export * from './Search/types.js';\nexport type { SizeValue } from './utils.js';\n",
  );
  write(
    'dist/Search/types.d.ts',
    [
      'export interface SearchSource<T extends SearchItem = SearchItem> {',
      '    search(query: string): Promise<T[]>;',
      '}',
      'export type SearchItem = { id: string; label: string };',
      '',
    ].join('\n'),
  );
  write('dist/utils.d.ts', 'export type SizeValue = number | string;\n');
  write('src/Search/Search.doc.mjs', 'export const doc = {};\n');
});

afterAll(() => {
  if (pkg) fs.rmSync(pkg, {recursive: true, force: true});
});

describe('componentDetailProps types', () => {
  it('gives each prop the exported types its type names, and the types those name', () => {
    const response = componentDetailProps({props: PROPS}, 'fixture-ui', {
      docPath: path.join(pkg, 'src/Search/Search.doc.mjs'),
    });
    expect(response.data.map(prop => [prop.name, prop.types])).toEqual([
      ['label', undefined],
      [
        'searchSource',
        [
          {
            name: 'SearchSource',
            declaration: [
              'interface SearchSource<T extends SearchItem = SearchItem> {',
              '    search(query: string): Promise<T[]>;',
              '}',
            ].join('\n'),
          },
          {
            name: 'SearchItem',
            declaration: 'type SearchItem = { id: string; label: string };',
          },
        ],
      ],
      [
        'width',
        [{name: 'SizeValue', declaration: 'type SizeValue = number | string;'}],
      ],
      ['onOpen', undefined],
    ]);
  });

  it('gives a prop every type its own declarations name, also when an earlier prop reached it first', () => {
    const response = componentDetailProps(
      {
        props: [
          {name: 'item', type: 'SearchItem', description: 'One match.'},
          {name: 'source', type: 'SearchSource<T>', description: 'Matches.'},
        ],
      },
      'fixture-ui',
      {docPath: path.join(pkg, 'src/Search/Search.doc.mjs')},
    );
    expect(
      response.data.map(prop => [
        prop.name,
        prop.types?.map(type => type.name),
      ]),
    ).toEqual([
      ['item', ['SearchItem']],
      ['source', ['SearchItem', 'SearchSource']],
    ]);
  });

  it('leaves the props as written when the doc is not inside the owner package', () => {
    const response = componentDetailProps({props: PROPS}, 'another-ui', {
      docPath: path.join(pkg, 'src/Search/Search.doc.mjs'),
    });
    expect(response.data).toEqual(PROPS);
  });

  it('prints the types once, after one import line, in the order the props name them', () => {
    const {data} = componentDetailProps({props: PROPS}, 'fixture-ui', {
      docPath: path.join(pkg, 'src/Search/Search.doc.mjs'),
    });
    expect(formatPropTypes(data, 'fixture-ui')).toBe(
      [
        '',
        '## Types',
        '',
        '```ts',
        "import type {SearchSource, SearchItem, SizeValue} from 'fixture-ui';",
        '',
        'interface SearchSource<T extends SearchItem = SearchItem> {',
        '    search(query: string): Promise<T[]>;',
        '}',
        'type SearchItem = { id: string; label: string };',
        'type SizeValue = number | string;',
        '```',
        '',
      ].join('\n'),
    );
  });

  it('prints nothing when no prop names a type', () => {
    expect(formatPropTypes([{name: 'label'}], 'fixture-ui')).toBe('');
  });
});
