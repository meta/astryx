// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Documented props against a component's TypeScript props: each kind
 * of finding, the loose type rules, the props a doc never needs, and the
 * visible skip when the project has no TypeScript.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  comparePropDocs,
  comparePropTables,
  PROPS_NOT_DOCUMENTED,
  TYPESCRIPT_MISSING_REASON,
} from './prop-drift.mjs';
import {unusableTypeScriptReason} from './project-typescript.mjs';

const require = createRequire(import.meta.url);
const TYPESCRIPT_DIR = path.dirname(require.resolve('typescript/package.json'));

/** @type {string} */
let pkg;

beforeEach(() => {
  pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-prop-drift-'));
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkg, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        jsx: 'react-jsx',
        module: 'esnext',
        moduleResolution: 'bundler',
        target: 'es2022',
      },
    }),
  );
});

afterEach(() => {
  fs.rmSync(pkg, {recursive: true, force: true});
});

function withTypeScript() {
  fs.mkdirSync(path.join(pkg, 'node_modules'), {recursive: true});
  fs.symlinkSync(
    TYPESCRIPT_DIR,
    path.join(pkg, 'node_modules', 'typescript'),
    'dir',
  );
}

/**
 * TypeScript 7 (no JavaScript compiler API) with the TypeScript 6 API package
 * beside it, which re-exports a real TypeScript.
 */
function withTypeScript7AndItsTypeScript6Api() {
  const ts7 = path.join(pkg, 'node_modules', 'typescript');
  fs.mkdirSync(ts7, {recursive: true});
  fs.writeFileSync(
    path.join(ts7, 'package.json'),
    JSON.stringify({
      name: 'typescript',
      version: '7.0.2',
      exports: {'./package.json': './package.json'},
    }),
  );
  const ts6 = path.join(pkg, 'node_modules', '@typescript', 'typescript6');
  fs.mkdirSync(ts6, {recursive: true});
  fs.writeFileSync(
    path.join(ts6, 'package.json'),
    JSON.stringify({
      name: '@typescript/typescript6',
      version: '6.0.2',
      main: 'index.js',
    }),
  );
  fs.writeFileSync(
    path.join(ts6, 'index.js'),
    `module.exports = require(${JSON.stringify(TYPESCRIPT_DIR)});\n`,
  );
}

/**
 * Write `components/<name>.tsx` and its doc; returns its prop table, which
 * also carries the component record (name, docPath, sourcePath).
 * @param {string} name
 * @param {string} source
 * @param {Record<string, any>} doc
 */
function component(name, source, doc) {
  const dir = path.join(pkg, 'components');
  fs.mkdirSync(dir, {recursive: true});
  const sourcePath = path.join(dir, `${name}.tsx`);
  const docPath = path.join(dir, `${name}.doc.mjs`);
  fs.writeFileSync(sourcePath, source);
  fs.writeFileSync(
    docPath,
    `export default ${JSON.stringify({
      type: 'component',
      name,
      displayName: name,
      description: 'Fixture.',
      ...doc,
    })};\n`,
  );
  return {
    name,
    docPath,
    sourcePath,
    doc: `components/${name}.doc.mjs`,
    props: doc.props ?? [],
    sources: [sourcePath],
  };
}

/**
 * @param {string} name
 * @param {string} type
 * @param {Record<string, unknown>} [extra]
 */
const prop = (name, type, extra = {}) => ({
  name,
  type,
  description: 'Fixture prop.',
  ...extra,
});

/** @param {import('./prop-drift.mjs').PropDriftTable[]} tables */
function compare(tables) {
  return comparePropTables(tables, {packageDir: pkg, resolveFrom: [pkg]});
}

/** @param {{findings: Array<{component: string, prop: string, kind: string}>}} report */
const kinds = report =>
  report.findings.map(f => `${f.component}.${f.prop} ${f.kind}`);

describe('comparePropTables', () => {
  it('judges the type of a prop a mapped type of the package builds, and says why one another package builds is not judged', async () => {
    withTypeScript();
    const sizes = path.join(pkg, 'node_modules', '@acme', 'sizes');
    fs.mkdirSync(sizes, {recursive: true});
    fs.writeFileSync(
      path.join(sizes, 'package.json'),
      JSON.stringify({name: '@acme/sizes', types: 'index.d.ts'}),
    );
    fs.writeFileSync(
      path.join(sizes, 'index.d.ts'),
      "export type Sizes = Partial<Record<'sm' | 'md', string>>;\n",
    );
    const tables = [
      component(
        'Mapped',
        "export function Mapped(props: Partial<Record<'a' | 'b', 'x' | 'y'>>) { return null; }",
        {props: [prop('a', "'x' | 'z'"), prop('b', "'x' | 'y'")]},
      ),
      component(
        'HandledCell',
        "import type {Sizes} from '@acme/sizes';\nexport function HandledCell(props: Sizes) { return null; }",
        {props: [prop('sm', 'number')]},
      ),
      // Keys the check can't trace, and a doc type that does not parse; and
      // a name that starts with another's sorts after it.
      component(
        'Handled',
        "type A = string;\nexport function Handled(props: {[K in `on${'Open' | 'Close'}`]?: () => void} & {items?: ((items: A[]) => A)[]}) { return null; }",
        {props: [prop('onOpen', '() => A'), prop('items', '((A[]) => A)[]')]},
      ),
    ];

    const report = await compare(tables);

    expect(kinds(report)).toEqual(['Mapped.a type_mismatch']);
    expect(report.typesNotCompared).toEqual(
      [
        ['Handled', 'not a form the check judges exactly', ['items', 'onOpen']],
        ['HandledCell', 'declared outside the package, not compared', ['sm']],
      ].map(([component, reason, props]) => ({
        component,
        doc: `components/${component}.doc.mjs`,
        reason,
        props,
      })),
    );
  });

  it('judges no prop type, and says why, with a TypeScript older than 4.8', async () => {
    const dir = path.join(pkg, 'node_modules', 'typescript');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'package.json'), '{"version": "4.7.4"}');
    const real = JSON.stringify(TYPESCRIPT_DIR);
    fs.writeFileSync(
      path.join(dir, 'index.js'),
      `module.exports = {...require(${real}), version: '4.7.4'};`,
    );
    const source = 'export function Badge(p: {size?: string}) { return null; }';
    const doc = {props: [prop('size', 'number')]};

    expect(await compare([component('Badge', source, doc)])).toMatchObject({
      findings: [],
      typesCompared: 0,
      typesSkipped:
        'TypeScript 4.7.4 is older than 4.8, the oldest the type comparison reads; install TypeScript 5.0 through 6 (`npm install -D typescript@6`), or on TypeScript 7 add `@typescript/typescript6`, to judge them',
    });
  });

  it("judges a prop a package's mapping rewrites by its type, and keeps the text of one a mapping copies", async () => {
    withTypeScript();
    const types = `interface Base { size: 'sm' | 'md' }
interface Opt { tone?: 'info' | undefined }
type Many<T> = {[K in keyof T]: T[K][]};
type Nullable<T> = {[K in keyof T]: T[K] | null};
interface Pickable<T = string> { pick?: (value: T) => void }
type ChooserProps<T extends string = string> = {pick?: string} & {
  change?: (value: readonly T[]) => void | Promise<void>;
};
interface ListProps<T> { value?: T; onChange?: (v: T) => void }
type MultiProps<T> = ListProps<T[]>;
import type {Item as Imported} from './item';
import type * as NS from './item';
interface Item { a: string }
interface ItemList<Item> { items?: Item[] }`;
    const size = {props: [prop('size', "'sm' | 'md'", {required: true})]};
    const pick = {props: [prop('pick', '(value: T) => void')]};
    const tables = [
      ['Many', 'Many<Base>', size],
      ['Nulls', 'Nullable<Base>', size],
      ['Picked', "Pick<Base, 'size'>", size],
      [
        'Strict',
        'Required<Opt>',
        {props: [prop('tone', "'info' | undefined", {required: true})]},
      ],
      // A generic component's prop keeps its declaration's text; one a
      // concrete type instantiates does not.
      ['Boxed', 'Pickable<number>', pick],
      [
        'Chooser',
        'ChooserProps<T>',
        {
          props: [
            prop('pick', 'string'),
            prop('change', '(value: readonly T[]) => void | Promise<void>'),
          ],
        },
        '<T extends string = string>',
      ],
      // Instantiated with a type built from the component's own parameter,
      // the declaration's `T` is no longer the prop's type.
      // A type argument that prints with the parameter's name elsewhere is
      // still another type here.
      ['Renamed', 'ItemList<Imported>', {props: [prop('items', 'Item[]')]}],
      ['Spaced', 'ItemList<NS.Item>', {props: [prop('items', 'Item[]')]}],
      ['Owned', 'ItemList<Item>', {props: [prop('items', 'Item[]')]}],
      ...[
        ['Listed', 'ListProps<T[]>', 'T', '(v: T) => void'],
        ['Maybe', 'ListProps<T | null>', 'T', '(v: T) => void'],
        ['Multi', 'MultiProps<T>', 'T[]', '(v: T[]) => void'],
      ].map(([name, props, value, onChange]) => [
        name,
        props,
        {props: [prop('value', value), prop('onChange', onChange)]},
        '<T>',
      ]),
    ].map(([name, props, doc, generics = '']) =>
      component(
        name,
        `${types}\nexport function ${name}${generics}(props: ${props}) { return null; }`,
        doc,
      ),
    );

    fs.writeFileSync(
      path.join(pkg, 'components', 'item.ts'),
      'export interface Item { b: number }\n',
    );
    const report = await compare(tables);

    expect(kinds(report)).toEqual([
      'Many.size type_mismatch',
      'Nulls.size type_mismatch',
      'Strict.tone type_mismatch',
    ]);
    // A message shows the type the mapping makes, not the source's text.
    expect(report.findings.map(f => f.codeType)).toEqual([
      "('sm' | 'md')[]",
      "'sm' | 'md' | null",
      "'info'",
    ]);
    expect(report.typesNotCompared).toEqual(
      [
        ['Boxed', ['pick']],
        ['Listed', ['onChange', 'value']],
        ['Maybe', ['onChange', 'value']],
        ['Renamed', ['items']],
        ['Spaced', ['items']],
      ].map(([component, props]) => ({
        component,
        doc: `components/${component}.doc.mjs`,
        reason: 'not a form the check judges exactly',
        props,
      })),
    );
  });

  it("reports a prop missing from the code, one missing from the doc, a wrong required flag, and a wrong type, each component's together", async () => {
    withTypeScript();
    const badge = component(
      'Badge',
      `export type Tone = 'neutral' | 'info' | 'danger';
export interface BadgeProps {
  label: string;
  tone?: Tone;
  count?: number;
}
export function Badge(props: BadgeProps) { return null; }`,
      {
        props: [
          prop('label', 'string'),
          prop('tone', "'neutral' | 'info'"),
          prop('size', "'sm' | 'md'"),
        ],
      },
    );
    // A name that starts with another's sorts after all of the other's.
    const count = component(
      'BadgeCount',
      'export function BadgeCount(props: {amount?: number}) { return null; }',
      {props: []},
    );

    const report = await compare([count, badge]);

    expect(report.status).toBe('checked');
    expect(report.typescript).toMatch(/^\d+\.\d+/);
    expect(report.components).toBe(2);
    expect(kinds(report)).toEqual([
      'Badge.count not_in_doc',
      'Badge.label required_mismatch',
      'Badge.size not_in_code',
      'Badge.tone type_mismatch',
      'BadgeCount.amount not_in_doc',
    ]);
    expect(report.findings.every(f => f.severity === 'warning')).toBe(true);
    expect(report.findings.find(f => f.kind === 'type_mismatch')).toMatchObject(
      {
        docType: "'neutral' | 'info'",
        codeType: 'Tone',
        doc: 'components/Badge.doc.mjs',
        source: 'components/Badge.tsx',
        message: expect.stringContaining(
          "Tone ('neutral' | 'info' | 'danger')",
        ),
      },
    );
    expect(
      report.findings.find(f => f.kind === 'required_mismatch'),
    ).toMatchObject({docRequired: false, codeRequired: true});
  });

  it('compares a documented default with a literal default in the props destructuring, quotes and whitespace aside, and skips any other default', async () => {
    withTypeScript();
    const widget = component(
      'Widget',
      `const SIZE = 'md';
export interface WidgetProps { size?: 'sm' | 'md'; tone?: string; count?: number; open?: boolean; label?: string; gap?: number; mode?: string }
export function Widget({size = 'md', tone = "info", count = -2, open = false, label = SIZE, gap = 4, mode}: WidgetProps) { return null; }`,
      {
        props: [
          prop('size', "'sm' | 'md'", {default: "'sm'"}),
          prop('tone', 'string', {default: ' "info" '}),
          prop('count', 'number', {default: '-2'}),
          prop('open', 'boolean', {default: 'true'}),
          prop('label', 'string', {default: "'x'"}),
          prop('gap', 'number', {default: 'the theme gap'}),
          prop('mode', 'string', {default: "'a'"}),
        ],
      },
    );
    const forwarded = component(
      'Forwarded',
      `declare function forwardRef<T>(render: T): T;
export const Forwarded = forwardRef(function Forwarded({variant = 'solid'}: {variant?: string}) { return null; });`,
      {props: [prop('variant', 'string', {default: "'ghost'"})]},
    );

    const report = await compare([widget, forwarded]);

    expect(kinds(report)).toEqual([
      'Forwarded.variant default_mismatch',
      'Widget.open default_mismatch',
      'Widget.size default_mismatch',
    ]);
    // A default that is not a literal on either side is listed, not skipped.
    expect(report.typesNotCompared).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          component: 'Widget',
          reason: expect.stringContaining(
            'default in the code is not a literal',
          ),
          props: ['label'],
        }),
        expect.objectContaining({
          component: 'Widget',
          reason: expect.stringContaining(
            'documented default is not a literal',
          ),
          props: ['gap'],
        }),
      ]),
    );
    expect(report.typesNotCompared.flatMap(entry => entry.props)).not.toContain(
      'mode',
    );
    expect(report.findings.find(f => f.prop === 'size')).toMatchObject({
      severity: 'warning',
      message:
        "\"size\" is documented with default 'sm', but the code defaults it to 'md'.",
      fix: 'In components/Widget.doc.mjs, set the "size" prop\'s default to the code\'s: default: "\'md\'".',
      docDefault: "'sm'",
      codeDefault: "'md'",
    });
  });

  it("judges a field, a name an index signature takes, and a prop declared in another file by the type's name where the prop is declared, not by the name the type was declared with", async () => {
    withTypeScript();
    const dir = path.join(pkg, 'components');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(
      path.join(dir, 'base.ts'),
      "export interface Item { id: string }\nexport type Size = 'sm' | 'md';\n",
    );
    // Another file imports the same types under other names, and declares
    // its own `Item` and `Size`.
    fs.writeFileSync(
      path.join(dir, 'types.ts'),
      [
        "import type {Item as BaseItem, Size as BaseSize} from './base';",
        'interface Item { label: string }',
        "type Size = 'lg';",
        'export type ElsewhereProps = { size?: BaseSize; item?: BaseItem; onPick?: (item: BaseItem) => void; cfg?: {item: BaseItem}; [key: `size-${string}`]: BaseSize | undefined } & Required<Partial<{tone: BaseSize; entry: BaseItem}>>;',
      ].join('\n'),
    );
    const here = component(
      'Renamed',
      [
        "import type {Item as BaseItem, Size as BaseSize} from './base';",
        'interface Item { label: string }',
        "type Size = 'lg';",
        'export function Renamed(props: {cfg?: {item: BaseItem}; [key: `size-${string}`]: BaseSize | undefined}) { return null; }',
      ].join('\n'),
      {props: [prop('cfg.item', 'Item'), prop('size-a', 'Size')]},
    );
    const elsewhere = component(
      'Elsewhere',
      "import type {ElsewhereProps} from './types';\nexport function Elsewhere(props: ElsewhereProps) { return null; }",
      {
        props: [
          prop('size', 'Size'),
          prop('tone', 'Size', {required: true}),
          prop('entry', 'Item', {required: true}),
          prop('item', 'Item'),
          prop('onPick', '(item: Item) => void'),
          prop('cfg.item', 'Item'),
          prop('size-a', 'Size'),
        ],
      },
    );
    // The same docs, naming the types as each file does, are judged matches.
    const named = component(
      'Named',
      [
        "import type {Item as BaseItem, Size as BaseSize} from './base';",
        'export function Named(props: {cfg?: {item: BaseItem}; [key: `size-${string}`]: BaseSize | undefined}) { return null; }',
      ].join('\n'),
      {props: [prop('cfg.item', 'BaseItem'), prop('size-a', 'BaseSize')]},
    );

    const report = await compare([here, elsewhere, named]);

    // `Size` is `'lg'` where each prop is declared, which TypeScript rejects
    // for `'sm' | 'md'`; `Item` is an object type there, not compared.
    expect(kinds(report)).toEqual([
      'Elsewhere.size type_mismatch',
      'Elsewhere.size-a type_mismatch',
      'Elsewhere.tone type_mismatch',
      'Renamed.size-a type_mismatch',
    ]);
    expect(report.typesNotCompared).toEqual([
      expect.objectContaining({
        component: 'Elsewhere',
        props: ['cfg.item', 'entry', 'item', 'onPick'],
      }),
      expect.objectContaining({component: 'Renamed', props: ['cfg.item']}),
    ]);
    expect(report.typesCompared).toBe(6);
  });

  it("reads `React.X` as React's own where the prop is declared, never as a bare name that means another type there", async () => {
    withTypeScript();
    fs.mkdirSync(path.join(pkg, 'node_modules', '@types'), {recursive: true});
    fs.symlinkSync(
      path.dirname(require.resolve('@types/react/package.json')),
      path.join(pkg, 'node_modules', '@types', 'react'),
      'dir',
    );
    const keys = component(
      'Keys',
      [
        "import * as React from 'react';",
        "type Key = 'a' | 'b';",
        'export function Keys(props: {onKey?: (event: KeyboardEvent) => void; rowKey?: string | number | bigint; pick?: Key; native?: React.Key}) { return null; }',
      ].join('\n'),
      {
        props: [
          prop('onKey', '(event: React.KeyboardEvent) => void'),
          prop('rowKey', 'React.Key'),
          prop('pick', 'React.Key'),
          prop('native', 'React.Key'),
        ],
      },
    );
    // React's global namespace, with no import.
    const global = component(
      'GlobalKeys',
      'export function GlobalKeys(props: {rowKey?: string | number | bigint}) { return null; }',
      {props: [prop('rowKey', 'React.Key')]},
    );

    const report = await compare([keys, global]);

    // The DOM's `KeyboardEvent` is not React's, and the file's own `Key` is
    // not `React.Key`.
    expect(kinds(report)).toEqual(['Keys.pick type_mismatch']);
    expect(report.typesNotCompared).toEqual([
      expect.objectContaining({component: 'Keys', props: ['onKey']}),
    ]);
    expect(report.typesCompared).toBe(4);
  });

  it('judges primitives, literals, arrays, string enums, and names for them exactly, in any order', async () => {
    withTypeScript();
    const card = component(
      'Card',
      [
        "type Tone = 'neutral' | 'info';",
        "export enum Color { Red = 'red', Blue = 'blue' } export enum Hue { Red = 'red', Blue = 'blue' }",
        'export interface CardProps {',
        '  label: string;',
        '  tone?: Tone;',
        '  items?: ReadonlyArray<string>;',
        '  isOpen?: boolean;',
        "  size?: 'sm' | 'md' | number;",
        '  color?: Color;',
        '  count?: number;',
        '  ids?: string[];',
        '  hue?: Color;',
        "  shade?: Color; shades?: Color[]; pick?: 'red' | 'blue';",
        '}',
        'export function Card(props: CardProps) { return null; }',
      ].join('\n'),
      {
        props: [
          prop('label', 'string', {required: true}),
          prop('tone', '\'info\' | "neutral"'),
          prop('items', 'Array<string>'),
          prop('isOpen', 'true | false'),
          prop('size', "number | 'md' | 'sm'"),
          prop('color', 'Color'),
          prop('count', 'string'),
          prop('ids', 'number[]'),
          prop('hue', "'red' | 'blue'"),
          prop('shade', 'Hue'),
          prop('shades', 'Hue[]'),
          prop('pick', 'Color'),
        ],
      },
    );

    const report = await compare([card]);

    // TypeScript takes neither `'red'` nor another enum's `Hue.Red` where the
    // enum `Color` is expected, and `Color` does not take the `'red'` `pick` does.
    expect(kinds(report)).toEqual([
      'Card.count type_mismatch',
      'Card.hue type_mismatch',
      'Card.ids type_mismatch',
      'Card.pick type_mismatch',
      'Card.shade type_mismatch',
      'Card.shades type_mismatch',
    ]);
    expect(report.typesCompared).toBe(12);
    expect(report.typesNotCompared).toEqual([]);
  });

  it('reads a union the way TypeScript reduces it, and a default after `=` as no alias', async () => {
    withTypeScript();
    const icon = component(
      'Icon',
      [
        "type IconName = 'add' | 'close';",
        "export enum Color { Red = 'red', Blue = 'blue' }",
        'type Step = 1 | 2;',
        "type Size = 'sm' | 'md' | 'lg';",
        'export interface IconProps {',
        '  icon?: IconName | string;',
        '  color?: Color | string;',
        '  step?: Step | number;',
        '  isOpen?: boolean;',
        '  icons?: string[];',
        '  size?: Size;',
        '  limit?: 1000 | 2000;',
        '  width?: number | string;',
        '}',
        'export function Icon(props: IconProps) { return null; }',
      ].join('\n'),
      {
        props: [
          prop('icon', 'IconName | string'),
          prop('color', 'Color | string'),
          prop('step', 'Step | number'),
          prop('isOpen', 'boolean = false'),
          prop('icons', '(IconName | string)[]'),
          prop('size', "Size = 'md'"),
          prop('limit', '1_000 | 2_000'),
          prop('width', 'number (or a CSS length)'),
        ],
      },
    );

    const report = await compare([icon]);

    expect(report.findings).toEqual([]);
    expect(report.typesCompared).toBe(7);
  });

  it('sets aside null and undefined when the project has no strict null checks', async () => {
    withTypeScript();
    fs.writeFileSync(
      path.join(pkg, 'tsconfig.json'),
      JSON.stringify({compilerOptions: {strict: false, jsx: 'react-jsx'}}),
    );
    const loose = component(
      'Loose',
      [
        'type MaybeNum = number | null;',
        'export function Loose(props: {count?: MaybeNum; counts?: MaybeNum[]}) { return null; }',
      ].join('\n'),
      {
        props: [
          prop('count', 'number | null'),
          prop('counts', '(number | null)[]'),
        ],
      },
    );

    const report = await compare([loose]);

    expect(report.findings).toEqual([]);
    expect(report.typesCompared).toBe(2);
  });

  it('respects exactOptionalPropertyTypes: an optional prop takes undefined only when its type says so', async () => {
    withTypeScript();
    const tsconfig = path.join(pkg, 'tsconfig.json');
    const config = JSON.parse(fs.readFileSync(tsconfig, 'utf8'));
    config.compilerOptions.exactOptionalPropertyTypes = true;
    fs.writeFileSync(tsconfig, JSON.stringify(config));
    const exact = component(
      'Exact',
      "type MaybeTone = 'a' | 'b' | 'c' | undefined;\nexport function Exact(props: {size?: 'sm' | 'md'; tone?: 'a' | undefined; mode?: 'x'; status?: {tone?: 'a' | 'b' | undefined; mode?: 'x'}; labels?: Record<string, string | undefined>; hue?: 'a' | 'b' | undefined; t6?: MaybeTone; [key: `x${string}`]: string | undefined}) { return null; }\n",
      {
        props: [
          prop('size', "'sm' | 'md' | undefined"),
          prop('tone', "'a' | undefined"),
          prop('mode', "'x'"),
          prop('status.tone', "'a' | 'b'"),
          prop('status.mode', "'x'"),
          prop('labels.close', 'string'),
          prop('xTone', 'string'),
          prop('hue', "'a' | 'b'"),
          prop('t6', "'a' | 'b' | 'c'"),
        ],
      },
    );
    const variant = component(
      'Variant',
      "export function Variant(props: {kind: 'a'; size?: 'sm' | undefined} | {kind: 'b'; size?: 'md' | undefined}) { return null; }\n",
      {
        props: [
          prop('kind', "'a' | 'b'", {required: true}),
          prop('size', "'sm' | 'md'"),
        ],
      },
    );

    const report = await compare([exact, variant]);

    // TypeScript rejects `size={undefined}` here, and takes the others; a
    // field that declares `undefined` takes it too, unlike its doc. A name an
    // index signature takes is held to the index's type the same way as a
    // field or as a prop.
    expect(kinds(report)).toEqual([
      'Exact.hue type_mismatch',
      'Exact.size type_mismatch',
      'Exact.status.tone type_mismatch',
      'Exact.t6 type_mismatch',
      'Variant.size type_mismatch',
    ]);
    expect(report.typesCompared).toBe(11);
    // The message shows the `undefined` the code declares, written once or by
    // each member of a union, in the type and in its expansion.
    for (const finding of report.findings.filter(
      f => f.component === 'Variant' || f.prop === 'hue',
    )) {
      expect(finding.codeType).toMatch(/undefined/);
      const declared = finding.message.split('but the code declares ')[1];
      expect(declared).toMatch(/undefined/);
      expect(declared.match(/\((.*)\)\.$/)?.[1] ?? 'undefined').toMatch(
        /undefined/,
      );
    }
    // Through an alias, the expansion shows it.
    expect(report.findings.find(f => f.prop === 't6')?.message).toMatch(
      /declares MaybeTone \(.*undefined.*\)\.$/,
    );
  });

  it('holds a name an index signature takes, a field a Record takes, and a readonly array to the type TypeScript checks, and lists a field only an index takes and an `a / b` entry whose one type does not split', async () => {
    withTypeScript();
    const held = component(
      'Held',
      [
        'export function Held(props: {',
        '  labels?: Record<string, string>;',
        '  tags?: string[];',
        '  ids?: ReadonlyArray<string>;',
        '  keys?: readonly string[];',
        '  grid?: readonly string[][];',
        '  rows?: (readonly string[])[];',
        '  onPick?: (values: readonly string[]) => void;',
        '  onDrop?: (values: readonly string[]) => void;',
        '  pinned?: {readonly ids: readonly string[]};',
        '  item?: {tags: readonly string[]};',
        '  mix?: string[] | readonly number[];',
        '  min?: number; max?: number; status?: {a: number};',
        '  [key: `x${string}`]: string; [key: `y${string}`]: {color: string};',
        '}) { return null; }',
      ].join('\n'),
      {
        props: [
          prop('labels.close', 'string | undefined'),
          prop('xTone', 'string | undefined'),
          prop('tags', 'readonly string[]'),
          prop('ids', 'readonly string[]'),
          prop('keys', 'string[]'),
          prop('grid', '(readonly string[])[]'),
          prop('rows', 'readonly string[][]'),
          prop('onPick', '(values: string[]) => void'),
          prop('onDrop', '(values:  readonly string[])=>void'),
          prop('pinned', '{readonly ids: readonly string[]}'),
          prop('item', '{tags: string[]}'),
          prop('mix', 'readonly string[] | number[]'),
          prop('min / max', 'number'),
          prop('status.a / status.b', 'number'),
          prop('yTone.color', 'string'),
        ],
      },
    );

    const report = await compare([held]);

    // TypeScript passes no `undefined` through an index that does not take
    // it, and no readonly array where a mutable one is taken; a mutable
    // array passes where a readonly one is.
    expect(kinds(report)).toEqual([
      'Held.labels.close type_mismatch',
      'Held.status.b not_in_code',
      'Held.tags type_mismatch',
      'Held.xTone type_mismatch',
    ]);
    expect(report.typesCompared).toBe(7);
    // `readonly` written as the code writes it matches; written somewhere
    // else, at another depth, in a callback's parameter, in an object's
    // field, or on another union member, it is not placed: listed, never a
    // match, as are a field only an index takes and `a / b` with one type.
    expect(
      report.typesNotCompared.map(e => `${e.reason}: ${e.props.join(' ')}`),
    ).toEqual([
      'not a form the check judges exactly: grid item max min mix onPick rows status.a yTone.color',
    ]);
  });

  it('reads strict null checks as the TypeScript version defaults them', async () => {
    withTypeScript();
    fs.writeFileSync(
      path.join(pkg, 'tsconfig.json'),
      JSON.stringify({compilerOptions: {jsx: 'react-jsx'}}),
    );
    // The TypeScript the test links in: 6 checks strict null by default.
    const ts = require(TYPESCRIPT_DIR);
    const strictByDefault = ts.getStrictOptionValue({}, 'strictNullChecks');
    const maybe = component(
      'Maybe',
      'export function Maybe(props: {count?: number | null}) { return null; }\n',
      {props: [prop('count', 'number')]},
    );

    const report = await compare([maybe]);

    expect(kinds(report)).toEqual(
      strictByDefault ? ['Maybe.count type_mismatch'] : [],
    );
  });

  it("lists a name two index signatures take and a field documented with one variant's type, and reads a default for one union member", async () => {
    withTypeScript();
    const pick = component(
      'Pick',
      [
        "export enum SizeE { Sm = 'sm', Md = 'md' }",
        'type Sel = {kind: "single"; value: string} | {kind: "multi"; value: string[]};',
        'export type PickProps = {',
        '  sizeE?: SizeE;',
        '  sel?: Sel;',
        '  tri?: {v: string} | {v: number} | {v: boolean};',
        '  sev?: {v: 1} | {v: 2} | {v: 3} | {v: 4} | {v: 5} | {v: 6} | {v: 7};',
        '  labels?: {close: string} | Record<string, number>;',
        '  [key: `data-${string}`]: string | number | undefined;',
        '  [key: `data-track${string}`]: string | undefined;',
        '} & ({mode: "str"; [key: `x${string}`]: string} | {mode: "num"; [key: `x${string}`]: number});',
        'export function Pick(props: PickProps) { return null; }',
      ].join('\n'),
      {
        props: [
          prop('sizeE', 'SizeE = SizeE.Md'),
          prop('sel.value', 'string'),
          prop('tri.v', 'string | number'),
          prop('sev.v', '1 | 2'),
          prop('labels.close', 'string | number'),
          prop('data-tracker', 'string'),
          prop('mode', "'str' | 'num'", {required: true}),
          prop('xValue', 'number'),
        ],
      },
    );

    const report = await compare([pick]);

    // TypeScript holds `data-tracker` to both signatures that take it, and
    // `xValue` to the one of the member it is passed with; `sel.value`,
    // `tri.v` and `sev.v` (past six variants, never reported) take every
    // variant's type, and `labels.close` is documented with both.
    expect(report.findings).toEqual([]);
    expect(report.typesNotCompared).toEqual([
      expect.objectContaining({
        props: ['data-tracker', 'xValue'],
        reason: 'not a form the check judges exactly',
      }),
      expect.objectContaining({
        props: ['sel.value', 'sev.v', 'tri.v'],
        reason: "the prop's variants give this field different types",
      }),
    ]);
    expect(report.typesCompared).toBe(3);
  });

  it('reads fields in arrays of unions, a name one member indexes, and names only where the code can mean them', async () => {
    withTypeScript();
    const rows = component(
      'Rows',
      [
        'type Items = number[];',
        'export type RowsProps = {',
        "  items?: Array<{kind: 'a'; value: string} | {kind: 'b'; value: number}>;",
        '  list?: Items;',
        "  behavior?: 'auto' | 'smooth';",
        '  [key: `data-${string}`]: string | undefined;',
        "} & ({mode: 'fixed'; xSize: number} | ({mode: 'free'} & {[k: `x${string}`]: string}));",
        'export function Rows(props: RowsProps) { return null; }',
      ].join('\n'),
      {
        props: [
          prop('items[].value', 'string | number'),
          prop('list', 'Items = string[]'),
          prop('behavior', 'ScrollBehavior'),
          prop('data-section', 'string'),
          prop('mode', "'fixed' | 'free'", {required: true}),
          prop('xSize', 'number | string'),
        ],
      },
    );

    const report = await compare([rows]);

    // `ScrollBehavior` is the DOM's, which the code never names.
    expect(kinds(report)).toEqual(['Rows.list type_mismatch']);
    expect(report.typesNotCompared).toEqual([
      expect.objectContaining({props: ['behavior']}),
    ]);
  });

  it('judges a prop two intersected types declare by the type they narrow it to, and undefined on a required prop', async () => {
    withTypeScript();
    const narrow = component(
      'Narrow',
      [
        "type A = {size?: 'sm'; tone?: 'a' | 'b'};",
        "type B = {size?: 'sm' | 'md'; tone?: 'a' | 'b'};",
        'export type NarrowProps = B & A & {isOpen: boolean; label: string | undefined};',
        'export function Narrow(props: NarrowProps) { return null; }',
      ].join('\n'),
      {
        props: [
          prop('size', "'sm' | 'md'"),
          prop('tone', "'b' | 'a'"),
          prop('isOpen', 'boolean | undefined', {required: true}),
          prop('label', 'string', {required: true}),
        ],
      },
    );

    const report = await compare([narrow]);

    // TypeScript takes only 'sm' for `size`, rejects `isOpen={undefined}`,
    // and accepts `label={undefined}`.
    expect(kinds(report)).toEqual([
      'Narrow.isOpen type_mismatch',
      'Narrow.label type_mismatch',
      'Narrow.size type_mismatch',
    ]);
    expect(report.findings.find(f => f.prop === 'size')?.codeType).toBe("'sm'");
  });

  it('lists every other form of type as not compared, never as a mismatch', async () => {
    withTypeScript();
    const thread = component(
      'Thread',
      [
        'interface IconShape { path: string }',
        'type MaybePromise<T> = T | Promise<T>;',
        'type Parts = {a?: string; b?: number};',
        "type A = {a: string}; type B = {b: number}; enum Color { Red = 'red' } namespace Theme { export enum Color { Red = 'red' } }",
        'export interface ThreadProps {',
        '  onSubmit?: (text: string, files?: File[]) => MaybePromise<void>;',
        '  onPick?: (value: string, index: number) => void;',
        '  item?: A & B;',
        '  parts?: Partial<Parts>;',
        '  key2?: keyof (A & B);',
        '  key3?: keyof (A & B);',
        "  target?: '_self' | '_blank' | (string & {});",
        '  range?: [number, number?];',
        '  labels?: Record<string, string>;',
        '  icon?: IconShape;',
        '  data?: any;',
        '  extra?: unknown; tint?: Theme.Color;',
        '}',
        'export function Thread(props: ThreadProps) { return null; }',
      ].join('\n'),
      {
        props: [
          prop('onSubmit', '(text: string) => Promise<number>'),
          prop('onPick', '(value: string, index: number) => void'),
          prop('item', '{a: string; b: number}'),
          prop('parts', 'Parts'),
          prop('key2', 'keyof (A & B)'),
          prop('key3', "'a' | 'b'"),
          prop('target', "'_self' | '_blank'"),
          prop('range', '[number]'),
          prop('labels', '{[key: string]: number}'),
          prop('icon', 'IconName'),
          prop('data', 'string'),
          prop('data.id', 'string'),
          prop('extra.kind', 'string'),
          prop('tint', 'Color'),
        ],
      },
    );

    const report = await compare([thread]);

    expect(report.findings).toEqual([]);
    // Written exactly as the source writes them, or a literal union the
    // code's type resolves to (`keyof (A & B)` is `'a' | 'b'`).
    expect(report.typesCompared).toBe(3);
    expect(
      report.typesNotCompared.map(e => `${e.reason}: ${e.props.join(' ')}`),
    ).toEqual([
      'not a form the check judges exactly: data data.id extra.kind icon item labels onSubmit parts range target tint',
    ]);
  });

  it("compares a documented field's type, and a name an index signature takes, with the type the code gives it", async () => {
    withTypeScript();
    const note = component(
      'Note',
      [
        'export interface NoteProps {',
        "  status?: {type: 'error' | 'warning'; message?: string};",
        '  items?: Array<{id: string; label: string}>;',
        '  labels?: Record<string, string>;',
        '  [key: `data-${string}`]: string | undefined;',
        '  [key: `aria-${string}`]: string | number | undefined;',
        '}',
        'export function Note(props: NoteProps) { return null; }',
      ].join('\n'),
      {
        props: [
          prop('status.type', "'error' | 'info'"),
          prop('items[].label', 'number'),
          prop('labels.open', 'string'),
          prop('labels.close', 'number'),
          prop('data-section', 'string'),
          prop('data-count', 'number'),
          prop('aria-busy', 'boolean'),
        ],
      },
    );

    const report = await compare([note]);

    expect(kinds(report)).toEqual([
      'Note.aria-busy type_mismatch',
      'Note.data-count type_mismatch',
      'Note.items[].label type_mismatch',
      'Note.labels.close type_mismatch',
      'Note.status.type type_mismatch',
    ]);
    expect(report.typesCompared).toBe(7);
  });

  it('accepts an alias spelled out beside its name, and reports one whose spelled-out values are stale', async () => {
    withTypeScript();
    const links = ["'link' | 'token'", "'link' | 'token' | 'button'"].map(
      (values, i) =>
        component(
          `Link${i}`,
          `export type LinkVariant = ${values};\nexport function Link${i}(props: {variant?: LinkVariant; tone?: LinkVariant}) { return null; }`,
          {
            props: [
              prop('variant', "LinkVariant = 'link' | 'token'"),
              prop('tone', "LinkVariant ('link' | 'token')"),
            ],
          },
        ),
    );

    expect(kinds(await compare(links))).toEqual([
      'Link1.tone type_mismatch',
      'Link1.variant type_mismatch',
    ]);
  });

  it("reads an optional prop documented with `| undefined` as the code reads it, and names an alias's members in the source's order", async () => {
    withTypeScript();
    const badge = component(
      'Badge',
      [
        "type Tone = 'neutral' | 'info';",
        'export function Badge(props: {tone?: Tone}) { return null; }',
      ].join('\n'),
      {props: [prop('tone', "'neutral' | 'info' | undefined")]},
    );
    const chip = component(
      'Chip',
      "export function Chip(props: {tone?: 'a' | 'b' | undefined}) { return null; }\n",
      {props: [prop('tone', "'a' | 'c'")]},
    );

    // The same literals, made first in another order, would set the
    // compiler's own order.
    const status = component(
      'Status',
      [
        "type Other = 'detached' | 'attached' | 'tooltip';",
        'export type Unrelated = Other;',
        "type StatusVariant = 'tooltip' | 'attached' | 'detached';",
        'export function Status(props: {variant?: StatusVariant}) { return null; }',
      ].join('\n'),
      {props: [prop('variant', "'attached' | 'detached'")]},
    );

    expect(kinds(await compare([badge]))).toEqual([]);
    // The optional prop's `undefined` the expansion sets aside is shown once.
    const [finding] = (await compare([chip])).findings;
    expect(finding.message).toMatch(/declares 'a' \| 'b' \| undefined\.$/);
    expect((await compare([status])).findings.map(f => f.message)).toEqual([
      `"variant" is documented as 'attached' | 'detached', but the code declares StatusVariant ('tooltip' | 'attached' | 'detached').`,
    ]);
  });

  it('judges a className the package declares, and lists standard props and props from other packages as not compared', async () => {
    withTypeScript();
    const base = path.join(pkg, 'node_modules', '@acme', 'base');
    fs.mkdirSync(base, {recursive: true});
    fs.writeFileSync(
      path.join(base, 'package.json'),
      JSON.stringify({name: '@acme/base', types: 'index.d.ts'}),
    );
    fs.writeFileSync(
      path.join(base, 'index.d.ts'),
      'export interface BaseProps { style?: object; id?: string; tone?: {level: number}; [key: `data-${string}`]: string | undefined }\n',
    );
    // A name only another package's index signature, or a mapped type's,
    // takes is not judged either.
    const card = component(
      'Card',
      "import type {BaseProps} from '@acme/base';\nexport function Card(props: BaseProps & {className?: string} & Record<`aria-${string}`, string>) { return null; }\n",
      {
        props: [
          prop('className', 'number'),
          prop('style', 'string'),
          prop('id', 'number'),
          prop('tone.level', 'string'),
          prop('tone.missing', 'string'),
          prop('data-variant', "'solid' | 'outline'"),
          prop('aria-note', 'number'),
        ],
      },
    );

    const report = await compare([card]);

    expect(kinds(report)).toEqual([
      'Card.className type_mismatch',
      'Card.tone.missing not_in_code',
    ]);
    expect(report.typesCompared).toBe(1);
    expect(
      report.typesNotCompared.map(e => `${e.reason}: ${e.props.join(' ')}`),
    ).toEqual([
      'declared outside the package, not compared: data-variant id tone.level',
      'not a form the check judges exactly: aria-note',
      'standard prop, not compared: style',
    ]);
  });

  it('does not ask a doc for props from other packages, or for the props the authoring guidance skips', async () => {
    expect(PROPS_NOT_DOCUMENTED).toEqual([
      'className',
      'style',
      'xstyle',
      'data-testid',
      'ref',
      'key',
    ]);
    withTypeScript();
    const base = path.join(pkg, 'node_modules', '@acme', 'base');
    fs.mkdirSync(base, {recursive: true});
    fs.writeFileSync(
      path.join(base, 'package.json'),
      JSON.stringify({name: '@acme/base', types: 'index.d.ts'}),
    );
    fs.writeFileSync(
      path.join(base, 'index.d.ts'),
      [
        'export interface BaseProps { id?: string; onBlur?: () => void }',
        "export type Sizes = Partial<Record<'sm' | 'md', string>>;",
        "export interface Spacing extends Partial<Record<'gap', number>> {}",
        "export type Tone = 'info' | 'danger';",
        'export type Flags<K extends string> = {[P in K]?: boolean};',
        'export type FC<P> = (props: P) => null;',
        "export type Responsive<T> = {[K in 'sm' | 'lg']?: T};",
        "export type Breakpoint = 'sm' | 'lg';",
        'export declare const BREAKPOINTS: readonly Breakpoint[];',
        'export declare function memo<T extends (p: any) => null>(c: T): {(p: Parameters<T>[0]): null; $$typeof: symbol; type: T};',
        'export declare function forwardRef<P>(render: (props: P, ref: unknown) => null): (props: P) => null;',
      ].join('\n'),
    );
    const panel = component(
      'Panel',
      [
        "import type {BaseProps} from '@acme/base';",
        'export interface PanelProps extends BaseProps {',
        '  title?: string;',
        '  className?: string;',
        '  style?: {color?: string};',
        '  xstyle?: unknown;',
        "  'data-testid'?: string;",
        '  ref?: unknown;',
        '  key?: string;',
        '  /** @deprecated Use `title`. */',
        '  heading?: string;',
        '  /** @internal */',
        '  debugName?: string;',
        '}',
        'export function Panel(props: PanelProps) { return null; }',
      ].join('\n'),
      {props: [prop('title', 'string'), prop('id', 'number')]},
    );

    // A prop a mapped type builds is the package's own when its key traces
    // to the package's source: through aliases, `Exclude`, a generic's
    // arguments, and a component `memo` or `forwardRef` wraps. A key another
    // package defines, behind an alias or not, is that package's, and one
    // the check can't trace is listed, not asked for.
    const mapped = Object.entries({
      Styled:
        '(props: {[K in StyleKey]?: BaseProps[K]} & Partial<Record<StyleKey, number>>)',
      Inlined: '(props: {[K in keyof BaseProps]?: BaseProps[K]})',
      Spread: '(props: Responsive<number>)',
      Memoed: ' = memo(Inner)',
      Forwarded: ' = forwardRef(Impl)',
      Excluded: "(props: {[K in Exclude<'a' | 'b' | 'c', 'c'>]?: string})",
      Templated: "(props: {[K in `on${Capitalize<'open'>}`]?: () => void})",
      // Another package's keys through an own interface's property, an
      // `infer`, or a constant bound to its value stay that package's.
      Indexed: "(props: {[K in Opts['size']]?: number})",
      Inferred: '(props: {[K in KeysOf<Record<Breakpoint, 1>>]?: number})',
      Rebound: '(props: {[K in (typeof SIZES)[number]]?: number})',
      Inline: "(props: {[K in 'a' | 'b']?: string})",
      Recorded: "(props: Partial<Record<'a' | 'b', string>>)",
      Remapped: "(props: {[K in 'open' as `on${Capitalize<K>}`]?: () => void})",
      Toned:
        "(props: Partial<Record<Tone | 'xl', boolean>> & {[K in Tone]?: string} & Partial<Record<keyof BaseProps, string>> & {[K in keyof BaseProps as `x${Capitalize<K>}`]?: boolean})",
      Flagged: "(props: Flags<'bold'>)",
      Extended: '(props: ExtendedProps)',
      Sized: '(props: Spaced & Partial<Sizes>)',
    }).map(([name, props]) =>
      component(
        name,
        [
          "import {type BaseProps, type Sizes, type Spacing, type Tone, type Flags, type FC, type Responsive, type Breakpoint, BREAKPOINTS, memo, forwardRef} from '@acme/base';",
          "interface ExtendedProps extends Partial<Record<'a', string>> {}",
          'interface Spaced extends Spacing {}',
          'type StyleKey = keyof BaseProps;',
          'interface Opts { size: Breakpoint }',
          'type KeysOf<T> = T extends Record<infer K, unknown> ? K : never;',
          'const SIZES = BREAKPOINTS;',
          "function Inner(props: {[K in 'top' | 'bottom']?: number}) { return null; }",
          "function Impl(props: Partial<Record<'left', number>>, ref: unknown) { return null; }",
          props.startsWith(' =')
            ? `export const ${name}${props};`
            : `export function ${name}${props} { return null; }`,
          `export const Typed: FC<Partial<Record<'a', string>>> = () => null;`,
        ].join('\n'),
        {props: []},
      ),
    );

    // A deprecated prop is still a prop the component accepts.
    const typed = {...mapped[0], name: 'Typed'};
    const report = await compare([panel, ...mapped, typed]);
    expect(kinds(report)).toEqual([
      'Excluded.a not_in_doc',
      'Excluded.b not_in_doc',
      'Extended.a not_in_doc',
      'Flagged.bold not_in_doc',
      'Forwarded.left not_in_doc',
      'Inline.a not_in_doc',
      'Inline.b not_in_doc',
      'Memoed.bottom not_in_doc',
      'Memoed.top not_in_doc',
      'Panel.heading not_in_doc',
      'Recorded.a not_in_doc',
      'Recorded.b not_in_doc',
      'Remapped.onOpen not_in_doc',
      'Toned.xl not_in_doc',
      'Typed.a not_in_doc',
    ]);
    expect(report.propsNotChecked).toEqual([
      expect.objectContaining({component: 'Templated', props: ['onOpen']}),
      expect.objectContaining({component: 'Inferred', props: ['lg', 'sm']}),
    ]);
    // The alias and the inline form give the same answer: nothing asked.
    for (const name of ['Styled', 'Inlined']) {
      expect(kinds(report).filter(kind => kind.startsWith(name))).toEqual([]);
    }
  });

  it('reads every overload, one without props included, matches a doc that describes one member of a discriminated union, reads a prop only some members require as optional, and holds every prop one entry names to its `required`', async () => {
    withTypeScript();
    const picker = component(
      'Picker',
      `type Single = {isMulti?: false; value: string; onChange: (value: string) => void};
type Multi = {isMulti: true; value: string[]; onChange: (value: string[]) => void};
export type PickerProps = (Single | Multi) & {label: string};
export function Picker(props: PickerProps) { return null; }`,
      {
        props: [
          prop('label', 'string', {required: true}),
          prop('isMulti', 'boolean'),
          prop('value', 'string', {required: true}),
          prop('onChange', '(value: string) => void', {required: true}),
        ],
      },
    );

    const select = component(
      'Select',
      `type Single = {multiple?: false; value?: string};
type Multi = {multiple: true; value?: string[]; max?: number};
export function Select(props: Single): null;
export function Select(props: Multi): null;
export function Select(props: Single | Multi) { return null; }`,
      {
        props: [
          prop('multiple', 'boolean'),
          prop('value', 'string | string[]'),
          prop('max', 'number'),
        ],
      },
    );
    // An overload that takes no props makes every prop optional; a typed
    // props type beside a `Record<string, any>` or a mapped `any` index is
    // compared as it is beside an inline `[key: string]: any`.
    const propless = component(
      'Propless',
      'export function Propless(): null;\nexport function Propless(props: {label: string}): null;\nexport function Propless(props?: {label: string}) { return null; }',
      {props: [prop('label', 'string', {required: true})]},
    );
    const open = [
      'Record<string, any>',
      'Record<`data-${string}`, any>',
      '{[K in string]?: any}',
    ].map((index, i) =>
      component(
        `Open${i}`,
        `export function Open${i}(props: {label?: string; size?: number} & ${index}) { return null; }`,
        {props: [prop('label', 'string')]},
      ),
    );

    // Required in one variant only: a caller may leave it out, so optional.
    const menu = component(
      'Menu',
      'export function Menu(props: {items: string[]} | {alt: string}) { return null; }',
      {props: [prop('items', 'X[]', {required: true}), prop('alt', 'X')]},
    );
    // One entry's `required` is a claim about every prop it names.
    const pairs = ['label: string', 'label?: string'].map((label, i) =>
      component(
        `Pair${i}`,
        `export function Pair${i}(props: {value: string; ${label}}) { return null; }`,
        {props: [prop('value / label', 'string / string', {required: true})]},
      ),
    );
    // Typed `any` through the package's own alias of `Omit`, written in the
    // signature, as a named alias, or as an interface's base.
    const without = ['Without<any>', 'P', 'Q', 'R'].map((props, i) =>
      component(
        `Without${i}`,
        `type Without<T> = Omit<T, 'as'>; type P = Without<any>; interface Q extends Omit<any, 'as'> {} type R = Omit<P, 'ref'>;\nexport function Without${i}(props: ${props}) { return null; }`,
        {props: [prop('label', 'string')]},
      ),
    );

    const tables = [
      picker,
      select,
      propless,
      ...open,
      menu,
      ...pairs,
      ...without,
    ];
    const report = await compare(tables);

    expect(kinds(report)).toEqual([
      'Menu.items required_mismatch',
      'Open0.size not_in_doc',
      'Open1.size not_in_doc',
      'Open2.size not_in_doc',
      'Pair1.label required_mismatch',
      'Propless.label required_mismatch',
    ]);
    expect(report.components).toBe(9);
    expect(report.propsNotChecked).toBeUndefined();
    expect(report.unchecked.map(entry => entry.reason)).toEqual(
      [0, 1, 2, 3].map(i =>
        expect.stringMatching(`^Without${i}'s props are typed`),
      ),
    );
  });

  it('shows a method prop the doc leaves out with its function type, optional or not', async () => {
    withTypeScript();
    const picker = component(
      'Picker',
      `export interface PickerProps {
  label?: string;
  onPick(value: string, index: number): void;
  onClear?(reason: string): void;
  get size(): number;
}
export function Picker(props: PickerProps) { return null; }`,
      {props: [prop('label', 'string')]},
    );

    const report = await compare([picker]);

    expect(
      report.findings.map(f => `${f.prop} ${f.kind}: ${f.codeType}`),
    ).toEqual([
      'onClear not_in_doc: (reason: string) => void',
      'onPick not_in_doc: (value: string, index: number) => void',
      'size not_in_doc: number',
    ]);
  });

  it("prints a union's members in the order the source declares them", async () => {
    withTypeScript();
    // The same literals, made first in another order, would set the
    // compiler's own order.
    const ordered = component(
      'Ordered',
      [
        "type Other = 'md' | 'sm' | 'lg';",
        'export type Unrelated = Other;',
        "type Small = 'lg' | 'sm';",
        "export function Ordered(props: {size?: Small} | {size?: 'md'; label?: string}) { return null; }",
      ].join('\n'),
      {props: [prop('label', 'string')]},
    );

    const report = await compare([ordered]);

    expect(
      report.findings.find(finding => finding.prop === 'size')?.codeType,
    ).toBe("'lg' | 'sm' | 'md'");
  });

  it("reads a prop that the package's defaultProps fills as optional", async () => {
    withTypeScript();
    // A library type that declares an optional `defaultProps`, as React's
    // component types do, fills nothing; without strict null checks it reads
    // as filling every prop.
    const lib = path.join(pkg, 'node_modules', '@acme', 'lib');
    fs.mkdirSync(lib, {recursive: true});
    fs.writeFileSync(
      path.join(lib, 'package.json'),
      JSON.stringify({name: '@acme/lib', types: 'index.d.ts'}),
    );
    fs.writeFileSync(
      path.join(lib, 'index.d.ts'),
      `export interface Kind<P> { new (props: P): {}; defaultProps?: Partial<P> }
export declare function memo<T extends (p: any) => any>(c: T): {(p: Parameters<T>[0]): null; $$typeof: symbol; type: T};
export declare function lazy<T extends (p: any) => any>(f: () => Promise<{default: T}>): {(p: Parameters<T>[0]): null; $$typeof: symbol; _result: T};\n`,
    );
    fs.writeFileSync(
      path.join(pkg, 'tsconfig.json'),
      JSON.stringify({compilerOptions: {strict: false, jsx: 'react-jsx'}}),
    );
    const source = `import {type Kind, lazy, memo} from '@acme/lib';
declare class Component<P> { constructor(props: P); props: P }
export class Klass extends Component<{label: string; size: number}> {
  static defaultProps = {size: 1};
}
export function Fn(props: {label: string; size: number}) { return null; }
Fn.defaultProps = {size: 1};
export function Gn(props: {label: string; size: number}) { return null; }
Gn.defaultProps = {size: 1};
export declare const Typed: Kind<{label: string; size: number}>;
export const Memoed = memo(Fn);
export const Lazied = lazy(() => Promise.resolve({default: Fn}));
export const Thrice = memo(memo(memo(Fn)));
export class Loose extends Component<{label: string; size: number}> { static defaultProps: any = {}; }`;
    const props = [
      prop('label', 'string'),
      prop('size', 'number', {required: true}),
    ];

    const report = await compare([
      ...'Klass Fn Typed Memoed Lazied Thrice Loose'
        .split(' ')
        .map(name => component(name, source, {props})),
      component('Gn', source, {
        props: [prop('label', 'string'), prop('size', 'number')],
      }),
    ]);

    // JSX callers may leave out a prop defaultProps fills (for `memo` and
    // `lazy`, the wrapped component's, two layers deep as React's types read
    // it; `any` fills every prop), so a doc that marks it required disagrees
    // with the code, and one that doesn't agrees.
    expect(kinds(report)).toEqual([
      'Fn.label required_mismatch',
      'Fn.size required_mismatch',
      'Gn.label required_mismatch',
      'Klass.label required_mismatch',
      'Klass.size required_mismatch',
      'Lazied.label required_mismatch',
      'Lazied.size required_mismatch',
      'Loose.size required_mismatch',
      'Memoed.label required_mismatch',
      'Memoed.size required_mismatch',
      'Thrice.label required_mismatch',
      'Typed.label required_mismatch',
    ]);
    expect(
      report.findings.find(f => f.component === 'Fn' && f.prop === 'size'),
    ).toMatchObject({docRequired: true, codeRequired: false});
  });

  it('lists each component whose props it cannot read as not compared', async () => {
    withTypeScript();
    const tsconfig = path.join(pkg, 'tsconfig.json');
    const config = JSON.parse(fs.readFileSync(tsconfig, 'utf8'));
    config.compilerOptions.allowJs = true;
    fs.writeFileSync(tsconfig, JSON.stringify(config));
    /** @param {Record<string, string>} sources each component's props types */
    const missing = sources =>
      Object.entries(sources).map(([name, types]) =>
        component(
          name,
          `import type {MissingProps} from '@acme/not-installed';\n${types}\nexport function ${name}(props: ${name}Props) { return null; }`,
          {props: [prop('label', 'string')]},
        ),
      );
    const unread = [
      ...missing({
        Ghost:
          'export interface GhostProps extends MissingProps { label?: string }',
        Omitted:
          "export interface OmittedProps extends Omit<MissingProps, 'title'> { label?: string }",
        Phantom:
          'export type PhantomProps = Partial<MissingProps> & {label?: string};',
        Named:
          "type Base = Omit<MissingProps, 'title'>; export interface NamedProps extends Base { label?: string }",
        Joined:
          "type Base = Omit<MissingProps, 'title'>; export type JoinedProps = Base & {label?: string};",
        Bare: "type Base = Omit<MissingProps, 'title'>; export type BareProps = Base;",
        Mapped:
          'export type MappedProps = {[K in keyof MissingProps]?: string};',
        Prefixed:
          'type On<K extends string> = {[P in `on${K}`]?: () => void}; export type PrefixedProps = On<MissingProps> & {label?: string};',
        Picked:
          "type Base = Pick<MissingProps, 'title'>; export type PickedProps = Base;",
        Kept: "type W<T> = T & {label?: string}; export type KeptProps = W<Required<Pick<MissingProps, 'title'>>>;",
        Nested:
          "export type NestedProps = Partial<Omit<MissingProps, 'title'>> & {label?: string};",
        Deep: 'interface L1 extends MissingProps {} interface L2 extends L1 {} interface L3 extends L2 {} interface L4 extends L3 {} interface L5 extends L4 {} export interface DeepProps extends L5 { label?: string }',
      }),
      component(
        'Wrapped',
        `import {forwardRef} from 'react';
export const Wrapped = forwardRef<HTMLButtonElement, {label?: string}>((props, ref) => null);`,
        {props: [prop('label', 'string')]},
      ),
      component(
        'Classy',
        "import {MissingBase} from '@acme/not-installed';\nexport class Classy extends MissingBase<{label?: string}> {}\n",
        {props: [prop('label', 'string')]},
      ),
    ];
    // Each of these is the only reference in its files that does not resolve:
    // a name its module does not export, a dependency's own missing import, a
    // missing type package, and a side-effect import.
    fs.writeFileSync(
      path.join(pkg, 'components', 'theme.ts'),
      'export interface Theme { tone?: string }\n',
    );
    const dep = path.join(pkg, 'node_modules', '@acme', 'dep');
    fs.mkdirSync(dep, {recursive: true});
    fs.writeFileSync(
      path.join(dep, 'package.json'),
      JSON.stringify({name: '@acme/dep', types: 'index.d.ts'}),
    );
    fs.writeFileSync(
      path.join(dep, 'index.d.ts'),
      "import type {MissingProps} from '@acme/not-installed';\nexport type DepProps = MissingProps & {label?: string};\n",
    );
    const references = Object.entries({
      Unnamed:
        "import type {Gone} from './theme';\nexport function Unnamed(props: {label?: string; tone?: Gone}) { return null; }\n",
      Peered:
        "import type {DepProps} from '@acme/dep';\nexport function Peered(props: DepProps) { return null; }\n",
      Referenced:
        '/// <reference types="@acme/not-installed-types" />\nexport function Referenced(props: {label?: string}) { return null; }\n',
      Effect:
        "import '@acme/not-installed-effect';\nexport function Effect(props: {label?: string}) { return null; }\n",
      // A type name declared nowhere, which only `keyof`, a `Record`'s keys
      // or a template literal key reaches.
      Omitting:
        'export function Omitting(props: Omit<{label: string; size?: number}, keyof NowhereProps>) { return null; }\n',
      Recorded:
        'export function Recorded(props: Partial<Record<keyof NowhereProps, string>>) { return null; }\n',
      Handlers:
        'export function Handlers(props: {[K in `on${NowhereKey}`]?: () => void}) { return null; }\n',
      Aliased:
        'type Keys = keyof NowhereProps;\nexport function Aliased(props: {[K in Keys]?: string}) { return null; }\n',
      // A value declared nowhere behind a binding, and a property that
      // doesn't exist: the compiler can only give either its error type.
      Valued:
        'const d = missingValue;\nexport function Valued(props: Omit<{label: string; size?: number}, keyof typeof d>) { return null; }\n',
      Sized:
        "interface Theme { colors: {a: string} }\nexport function Sized(props: Partial<Record<keyof Theme['sizes'], string>>) { return null; }\n",
      // A value the compiler can't type, spread into an object, makes the
      // object `any`.
      Spread:
        'interface Theme { colors: {a: string} }\ndeclare const theme: Theme;\nconst defaults = {...theme.sizes};\nexport function Spread(props: Omit<{label: string; size?: number}, keyof typeof defaults>) { return null; }\n',
      Toned:
        'const tones = {...undeclaredTones};\nexport function Toned(props: Partial<Record<keyof typeof tones, string>>) { return null; }\n',
    }).map(([name, source]) =>
      component(name, source, {props: [prop('label', 'string')]}),
    );
    // A name declared nowhere in a JavaScript component's JSDoc, which `tsc`
    // doesn't report there.
    const documented = component(
      'Documented',
      '/** @param {Omit<{label: string; size?: number}, keyof NowhereJs>} props */\nexport function Documented(props) { return null; }\n',
      {props: [prop('label', 'string')]},
    );
    const jsx = documented.sourcePath.replace(/\.tsx$/, '.jsx');
    fs.renameSync(documented.sourcePath, jsx);
    references.push({...documented, sourcePath: jsx, sources: [jsx]});
    // A module found without types resolves: its names are `any`.
    const untypedDir = path.join(pkg, 'node_modules', 'untyped-dep');
    fs.mkdirSync(untypedDir, {recursive: true});
    fs.writeFileSync(
      path.join(untypedDir, 'package.json'),
      JSON.stringify({name: 'untyped-dep', main: 'index.js'}),
    );
    fs.writeFileSync(
      path.join(untypedDir, 'index.js'),
      'export const fmt = text => text;\n',
    );
    const untyped = component(
      'Untyped',
      "import {fmt} from 'untyped-dep';\nexport function Untyped(props: {label?: string}) { fmt(props.label); return null; }\n",
      {props: [prop('label', 'string')]},
    );
    const lonely = component(
      'Lonely',
      'export function Other(props: {label: string}) { return null; }\n',
      {props: [prop('label', 'string', {required: true})]},
    );
    // An `any` index signature the package declares itself is no reason.
    const open = component(
      'Open',
      'export function Open(props: {label?: string; [key: string]: any}) { return null; }\n',
      {props: [prop('label', 'string')]},
    );
    // A missing import in the files a component comes from lists it, however
    // the props reach it: only a member's type, a value's property, a
    // conditional, `??`, a comma, or an own HOC that maps over `keyof P`.
    const reached = Object.entries({
      Member:
        'interface Holder<T> { label?: T } export function Member(props: Holder<MissingProps>) { return null; }',
      Header:
        'function Inner(props: {label?: string}) { return null; } const Card = Object.assign(Inner, {Header: Inner}); export const Header = Card.Header;',
      Chosen:
        'function Inner(props: {label?: string}) { return null; } export const Chosen = (globalThis as {x?: 1}).x ? Inner : Inner;',
      Fallback:
        'function Inner(props: {label?: string}) { return null; } export const Fallback = (undefined as typeof Inner | undefined) ?? Inner;',
      Comma:
        'function Inner(props: {label?: string}) { return null; } export const Comma = (0, Inner);',
      Keyed:
        'function withKeys<P>(c: (props: P) => null) { return (props: {[K in keyof P]?: string}) => c(props as P); } export const Keyed = withKeys((props: MissingProps) => null);',
    }).map(([name, source]) =>
      component(
        name,
        `import type {MissingProps} from '@acme/not-installed';\n${source}\n`,
        {props: [prop('label', 'string')]},
      ),
    );

    // Props that take names from a type parameter, such as the element a
    // component renders, accept any name until it is used.
    const PROPS_OF = [
      'interface Intrinsic { div: {title?: string}; span: {lang?: string} }',
      'type ElementType = keyof Intrinsic | ((props: any) => unknown);',
      'type PropsOf<E> = E extends (props: infer P) => unknown ? P : E extends keyof Intrinsic ? Intrinsic[E] : {};',
      "type Prefixed<N extends string> = {[K in 'value' | 'change' as `${N}${Capitalize<K>}`]: string};",
      "type Pair<N extends string> = {label: string} & {[K in 'a' | 'b' as `${N}${K}`]: string};",
      'type Relayed<M extends string> = Prefixed<M>;',
      'type Except<O, X extends keyof O> = {[K in keyof O as K extends X ? never : K]: O[K]};',
      'type PickByValue<O, V> = {[K in keyof O as O[K] extends V ? K : never]: O[K]};',
    ];
    const generics = Object.entries({
      Poly: "export type PolyProps<E extends ElementType> = {as?: E; padding?: number} & Omit<PropsOf<E>, 'as' | 'padding'>; export function Poly<E extends ElementType = 'div'>(props: PolyProps<E>) { return null; }",
      Joint:
        "export function Joint<E extends ElementType = 'div'>(props: {as?: E} & PropsOf<E>) { return null; }",
      Partly:
        "export function Partly<E extends ElementType = 'div'>(props: Partial<PropsOf<E>>) { return null; }",
      Remapped:
        'export function Remapped<T extends Record<string, unknown> = {value: string}>(props: {[K in keyof T & string as `on${Capitalize<K>}Change`]?: (value: T[K]) => void}) { return null; }',
      Inferred:
        'interface InferredBase { label?: string } export function Inferred<P extends InferredBase>(props: P) { return null; }',
      // An `as` clause that names props from one: through an alias (in an
      // intersection, or through another alias), inline, or behind a
      // condition; and keys made from one.
      PrefixAlias:
        'export function PrefixAlias<N extends string>(props: Prefixed<N>) { return null; }',
      PrefixNested:
        'export function PrefixNested<N extends string>(props: Pair<N>) { return null; }',
      PrefixDeep:
        'export function PrefixDeep<N extends string>(props: Relayed<N>) { return null; }',
      Templated:
        'export function Templated<K extends string>(props: {[P in `on${K}`]?: () => void}) { return null; }',
      PrefixInline:
        "export function PrefixInline<N extends string>(props: {[K in 'value' | 'change' as `${N}${Capitalize<K>}`]?: string}) { return null; }",
      PrefixGated:
        "export function PrefixGated<T extends boolean>(props: {[K in 'value' | 'change' as T extends true ? K : never]?: string}) { return null; }",
      // Props made from one that show the compiler no members at all.
      Bagged:
        'interface Bag<T> {} export function Bagged<T>(props: Bag<T>) { return null; }',
    }).map(([name, source]) =>
      component(name, [...PROPS_OF, source].join('\n'), {
        props: [prop('elevation', 'number')],
      }),
    );
    // A generic whose own props take any name, or map keys of its own (an
    // `as` clause over its own key, or an alias or key filter given fixed
    // arguments), has names of its own: compared.
    const own = (/** @type {string} */ names) =>
      names.split(' ').map(name => prop(name, 'X', {required: true}));
    const owned = [
      ['GenericOpen', '{items: T[]; [key: string]: any}', 'items'],
      ['GenericRecord', '{items: T[]} & Record<string, any>', 'items'],
      ['GenericRecordKeys', "Record<'value' | 'initial', T>", 'initial value'],
      ['GenericFiltered', "{[K in 'a' | 'b' as Exclude<K, 'b'>]: T}", 'a'],
      ['GenericPrefixed', "Prefixed<'my'>", 'myChange myValue'],
      ['GenericPair', "Pair<'my'>", 'label mya myb'],
      ['GenericRelayed', "Relayed<'my'>", 'myChange myValue'],
      [
        'GenericExcept',
        "{items: T[]} & Except<{a: string; b: string}, 'b'>",
        'a items',
      ],
      [
        'GenericByValue',
        '{items: T[]} & PickByValue<{onPick: () => void; size: number}, Function>',
        'items onPick',
      ],
    ].map(([name, props, names]) =>
      component(
        name,
        [
          ...PROPS_OF,
          `export function ${name}<T>(props: ${props}) { return null; }`,
        ].join('\n'),
        {props: own(names)},
      ),
    );
    // Props that are plainly empty, generic or not, are compared: TypeScript
    // takes none of the documented props.
    const empty = ['NoProps', 'NoPropsT<T>'].map(name =>
      component(
        name.replace('<T>', ''),
        `export function ${name}(props: {}) { return null; }\n`,
        {props: [prop('label', 'string')]},
      ),
    );

    const report = await compare([
      ...unread,
      lonely,
      open,
      ...reached,
      ...references,
      untyped,
      ...generics,
      ...owned,
      ...empty,
    ]);

    expect(kinds(report)).toEqual([
      'NoProps.label not_in_code',
      'NoPropsT.label not_in_code',
    ]);
    expect(report.components).toBe(13);
    const generic_ =
      'Bagged Inferred Joint Partly Poly PrefixAlias PrefixDeep PrefixGated PrefixInline PrefixNested Remapped Templated'.split(
        ' ',
      );
    expect(report.unchecked.map(u => u.component)).toEqual(
      'Aliased Bagged Bare Chosen Classy Comma Deep Documented Effect Fallback Ghost Handlers Header Inferred Joined Joint Kept Keyed Lonely Mapped Member Named Nested Omitted Omitting Partly Peered Phantom Picked Poly PrefixAlias PrefixDeep Prefixed PrefixGated PrefixInline PrefixNested Recorded Referenced Remapped Sized Spread Templated Toned Unnamed Valued Wrapped'.split(
        ' ',
      ),
    );
    // A type the compiler can't work out, though every reference resolves.
    const untyped_ =
      'Aliased Documented Handlers Omitting Recorded Sized Spread Toned Valued'.split(
        ' ',
      );
    for (const {component: name, reason} of report.unchecked) {
      expect(reason).toContain(
        name === 'Lonely'
          ? 'Lonely.tsx has no export named Lonely'
          : generic_.includes(name)
            ? 'from a type parameter'
            : untyped_.includes(name)
              ? "a type the compiler can't work out"
              : 'could not resolve',
      );
    }
  });
});

/**
 * A multi-component doc's entry.
 * @param {string} name
 * @param {any[]} props
 */
const entry = (name, props) => ({
  name,
  displayName: name,
  description: 'Fixture.',
  props,
});

/** @param {import('./prop-drift.mjs').PropDriftComponent[]} components */
function compareDocs(components) {
  return comparePropDocs(components, {packageDir: pkg, resolveFrom: [pkg]});
}

describe('comparePropDocs', () => {
  it('compares each entry of a multi-component doc against its own export, and skips hooks', async () => {
    withTypeScript();
    const tabs = component(
      'Tabs',
      `export function Tabs(props: {value: string}) { return null; }
export function Tab(props: {value: string; isDisabled?: boolean}) { return null; }
export function useTabs(options: {value: string}) { return options; }`,
      {
        components: [
          entry('Tabs', [prop('value', 'string', {required: true})]),
          entry('Tab', [
            prop('value', 'string', {required: true}),
            prop('isSelected', 'boolean'),
          ]),
          {
            name: 'useTabs',
            displayName: 'useTabs',
            description: 'Fixture.',
            params: [
              {
                name: 'options',
                type: '{value: string}',
                description: 'Fixture.',
              },
            ],
          },
        ],
      },
    );

    const report = await compareDocs([tabs]);

    expect(report.components).toBe(2);
    expect(kinds(report)).toEqual([
      'Tab.isDisabled not_in_doc',
      'Tab.isSelected not_in_code',
    ]);
  });

  it('compares a member record only against its own source, and the family record leaves that member alone', async () => {
    withTypeScript();
    const status = component(
      'Status',
      'export function Status(props: {value: string}) { return null; }\n',
      {
        components: [
          entry('Status', [prop('value', 'string', {required: true})]),
          entry('StatusGlyph', [
            prop('size', 'number'),
            prop('tone', 'string'),
          ]),
        ],
      },
    );
    const glyphSource = path.join(pkg, 'components', 'StatusView.tsx');
    fs.writeFileSync(
      glyphSource,
      'export function StatusGlyph(props: {size?: number}) { return null; }\n',
    );

    const report = await compareDocs([
      status,
      {...status, name: 'StatusGlyph', sourcePath: glyphSource},
    ]);

    expect(report.unchecked).toEqual([]);
    expect(report.components).toBe(2);
    expect(kinds(report)).toEqual(['StatusGlyph.tone not_in_code']);
    expect(report.findings[0].source).toBe('components/StatusView.tsx');
  });

  it('lists a member record that no file in the package declares as not compared', async () => {
    withTypeScript();
    const status = component(
      'Status',
      'export function Status(props: {value: string}) { return null; }\n',
      {
        components: [
          entry('Status', [prop('value', 'string', {required: true})]),
          entry('StatusGlyph', [prop('size', 'number')]),
        ],
      },
    );

    // Only another folder, or built output, declares the member.
    const report = await compareDocs([
      status,
      {...status, name: 'StatusGlyph', sourcePath: null},
    ]);

    expect(report.components).toBe(1);
    expect(report.findings).toEqual([]);
    expect(report.unchecked).toEqual([
      {
        component: 'StatusGlyph',
        doc: 'components/Status.doc.mjs',
        reason: 'no source file for StatusGlyph',
      },
    ]);
  });

  it('compares every entry of a family doc named after another export, and lists one with no source as not compared', async () => {
    withTypeScript();
    const menu = component(
      'Menu',
      [
        'export function MenuRoot(props: {open?: boolean}) { return null; }',
        'export function MenuItem(props: {value: string}) { return null; }',
      ].join('\n'),
      {
        name: 'MenuRoot',
        hiddenComponents: ['MenuItem', 'MenuPart'],
        components: [
          entry('MenuItem', [prop('label', 'string')]),
          entry('MenuGhost', [prop('tone', 'string')]),
          entry('MenuPart', [prop('tone', 'string')]),
        ],
      },
    );
    // A hidden entry declared in another file of the doc's folder.
    fs.writeFileSync(
      path.join(pkg, 'components', 'menu-parts.tsx'),
      'export function MenuPart(props: {depth?: number}) { return null; }\n',
    );

    // Discovery records the doc under `MenuRoot` and leaves the hidden
    // `MenuItem` and `MenuPart` and the unbuilt `MenuGhost` without records
    // of their own.
    const report = await compareDocs([{...menu, name: 'MenuRoot'}]);

    expect(kinds(report)).toEqual([
      'MenuItem.label not_in_code',
      'MenuItem.value not_in_doc',
      'MenuPart.depth not_in_doc',
      'MenuPart.tone not_in_code',
    ]);
    expect(report.unchecked).toEqual([
      {
        component: 'MenuGhost',
        doc: 'components/Menu.doc.mjs',
        reason: 'Menu.tsx has no export named MenuGhost',
      },
    ]);
  });

  it("compares a doc's own props with the export its name names, which another file can hold", async () => {
    withTypeScript();
    const status = component(
      'Status',
      'export function Status(props: {value: string}) { return null; }\n',
      {name: 'StatusView', props: [prop('size', 'number')]},
    );
    const viewSource = path.join(pkg, 'components', 'StatusView.tsx');
    fs.writeFileSync(
      viewSource,
      'export function StatusView(props: {size?: number}) { return null; }\n',
    );

    // Discovery names the record after the file, or after the export.
    const byFile = await compareDocs([status]);
    const byExport = await compareDocs([
      {...status, name: 'StatusView', sourcePath: viewSource},
    ]);

    for (const report of [byFile, byExport]) {
      expect(report.unchecked).toEqual([]);
      expect(report.components).toBe(1);
      expect(report.findings).toEqual([]);
    }
  });

  it('compares a table for one component in each doc that has one', async () => {
    withTypeScript();
    const title = prop('title', 'string', {required: true});
    const list = component(
      'List',
      'export function List(props: {label: string}) { return null; }\n',
      {
        components: [
          entry('List', [prop('label', 'string', {required: true})]),
          entry('ListGroup', [title]),
        ],
      },
    );
    const group = component(
      'ListGroup',
      'export function ListGroup(props: {title: string}) { return null; }\n',
      {props: [title, prop('stale', 'string')]},
    );

    const report = await compareDocs([list, group]);

    expect(report.components).toBe(3);
    expect(kinds(report)).toEqual(['ListGroup.stale not_in_code']);
    expect(report.findings[0].doc).toBe('components/ListGroup.doc.mjs');
  });

  it('lists every component as not compared when a declaration file the config includes, or a type package it names, does not resolve', async () => {
    withTypeScript();
    const tsconfig = path.join(pkg, 'tsconfig.json');
    const config = JSON.parse(fs.readFileSync(tsconfig, 'utf8'));
    /** @param {object} options */
    const configure = options =>
      fs.writeFileSync(
        tsconfig,
        JSON.stringify({
          ...config,
          compilerOptions: {...config.compilerOptions, ...options},
          include: ['components', 'types'],
        }),
      );
    fs.mkdirSync(path.join(pkg, 'types'));
    const globals = path.join(pkg, 'types', 'globals.d.ts');
    const tables = () => [
      component(
        'Omitted',
        'export function Omitted(props: Omit<{label: string; size?: number}, keyof MissingProps>) { return null; }\n',
        {
          props: [
            prop('label', 'string', {required: true}),
            prop('size', 'number'),
          ],
        },
      ),
      component(
        'Plain',
        'export function Plain(props: {label?: string}) { return null; }\n',
        {props: [prop('label', 'string')]},
      ),
    ];
    /** @param {RegExp} reason */
    const unread = reason =>
      ['Omitted', 'Plain'].map(name => ({
        component: name,
        doc: `components/${name}.doc.mjs`,
        reason: expect.stringMatching(reason),
      }));

    // A global type made from a package that isn't installed.
    configure({});
    fs.writeFileSync(
      globals,
      "import type {Props} from '@acme/not-installed';\ndeclare global { type MissingProps = Props; }\n",
    );
    let report = await compare(tables());
    expect(report.findings).toEqual([]);
    expect(report.unchecked).toEqual(
      unread(
        /depends on `@acme\/not-installed` \(imported in \.\.\/types\/globals\.d\.ts\)/,
      ),
    );

    // A global type made from a name declared nowhere.
    fs.writeFileSync(
      globals,
      'declare global { type MissingProps = NowhereProps; }\nexport {};\n',
    );
    report = await compare(tables());
    expect(report.findings).toEqual([]);
    expect(report.unchecked).toEqual(
      unread(
        /depends on `NowhereProps` \(used in \.\.\/types\/globals\.d\.ts\)/,
      ),
    );

    // A type package the config names that isn't installed.
    fs.writeFileSync(
      globals,
      'declare global { type MissingProps = {id?: string}; }\nexport {};\n',
    );
    configure({types: ['@acme/not-installed-globals']});
    report = await compare(tables());
    expect(report.findings).toEqual([]);
    expect(report.unchecked).toEqual(
      unread(
        /depends on the types `@acme\/not-installed-globals` \(named in \.\.\/tsconfig\.json\)/,
      ),
    );

    // Both resolved: compared.
    configure({types: []});
    report = await compare(tables());
    expect(report.unchecked).toEqual([]);
    expect(report.components).toBe(2);
  });

  it("lists every table, with the error, when the package's TypeScript config has an error", async () => {
    withTypeScript();
    fs.writeFileSync(
      path.join(pkg, 'tsconfig.json'),
      JSON.stringify({extends: './missing-base.json'}),
    );
    const titled = component(
      'Titled',
      'export function Titled(props: {title?: string}) { return null; }\n',
      {props: [prop('title', 'string')]},
    );

    const report = await compare([titled]);

    expect(report.components).toBe(0);
    expect(report.unchecked).toEqual([
      expect.objectContaining({
        component: 'Titled',
        reason: expect.stringMatching(
          /config has an error.*missing-base\.json/,
        ),
      }),
    ]);
  });

  it('accepts a name through an index signature only as TypeScript would', async () => {
    withTypeScript();
    const keyed = component(
      'Keyed',
      [
        'export interface KeyedProps {',
        '  [key: `data-${string}`]: string | undefined;',
        '  [key: `${string}:${string}`]: string;',
        '  [key: `col${number}`]: number;',
        '  [key: `on${Capitalize<string>}`]: () => void;',
        '}',
        'export function Keyed(props: KeyedProps) { return null; }',
      ].join('\n'),
      {
        props: [
          prop('data-section', 'string'),
          prop('a:b', 'string'),
          prop('col2', 'number'),
          prop('onClick', '() => void'),
          prop('elevation', 'string'),
          prop('colSpan', 'string'),
          prop('onclick', 'string'),
        ],
      },
    );
    const empty = component(
      'Empty',
      `interface EmptyProps { label?: string }
export function Empty(props: EmptyProps | Record<string, never>) { return null; }`,
      {props: [prop('label', 'string'), prop('elevation', 'number')]},
    );
    const typedAny = component(
      'TypedAny',
      'export function TypedAny(props: any) { return null; }\n',
      {props: [prop('label', 'string')]},
    );
    const anyConst = component(
      'AnyConst',
      'export const AnyConst: any = null;\n',
      {props: [prop('label', 'string')]},
    );

    const report = await compare([keyed, empty, typedAny, anyConst]);

    expect(kinds(report)).toEqual([
      'Empty.elevation not_in_code',
      'Keyed.colSpan not_in_code',
      'Keyed.elevation not_in_code',
      'Keyed.onclick not_in_code',
    ]);
    expect(report.unchecked.map(u => [u.component, u.reason])).toEqual([
      ['AnyConst', expect.stringContaining('typed `any`')],
      ['TypedAny', expect.stringContaining('typed `any`')],
    ]);
  });

  it("reads props through React's component types, lists the ones typed any or named by the element they render, and loads the ambient types tsconfig includes", async () => {
    withTypeScript();
    fs.mkdirSync(path.join(pkg, 'node_modules', '@types'), {recursive: true});
    fs.symlinkSync(
      path.dirname(require.resolve('@types/react/package.json')),
      path.join(pkg, 'node_modules', '@types', 'react'),
      'dir',
    );
    const tsconfig = path.join(pkg, 'tsconfig.json');
    const config = JSON.parse(fs.readFileSync(tsconfig, 'utf8'));
    fs.writeFileSync(
      tsconfig,
      JSON.stringify({...config, include: ['components', 'types']}),
    );
    fs.mkdirSync(path.join(pkg, 'types'));
    fs.writeFileSync(
      path.join(pkg, 'types', 'ambient.d.ts'),
      'interface AmbientProps { label?: string }\n',
    );
    const source = `import {forwardRef, memo, type FC, type ComponentType, type ComponentPropsWithoutRef, type ElementType} from 'react';
export function Poly<E extends ElementType = 'div'>(props: {as?: E; padding?: number} & Omit<ComponentPropsWithoutRef<E>, 'as' | 'padding'>) { return null; }
export const Fc: FC<any> = () => null;
export const Memo = memo((props: any) => null);
export const Fwd = forwardRef<HTMLDivElement, any>((props, ref) => null);
export const FwdOmit = forwardRef<HTMLDivElement, Omit<any, 'as'>>((props, ref) => null);
export const FwdPartial = memo(forwardRef<HTMLDivElement, Partial<any>>((props, ref) => null));
export function Ambient(props: AmbientProps) { return null; }
export const Typed: ComponentType<{label?: string}> = () => null;
const withName = <P,>(c: ComponentType<P>): ComponentType<P> => c;
export const Hoc = withName((props: {label?: string}) => null);`;
    const props = [prop('label', 'string'), prop('elevation', 'number')];

    const report = await compare(
      'Fc Memo Fwd FwdOmit FwdPartial Poly Ambient Typed Hoc'
        .split(' ')
        .map(name => component(name, source, {props})),
    );

    expect(kinds(report)).toEqual(
      'Ambient Hoc Typed'
        .split(' ')
        .map(name => `${name}.elevation not_in_code`),
    );
    expect(report.unchecked.map(u => [u.component, u.reason])).toEqual(
      ['Fc', 'Fwd', 'FwdOmit', 'FwdPartial', 'Memo', 'Poly'].map(name => [
        name,
        expect.stringContaining(
          name === 'Poly' ? 'from a type parameter' : 'typed `any`',
        ),
      ]),
    );
  });

  it('reads names that list several props, spreads, and fields through arrays, tuples, unions and index signatures', async () => {
    withTypeScript();
    const menu = component(
      'Menu',
      [
        'export interface MenuProps {',
        '  onOpen?: () => void;',
        '  onClose?: () => void;',
        '  value?: {label: string; items: ReadonlyArray<{id: string}>};',
        '  labels?: Record<string, string>;',
        '  slots?: {[key: `slot-${string}`]: string};',
        "  rows?: Array<{kind: 'a'; total: string} | {kind: 'b'}>;",
        '  grid?: Array<Array<{id: string}>>;',
        '  pair?: readonly [{id: string}, {id: number}];',
        '}',
        'export function Menu(props: MenuProps) { return null; }',
      ].join('\n'),
      {
        props: [
          prop('onOpen / onClose', '() => void / () => void'),
          prop('...rest', 'Omit<OtherProps, "x">'),
          ...['value.label', 'value.items[].id', 'value.missing'].map(name =>
            prop(name, 'string'),
          ),
          ...['labels.close', 'slots.slot-a', 'slots.other'].map(name =>
            prop(name, 'string'),
          ),
          ...['rows[].total', 'grid[][].id', 'grid[][].size', 'pair[].id'].map(
            name => prop(name, 'string'),
          ),
        ],
      },
    );

    expect(kinds(await compare([menu]))).toEqual([
      'Menu.grid[][].size not_in_code',
      'Menu.slots.other not_in_code',
      'Menu.value.missing not_in_code',
    ]);
  });

  it("compares with TypeScript 7's TypeScript 6 API package when the project has one", async () => {
    const badge = component(
      'Badge',
      'export function Badge(props: {label: string}) { return null; }\n',
      {props: [prop('label', 'number')]},
    );
    withTypeScript7AndItsTypeScript6Api();

    const report = await compare([badge]);

    expect(report.status).toBe('checked');
    // The comparison ran: the documented `number` is judged against `string`.
    expect(
      report.findings.map(f => `${f.component}.${f.prop} ${f.kind}`),
    ).toContain('Badge.label type_mismatch');
  });

  it('skips with a reason, and compares nothing, without a TypeScript it can use', async () => {
    const badge = component(
      'Badge',
      'export function Badge(props: {label: string}) { return null; }\n',
      {props: [prop('label', 'number')]},
    );
    const skipped = (/** @type {string} */ reason) => ({
      status: 'skipped',
      reason,
      components: 0,
      typesCompared: 0,
      findings: [],
      unchecked: [],
      typesNotCompared: [],
    });

    expect(await compare([badge])).toEqual(skipped(TYPESCRIPT_MISSING_REASON));
    expect(TYPESCRIPT_MISSING_REASON).toContain('npm install -D typescript@6');
    // TypeScript 7 has no JavaScript compiler API to load.
    const dir = path.join(pkg, 'node_modules', 'typescript');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'typescript',
        version: '7.0.0',
        exports: {'./package.json': './package.json'},
      }),
    );
    const report = await compare([badge]);
    expect(report.reason).toContain('TypeScript 7.0.0');
    expect(report.reason).toContain('npm install -D @typescript/typescript6');
    expect(report).toEqual(
      skipped(
        unusableTypeScriptReason(
          '7.0.0',
          'documented props were not compared with the code',
        ),
      ),
    );
  });
});
