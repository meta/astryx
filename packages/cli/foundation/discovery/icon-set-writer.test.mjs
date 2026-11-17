// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Icon ids from export names (AST-084): a dimension stays one word. */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  entryWiringNote,
  generatedModuleText,
  iconIdOf,
  packageRootMoves,
  readGeneratedStatements,
} from './icon-set-writer.mjs';

describe('iconIdOf', () => {
  it.each([
    ['XMarkIcon', 'x-mark'],
    ['Trash2', 'trash-2'],
    ['ArrowUpDown', 'arrow-up-down'],
    ['Squares2X2Icon', 'squares-2x2'],
    ['Grid2x2', 'grid-2x2'],
    ['Grid2X2Check', 'grid-2x2-check'],
    ['Grid3x3', 'grid-3x3'],
    ['Tally5', 'tally-5'],
    ['H1Icon', 'h1'],
    ['Box', 'box'],
    ['CalendarX2', 'calendar-x-2'],
    ['MapPinXInside', 'map-pin-x-inside'],
    ['Heading1', 'heading-1'],
  ])('%s → %s', (name, id) => {
    expect(iconIdOf(name)).toBe(id);
  });
});

describe('generatedModuleText over a large library', () => {
  it('writes twenty thousand icons in one pass, and rewrites them unchanged', () => {
    const icons = Array.from({length: 20000}, (_, index) => ({
      name: `Glyph${index}Icon`,
      from: '@acme/big-library',
      source: `Glyph${index}Outline24Icon`,
      adapt: false,
    }));
    const data = /** @type {any} */ ({
      schemaVersion: 1,
      module: '@acme/big-icons',
      icons: [],
      map: {},
    });
    const started = Date.now();
    const first = generatedModuleText(
      '/pkg',
      'big.generated.js',
      null,
      data,
      icons,
    );
    const again = generatedModuleText(
      '/pkg',
      'big.generated.js',
      first.js,
      data,
      icons,
    );
    // Quadratic matching took minutes here; a single pass takes well under
    // a second.
    expect(Date.now() - started).toBeLessThan(5000);
    expect(again.js).toBe(first.js);
    expect(first.js).toContain(
      "export {Glyph19999Outline24Icon as Glyph19999Icon} from '@acme/big-library';",
    );
  });
});

describe('generatedModuleText marks its top-level calls pure', () => {
  const icons = [
    {
      name: 'TrashIcon',
      from: '@acme/glyph-data',
      source: 'glyphTrash',
      adapt: true,
    },
    {name: 'XIcon', from: '@acme/glyph-data', source: 'glyphX', adapt: true},
    {name: 'StarIcon', from: '@acme/star', source: 'StarIcon', adapt: false},
  ];
  const data = /** @type {any} */ ({
    schemaVersion: 1,
    module: '@acme/glyph-icons',
    adapter: {module: './src/adapt.js', export: 'adapt'},
    themeMap: 'themeIcons',
    icons: [
      {id: 'trash', export: 'TrashIcon'},
      {id: 'x', export: 'XIcon'},
      {id: 'star', export: 'StarIcon'},
    ],
    map: {close: 'x', delete: 'trash'},
  });
  const write = (/** @type {string | null} */ before) =>
    generatedModuleText('/pkg', 'glyph.generated.js', before, data, icons);
  const written = write(null);

  it('writes each adapter call and theme-map element with the mark, so a bundler drops the unused ones', () => {
    expect(written.js).toContain(
      'export const XIcon = /* @__PURE__ */ adaptIcon(XIconSource);',
    );
    expect(written.js).toContain('close: /* @__PURE__ */ createElement(XIcon,');
    expect(written.js).toContain("export {StarIcon} from '@acme/star';");
    const calls = written.js
      .split('\n')
      .filter(line => /^export const \w+ = |^ {2}\w+: /u.test(line))
      .filter(line => /\w\(/u.test(line));
    expect(calls.length).toBeGreaterThan(0);
    for (const line of calls)
      expect(line).toMatch(/\/\* @__PURE__ \*\/ \w+\(/u);
  });

  it.each([
    [
      'an older CLI wrote it, without marks',
      (/** @type {string} */ js) => js.replaceAll('/* @__PURE__ */ ', ''),
    ],
    [
      'a tool wrote the other spelling',
      (/** @type {string} */ js) =>
        js.replaceAll('/* @__PURE__ */ ', '/*#__PURE__*/'),
    ],
    [
      'a formatter moved the call to its own line',
      (/** @type {string} */ js) =>
        js
          .replaceAll(
            '= /* @__PURE__ */ adaptIcon(',
            '=\n  /* @__PURE__ */ adaptIcon(\n    ',
          )
          .replaceAll('Source);', 'Source,\n  );'),
    ],
  ])(
    'reads a module %s the same, and rewrites it with the marks',
    (_, restyle) => {
      const before = restyle(written.js);
      expect(before).not.toBe(written.js);
      expect(readGeneratedStatements(before, 'glyph.generated.js')).toEqual(
        readGeneratedStatements(written.js, 'glyph.generated.js'),
      );
      const again = write(before);
      expect(again.js).toBe(written.js);
      expect(again.dts).toBe(written.dts);
    },
  );

  it.each([
    ['as the CLI spells it', '/* @__PURE__ */ '],
    ['in the other spelling', '/*#__PURE__*/'],
  ])('keeps the mark of a statement written by hand %s', (_, mark) => {
    const before = `${written.js}export const BrandIcon = ${mark}makeBrand('brand');\n`;
    const again = write(before);
    expect(again.js).toContain(
      "export const BrandIcon = /* @__PURE__ */ makeBrand('brand');",
    );
    expect(write(again.js).js).toBe(again.js);
  });

  it('leaves a statement written by hand without a mark unmarked', () => {
    const before = `${written.js}export const BrandIcon = makeBrand('brand');\n`;
    expect(write(before).js).toContain(
      "export const BrandIcon = makeBrand('brand');",
    );
  });

  it('types the marked module as it types the unmarked one', () => {
    expect(written.dts).toContain(
      'export declare const XIcon: ComponentType<SVGProps<SVGSVGElement>>;',
    );
    expect(written.dts).toContain('readonly close: ReactElement');
    expect(written.dts).not.toContain('__PURE__');
  });
});

describe('entryWiringNote over a types file a formatter rewrote', () => {
  it.each([
    [
      'double quotes, no semicolon',
      'export * from "./icon-sets/brand/brand.generated.js"\n',
    ],
    [
      'the line as written',
      "export * from './icon-sets/brand/brand.generated.js';\n",
    ],
  ])('names no line the types file already has (%s)', (_, types) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-wiring-'));
    try {
      const pkg = {
        name: '@acme/icons',
        type: 'module',
        exports: {'.': {types: './index.d.ts', default: './index.js'}},
      };
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
      fs.writeFileSync(path.join(dir, 'index.js'), 'export {};\n');
      fs.writeFileSync(path.join(dir, 'index.d.ts'), types);
      expect(
        entryWiringNote(dir, pkg, './icon-sets/brand/brand.generated.js'),
      ).toBe(
        "Add `export * from './icon-sets/brand/brand.generated.js';` to index.js, so the icons import from @acme/icons.",
      );
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe('packageRootMoves', () => {
  it('moves an export to the root only when it reads the file the root exports; a name match counts only when the subpath does not resolve', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-root-moves-'));
    try {
      const lib = path.join(dir, 'node_modules', '@acme', 'glyphs');
      fs.mkdirSync(path.join(lib, 'solid'), {recursive: true});
      fs.writeFileSync(
        path.join(lib, 'package.json'),
        JSON.stringify({
          name: '@acme/glyphs',
          version: '1.0.0',
          type: 'module',
          exports: {
            '.': './index.js',
            './solid': './solid/index.js',
            './bin': './bin.js',
            './gone': './gone.js',
          },
        }),
      );
      fs.writeFileSync(
        path.join(lib, 'index.js'),
        "export {Bin as BinIcon} from './bin.js';\nexport {Cross} from './cross.js';\nexport {Star} from './star.js';\n",
      );
      fs.writeFileSync(path.join(lib, 'bin.js'), 'export const Bin = 1;\n');
      fs.writeFileSync(path.join(lib, 'cross.js'), 'export const Cross = 1;\n');
      fs.writeFileSync(path.join(lib, 'star.js'), 'export const Star = 1;\n');
      fs.writeFileSync(
        path.join(lib, 'solid', 'index.js'),
        'export const Cross = 2;\n',
      );
      const origins = new Map([
        // The same file and binding, under another name: it moves.
        ['BinOutlineIcon', {module: '@acme/glyphs/bin', source: 'Bin'}],
        // The same name, but other artwork: it stays.
        ['CrossSolidIcon', {module: '@acme/glyphs/solid', source: 'Cross'}],
        // The subpath does not resolve, so the name decides.
        ['StarIcon', {module: '@acme/glyphs/gone', source: 'Star'}],
        // Not a subpath of this package.
        ['SparkIcon', {module: './art/spark.js', source: 'Star'}],
        ['OtherIcon', {module: '@acme/other/star', source: 'Star'}],
      ]);
      const moves = packageRootMoves(
        origins,
        {file: path.join(lib, 'index.js'), module: '@acme/glyphs'},
        ['BinIcon', 'Cross', 'Star'],
        {packageDir: dir, pkg: {name: '@acme/icons'}},
      );
      expect(Object.fromEntries(moves)).toEqual({
        BinOutlineIcon: {source: 'BinIcon', from: '@acme/glyphs/bin'},
        StarIcon: {source: 'Star', from: '@acme/glyphs/gone'},
      });
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
