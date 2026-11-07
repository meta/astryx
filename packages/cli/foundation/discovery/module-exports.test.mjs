// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Static reads of a module's exports, without running it: the file that
 * declares an export, and an exported object literal as plain data.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  elementPropOrigins,
  followedExportNames,
  moduleExportOrigin,
  moduleExportOrigins,
  moduleExportSource,
  moduleExportsName,
  staticExportObject,
} from './module-exports.mjs';

/** @type {string} */
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-export-field-'));
});

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/**
 * @param {string} file
 * @param {string} source
 * @returns {string}
 */
function write(file, source) {
  const filePath = path.join(dir, file);
  fs.writeFileSync(filePath, source);
  return filePath;
}

const DOC_EXPORTS = ['default', 'docs'];

describe('staticExportObject', () => {
  it('reads a default-exported object literal as plain data', () => {
    const file = write(
      'A.doc.mjs',
      "export default {type: 'component', name: 'AcmeCarousel', order: 2, hidden: false, extra: null};\n",
    );
    expect(staticExportObject(file, DOC_EXPORTS)).toEqual({
      type: 'component',
      name: 'AcmeCarousel',
      order: 2,
      hidden: false,
      extra: null,
    });
  });

  it('reads a named export, an export list, and the first export it looks for', () => {
    const named = write(
      'B.doc.mjs',
      "/** @type {object} */\nexport const docs = {\n  name: 'AcmeCarousel',\n};\n",
    );
    const both = write(
      'C.doc.mjs',
      "export const docs = {name: 'Legacy'};\nexport default {name: 'Stamped'};\n",
    );
    const list = write(
      'E.doc.mjs',
      "const local = {name: 'AcmeCarousel'};\nexport {local as docs};\n",
    );
    expect(staticExportObject(named, DOC_EXPORTS)?.name).toBe('AcmeCarousel');
    expect(staticExportObject(both, DOC_EXPORTS)?.name).toBe('Stamped');
    expect(staticExportObject(list, DOC_EXPORTS)?.name).toBe('AcmeCarousel');
  });

  it('follows top-level bindings through TypeScript wrappers, at any depth', () => {
    const file = write(
      'D.doc.ts',
      [
        "const slide = {name: 'AcmeSlide', description: 'One slide.'} as const;",
        "const doc = {name: 'AcmeCarousel', components: [slide, {name: 'AcmeDots', description: 'Dots.'}]} satisfies {name: string};",
        'export default doc;',
        '',
      ].join('\n'),
    );
    expect(staticExportObject(file, DOC_EXPORTS)).toEqual({
      name: 'AcmeCarousel',
      components: [
        {name: 'AcmeSlide', description: 'One slide.'},
        {name: 'AcmeDots', description: 'Dots.'},
      ],
    });
  });

  it('leaves out what it cannot read without running the module', () => {
    const file = write(
      'F.doc.mjs',
      [
        "const prefix = 'Acme';",
        'const shared = {group: "Media"};',
        'export default {',
        '  // A computed string, a call and a spread: none is read.',
        '  name: `${prefix}Carousel`,',
        '  usage: makeUsage(),',
        "  group: 'Overridden',",
        '  ...shared,',
        "  category: 'Media',",
        "  components: [...more, {name: 'AcmeSlide'}],",
        '};',
        '',
      ].join('\n'),
    );
    expect(staticExportObject(file, DOC_EXPORTS)).toEqual({
      category: 'Media',
      components: [{name: 'AcmeSlide'}],
    });
  });

  it('answers null when there is no exported object', () => {
    const files = [
      write(
        'G.doc.mjs',
        "export const docs = {name: 'Legacy'};\nexport default makeDoc();\n",
      ),
      write('H.doc.mjs', 'export default {name: '),
      write('I.doc.mjs', "export const other = {name: 'AcmeCarousel'};\n"),
      write('J.doc.mjs', "export default ['AcmeCarousel'];\n"),
    ];
    for (const file of files) {
      expect(staticExportObject(file, DOC_EXPORTS)).toBeNull();
    }
  });
});

describe('moduleExportSource', () => {
  it('names the file that declares an export, following local re-exports', () => {
    const impl = write(
      'impl.tsx',
      'export function AcmeSlide() { return null; }\n',
    );
    const barrel = write(
      'index.ts',
      "export {AcmeSlide} from './impl';\nexport * from './dots';\nexport function AcmeCarousel() { return null; }\n",
    );
    const dots = write('dots.tsx', 'export const AcmeDots = () => null;\n');
    expect(moduleExportSource(barrel, 'AcmeSlide')).toBe(impl);
    expect(moduleExportSource(barrel, 'AcmeDots')).toBe(dots);
    expect(moduleExportSource(barrel, 'AcmeCarousel')).toBe(barrel);
    expect(moduleExportSource(barrel, 'AcmeMissing')).toBeNull();
  });

  it('does not follow a re-export written in a comment', () => {
    write('legacy.tsx', 'export function AcmeTab() { return null; }\n');
    const barrel = write(
      'tabs.ts',
      "// export * from './legacy';\nexport function AcmeTabs() { return null; }\n",
    );
    expect(moduleExportSource(barrel, 'AcmeTab')).toBeNull();
  });

  it('does not count a type-only export', () => {
    const file = write('types.ts', 'export type AcmeShape = {id: string};\n');
    expect(moduleExportSource(file, 'AcmeShape')).toBeNull();
  });

  it('sees a file npm replaced with one of the same size and mtime', () => {
    // npm stamps every installed file with one mtime and writes new files.
    const npmTime = new Date('1985-10-26T08:15:00Z');
    const file = write('Panel.tsx', 'export function AcmePanel() {}\n');
    fs.utimesSync(file, npmTime, npmTime);
    expect(moduleExportSource(file, 'AcmePanel')).toBe(file);
    const next = write('Panel.next.tsx', 'export function AcmePanol() {}\n');
    fs.utimesSync(next, npmTime, npmTime);
    fs.renameSync(next, file);
    expect(moduleExportSource(file, 'AcmePanel')).toBeNull();
  });
});

describe('a library of thousands of icons', () => {
  it('finds the origin of every export in about linear time', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-many-exports-'));
    try {
      const count = 3000;
      fs.writeFileSync(
        path.join(dir, 'icon.js'),
        'export function make(name) { return function Icon() { return name; }; }\n',
      );
      const lines = ["import {make} from './icon.js';"];
      for (let i = 0; i < count; i++) {
        lines.push(`const Glyph${i} = make('g${i}');`);
        lines.push(
          `export {Glyph${i}, Glyph${i} as Glyph${i}Icon, Glyph${i} as LucideGlyph${i}};`,
        );
      }
      const file = path.join(dir, 'index.js');
      fs.writeFileSync(file, `${lines.join('\n')}\n`);
      const started = Date.now();
      for (let i = 0; i < count; i++) {
        expect(moduleExportOrigin(file, `Glyph${i}Icon`)).toEqual({
          file,
          name: `Glyph${i}`,
        });
      }
      // Walking the whole module once per lookup took minutes.
      expect(Date.now() - started).toBeLessThan(10_000);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }, 60_000);
});

describe('elementPropOrigins', () => {
  const THEME = {
    sources: new Set(['@acme/core']),
    name: 'Theme',
    prop: 'theme',
    /** @param {any} init */
    unwrap: init =>
      init.type === 'CallExpression' && init.callee?.name === 'extend'
        ? init.arguments[0]
        : null,
  };

  it('follows each element value through aliases, re-exports, unwrap and an installed package', () => {
    const pkg = path.join(dir, 'node_modules/@acme/themes');
    fs.mkdirSync(path.join(pkg, 'dist'), {recursive: true});
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({name: '@acme/themes', exports: {'.': './dist/index.js'}}),
    );
    fs.writeFileSync(
      path.join(pkg, 'dist/index.js'),
      "export {oceanTheme} from './ocean.js';\n",
    );
    const ocean = path.join(pkg, 'dist/ocean.js');
    fs.writeFileSync(ocean, 'export const oceanTheme = {};\n');
    write(
      'brand.ts',
      "import {oceanTheme as base} from '@acme/themes';\nexport const brand = extend(base);\n",
    );
    const app = write(
      'App.tsx',
      [
        "import {Theme as T} from '@acme/core';",
        "import {oceanTheme} from '@acme/themes';",
        "import {brand} from './brand';",
        'const picked = oceanTheme;',
        'export const App = ({theme}: any) => (',
        '  <T theme={picked}><T theme={brand as any} /><T theme={theme} /><T theme={themes.x} /><T /></T>',
        ');',
        '',
      ].join('\n'),
    );

    expect(elementPropOrigins(app, THEME)).toEqual([
      {file: ocean, name: 'oceanTheme'},
      {file: ocean, name: 'oceanTheme'},
      {file: app, name: 'theme'},
      null,
    ]);
  });

  it('gives nothing for a module that never imports the element', () => {
    const app = write(
      'Other.tsx',
      "import {Theme} from 'elsewhere';\nexport const A = () => <Theme theme={x} />;\n",
    );
    expect(elementPropOrigins(app, THEME)).toEqual([]);
  });

  it('gives null when the package a value comes from is not installed', () => {
    const app = write(
      'Missing.tsx',
      "import {Theme} from '@acme/core';\nimport {gone} from '@acme/missing';\nexport const A = () => <Theme theme={gone} />;\n",
    );
    expect(elementPropOrigins(app, THEME)).toEqual([null]);
  });

  it('follows an import to an export declared inside a namespace, as the whole-tree reader finds it', () => {
    const themes = write(
      'themes.ts',
      'namespace Palette {\n  export const ocean = {};\n}\n',
    );
    const app = write(
      'Namespaced.tsx',
      "import {Theme} from '@acme/core';\nimport {ocean} from './themes';\nexport const A = () => <Theme theme={ocean} />;\n",
    );
    // The icon-set reader, which reads only the top level, runs first on
    // the same parsed module and leaves the whole-tree answer unchanged.
    expect(moduleExportOrigin(themes, 'ocean')).toBeNull();
    expect(elementPropOrigins(app, THEME)).toEqual([
      {file: themes, name: 'ocean'},
    ]);
  });
});

describe('an export declared inside a namespace', () => {
  const NAMESPACE =
    'export namespace Button {\n  export function Inner() { return null; }\n}\n';

  it('counts for the stable reader, as it always has', () => {
    const file = write('button.ts', NAMESPACE);
    expect(moduleExportSource(file, 'Inner')).toBe(file);
    expect(moduleExportsName(file, 'Inner')).toBe(true);
  });

  it('is no export of the module for the icon-set reader, which reads only its top level', () => {
    const file = write('button.ts', NAMESPACE);
    expect(moduleExportOrigin(file, 'Inner')).toBeNull();
    expect(followedExportNames(file)).not.toContain('Inner');
  });

  it('counts for the one-pass reader, in value and type reads, after the icon-set reader reads the module', () => {
    const file = write('button.ts', NAMESPACE);
    expect(
      moduleExportOrigin(file, 'Inner', undefined, {types: true}),
    ).toBeNull();
    for (const types of [false, true]) {
      expect(moduleExportOrigins(file, {types}).get('Inner')).toEqual({
        file,
        name: 'Inner',
      });
    }
  });
});

describe('the one-pass reader beside the icon-set reader', () => {
  it('reads namespace and type exports as the whole-tree reader does, while the icon-set reader skips nested declarations', () => {
    const file = write(
      'mixed.ts',
      [
        'export namespace Shapes {',
        '  export const circle = 1;',
        '  export interface Corner {}',
        '}',
        'export interface Size {}',
        'export const top = 2;',
        '',
      ].join('\n'),
    );
    expect(moduleExportOrigin(file, 'circle')).toBeNull();
    expect(
      moduleExportOrigin(file, 'Corner', undefined, {types: true}),
    ).toBeNull();
    expect(moduleExportOrigin(file, 'Size', undefined, {types: true})).toEqual({
      file,
      name: 'Size',
    });
    const names = types =>
      [...moduleExportOrigins(file, {types}).keys()].sort();
    expect(names(false)).toEqual(['circle', 'top']);
    expect(names(true)).toEqual(['Corner', 'Shapes', 'Size', 'circle', 'top']);
    expect(moduleExportOrigins(file, {types: true}).get('Corner')).toEqual({
      file,
      name: 'Corner',
    });
  });
});

describe('moduleExportOrigins', () => {
  /** @type {string} */
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-export-origins-'));
    const write = (name, text) => fs.writeFileSync(path.join(dir, name), text);
    write('values.ts', 'export const a = 1;\nexport function b() {}\n');
    write('types.ts', 'export interface Shape {}\nexport type Size = 1;\n');
    write(
      'local.ts',
      "import {a as inner} from './values';\nexport {inner as renamed};\n",
    );
    write(
      'index.ts',
      [
        "export * from './values';",
        "export type {Shape} from './types';",
        "export {renamed} from './local';",
        "export * from './types';",
        'export const own = 2;',
        '',
      ].join('\n'),
    );
  });
  afterEach(() => {
    fs.rmSync(dir, {recursive: true, force: true});
  });

  it('gives the origin moduleExportOrigin gives for every name', () => {
    const index = path.join(dir, 'index.ts');
    for (const types of [false, true]) {
      const origins = moduleExportOrigins(index, {types});
      const names = ['a', 'b', 'renamed', 'own', 'Shape', 'Size'];
      for (const name of names) {
        expect(origins.get(name) ?? null, `${name} (types: ${types})`).toEqual(
          moduleExportOrigin(index, name, undefined, {types}),
        );
      }
    }
  });

  it('follows an alias of an imported binding to where that binding is declared', () => {
    const write = (name, text) => fs.writeFileSync(path.join(dir, name), text);
    write('inner.ts', 'export const Inner = {};\n');
    write(
      'alias.ts',
      "import {Inner as Provider} from './inner';\nexport const Public = Provider;\n",
    );
    const alias = path.join(dir, 'alias.ts');
    const inner = {file: path.join(dir, 'inner.ts'), name: 'Inner'};
    expect(moduleExportOrigin(alias, 'Public')).toEqual(inner);
    expect(moduleExportOrigins(alias).get('Public')).toEqual(inner);
  });

  it('agrees through an export * cycle', () => {
    const write = (name, text) => fs.writeFileSync(path.join(dir, name), text);
    write('c.ts', 'export const w = 1;\nexport const z = 2;\n');
    write('a.ts', "export * from './b';\nexport * from './c';\n");
    write('b.ts', "export * from './a';\n");
    const cycle = path.join(dir, 'cycle.ts');
    fs.writeFileSync(cycle, "export {w} from './a';\nexport * from './b';\n");
    const origins = moduleExportOrigins(cycle);
    for (const name of ['w', 'z']) {
      expect(origins.get(name) ?? null, name).toEqual(
        moduleExportOrigin(cycle, name),
      );
    }
    expect(origins.get('z')).toEqual({file: path.join(dir, 'c.ts'), name: 'z'});
  });

  it('agrees when a named re-export reaches back into an open cycle', () => {
    const write = (name, text) => fs.writeFileSync(path.join(dir, name), text);
    write('leaf.ts', 'export const leafValue = 1;\n');
    write('mid.ts', "export * from './outer';\n");
    const outer = path.join(dir, 'outer.ts');
    fs.writeFileSync(
      outer,
      "export {leafValue as fromRoot} from './mid';\nexport * from './leaf';\n",
    );
    expect(moduleExportOrigins(outer).get('fromRoot')).toEqual({
      file: path.join(dir, 'leaf.ts'),
      name: 'leafValue',
    });
  });

  it('agrees through a cycle closed by a named re-export', () => {
    const write = (name, text) => fs.writeFileSync(path.join(dir, name), text);
    write('leaf.ts', 'export const leafValue = 1;\n');
    write('sub.ts', "export {leafValue as fromRoot} from './root';\n");
    const root = path.join(dir, 'root.ts');
    fs.writeFileSync(root, "export * from './sub';\nexport * from './leaf';\n");
    expect(moduleExportOrigins(root).get('fromRoot')).toEqual({
      file: path.join(dir, 'leaf.ts'),
      name: 'leafValue',
    });
    expect(moduleExportOrigins(root).get('fromRoot')).toEqual(
      moduleExportOrigin(root, 'fromRoot'),
    );
  });

  it('lets a named export shadow export *, even when it cannot be followed', () => {
    const write = (name, text) => fs.writeFileSync(path.join(dir, name), text);
    write('other.ts', 'export const x = 1;\n');
    const shadow = path.join(dir, 'shadow.ts');
    fs.writeFileSync(
      shadow,
      [
        "import {x} from 'not-installed-pkg';",
        'export {x};',
        "export * from './other';",
        '',
      ].join('\n'),
    );
    expect(moduleExportOrigins(shadow).get('x') ?? null).toEqual(
      moduleExportOrigin(shadow, 'x'),
    );
    expect(moduleExportOrigins(shadow).has('x')).toBe(false);
  });

  it('keeps value and type reads apart in one memo', () => {
    const index = path.join(dir, 'index.ts');
    const memo = new Map();
    expect(moduleExportOrigins(index, {memo}).has('Shape')).toBe(false);
    expect(
      moduleExportOrigins(index, {types: true, memo}).get('Shape'),
    ).toEqual({
      file: path.join(dir, 'types.ts'),
      name: 'Shape',
    });
  });

  it('follows type-only exports only when asked', () => {
    const index = path.join(dir, 'index.ts');
    expect(moduleExportOrigins(index).has('Shape')).toBe(false);
    expect(moduleExportOrigins(index, {types: true}).get('Shape')).toEqual({
      file: path.join(dir, 'types.ts'),
      name: 'Shape',
    });
    expect(moduleExportOrigins(index).get('renamed')).toEqual({
      file: path.join(dir, 'values.ts'),
      name: 'a',
    });
  });
});
