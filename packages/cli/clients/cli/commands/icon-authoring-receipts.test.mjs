// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon-set authoring receipts and options (AST-084 FR13): the first
 * wrap of a library into a set with no icons says the set was created, a
 * long `add --all` list of missing icons is capped in text, and
 * `new-set --adapter` declares the adapter a data library needs.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';

/** @type {string} */
let tmp;
/** @type {string} */
let pkg;

const GLYPHS = [
  'alpha',
  'bravo',
  'charlie',
  'delta',
  'echo',
  'foxtrot',
  'golf',
  'hotel',
  'india',
  'juliet',
  'kilo',
  'lima',
  'mike',
];

/** @param {string} id */
const pascal = id => id[0].toUpperCase() + id.slice(1);

/**
 * A component library under node_modules with one component per glyph, and
 * a `./solid` subpath that draws only the first glyph.
 */
function writeLibrary() {
  const lib = path.join(pkg, 'node_modules', '@acme', 'glyph-library');
  fs.mkdirSync(lib, {recursive: true});
  fs.writeFileSync(
    path.join(lib, 'package.json'),
    JSON.stringify({
      name: '@acme/glyph-library',
      version: '2.0.0',
      type: 'module',
      exports: {'.': './index.js', './solid': './solid.js'},
    }),
  );
  fs.writeFileSync(
    path.join(lib, 'index.js'),
    GLYPHS.map(
      id => `export function ${pascal(id)}(props) { return null; }\n`,
    ).join(''),
  );
  fs.writeFileSync(
    path.join(lib, 'solid.js'),
    `export function ${pascal(GLYPHS[0])}(props) { return null; }\n`,
  );
}

/** A library whose icons are data objects, as some icon packages ship them. */
function writeDataLibrary() {
  const lib = path.join(pkg, 'node_modules', '@acme', 'glyph-data');
  fs.mkdirSync(lib, {recursive: true});
  fs.writeFileSync(
    path.join(lib, 'package.json'),
    JSON.stringify({
      name: '@acme/glyph-data',
      version: '1.0.0',
      type: 'module',
      exports: {'.': './index.js'},
    }),
  );
  fs.writeFileSync(
    path.join(lib, 'index.js'),
    [
      "export const faRocket = {iconName: 'rocket', icon: [24, 24, [], '', 'M0 0']};",
      "export const faHouse = {iconName: 'house', icon: [24, 24, [], '', 'M1 1']};",
      '',
    ].join('\n'),
  );
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-receipts-'));
  pkg = path.join(tmp, 'icons');
  fs.mkdirSync(pkg, {recursive: true});
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify(
      {
        name: '@acme/icons',
        version: '1.0.0',
        license: 'MIT',
        type: 'module',
        exports: {'.': './index.js'},
        dependencies: {
          '@acme/glyph-library': '^2.0.0',
          '@acme/glyph-data': '^1.0.0',
        },
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(pkg, 'index.js'), 'export {};\n');
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** @param {string[]} args */
async function json(args) {
  const res = await runCli([...args, '--json'], pkg);
  return {code: res.code, body: JSON.parse(res.stdout)};
}

/** @param {string} set */
const dataOf = set =>
  JSON.parse(
    fs.readFileSync(
      path.join(pkg, 'icon-sets', set, `${set}.icons.json`),
      'utf-8',
    ),
  );

describe('the first wrap of a library into a set with no icons', () => {
  it('says the set was created, and a later wrap says it was refreshed', async () => {
    writeLibrary();
    const empty = await runCli(
      ['experimental', 'icon', 'new-set', 'outline'],
      pkg,
    );
    expect(empty.code, empty.stdout).toBe(0);
    expect(empty.stdout).toContain('Icon set created');
    const wrap = [
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
    ];
    const plan = await runCli([...wrap, '--dry-run'], pkg);
    expect(plan.stdout).toContain('Icon set plan: it would be created');
    expect(plan.stdout).not.toContain('Refresh');
    const first = await runCli(wrap, pkg);
    expect(first.code, first.stdout).toBe(0);
    expect(first.stdout).toContain('Icon set created');
    expect(first.stdout).not.toContain('refreshed');
    expect(dataOf('outline').icons).toHaveLength(GLYPHS.length);
    const again = await json(wrap);
    expect(again.body.data.refreshed).toBe(true);
    const text = await runCli(wrap, pkg);
    expect(text.stdout).toContain('Icon set refreshed');
  });

  it('JSON: the first wrap into an empty set has no refreshed flag', async () => {
    writeLibrary();
    await json(['experimental', 'icon', 'new-set', 'outline']);
    const first = await json([
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
    ]);
    expect(first.code).toBe(0);
    expect(first.body.data.refreshed).toBeUndefined();
    expect(first.body.data.icons).toBe(GLYPHS.length);
  });
});

describe('add --variant --all with many icons the module lacks', () => {
  it('names the first ten and how many more in text; the JSON lists every one', async () => {
    writeLibrary();
    await json([
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
      '--variants',
      'outline,solid',
      '--default-variant',
      'outline',
    ]);
    const add = [
      'experimental',
      'icon',
      'add',
      '--variant',
      'solid',
      '--from',
      '@acme/glyph-library/solid',
      '--all',
      '--set',
      'outline',
    ];
    const {code, body} = await json(add);
    expect(code).toBe(0);
    expect(body.data.missing).toEqual(GLYPHS.slice(1));
    // Put the set back and read the text receipt of the same command.
    const data = dataOf('outline');
    data.icons = data.icons.map(
      (/** @type {Record<string, unknown>} */ icon) => {
        const {variants, ...rest} = icon;
        return rest;
      },
    );
    fs.writeFileSync(
      path.join(pkg, 'icon-sets', 'outline', 'outline.icons.json'),
      JSON.stringify(data, null, 2),
    );
    const text = await runCli(add, pkg);
    expect(text.code, text.stdout).toBe(0);
    expect(text.stdout).toContain(
      `12 icons have no solid export in @acme/glyph-library/solid and keep none: ${GLYPHS.slice(1, 11).join(', ')}, and 2 more (--json lists every one)`,
    );
    expect(text.stdout).not.toContain('lima,');
  });
});

describe('new-set --adapter', () => {
  it('declares the adapter, so a data library wraps with no hand edit', async () => {
    writeDataLibrary();
    fs.mkdirSync(path.join(pkg, 'src'), {recursive: true});
    fs.writeFileSync(
      path.join(pkg, 'src', 'adapt.js'),
      'export function adaptIcon(data) { return () => null; }\n',
    );
    const {code, body} = await json([
      'experimental',
      'icon',
      'new-set',
      'solid',
      '--from',
      '@acme/glyph-data',
      '--adapter',
      './src/adapt.js#adaptIcon',
    ]);
    expect(code, JSON.stringify(body)).toBe(0);
    expect(body.data.icons).toBe(2);
    const data = dataOf('solid');
    expect(data.adapter).toEqual({
      module: './src/adapt.js',
      export: 'adaptIcon',
    });
    expect(
      data.icons.map((/** @type {{id: string}} */ each) => each.id).sort(),
    ).toEqual(['house', 'rocket']);
    const generated = fs.readFileSync(
      path.join(pkg, 'icon-sets', 'solid', 'solid.generated.js'),
      'utf-8',
    );
    expect(generated).toContain('adaptIcon');
  });

  it('declares it on a set with no icons yet, and the next wrap uses it', async () => {
    writeDataLibrary();
    fs.mkdirSync(path.join(pkg, 'src'), {recursive: true});
    fs.writeFileSync(
      path.join(pkg, 'src', 'adapt.js'),
      'export function adaptIcon(data) { return () => null; }\n',
    );
    await json(['experimental', 'icon', 'new-set', 'solid']);
    const declared = await json([
      'experimental',
      'icon',
      'new-set',
      'solid',
      '--adapter',
      './src/adapt.js#adaptIcon',
    ]);
    expect(declared.code, JSON.stringify(declared.body)).toBe(0);
    expect(dataOf('solid').adapter).toEqual({
      module: './src/adapt.js',
      export: 'adaptIcon',
    });
    const wrapped = await json([
      'experimental',
      'icon',
      'new-set',
      'solid',
      '--from',
      '@acme/glyph-data',
    ]);
    expect(wrapped.code, JSON.stringify(wrapped.body)).toBe(0);
    expect(wrapped.body.data.icons).toBe(2);
  });

  it('refuses a malformed value or a file that does not exist, and writes nothing', async () => {
    writeDataLibrary();
    fs.mkdirSync(path.join(pkg, 'src'), {recursive: true});
    fs.writeFileSync(
      path.join(pkg, 'src', 'adapt.js'),
      'export function adaptIcon(data) { return () => null; }\n',
    );
    const bad = await json([
      'experimental',
      'icon',
      'new-set',
      'solid',
      '--adapter',
      'src/adapt.js',
    ]);
    expect(bad.code).not.toBe(0);
    expect(bad.body.code).toBe('ERR_INVALID_ARGUMENT');
    for (const module of [
      './src/./adapt.js',
      './src/../src/adapt.js',
      './src//adapt.js',
      './src/adapt+x.js',
    ]) {
      const refused = await json([
        'experimental',
        'icon',
        'new-set',
        'solid',
        '--from',
        '@acme/glyph-data',
        '--adapter',
        `${module}#adaptIcon`,
      ]);
      expect(refused.body.code, module).toBe('ERR_INVALID_ARGUMENT');
    }
    const missing = await json([
      'experimental',
      'icon',
      'new-set',
      'solid',
      '--adapter',
      './src/nope.js#adaptIcon',
    ]);
    expect(missing.body.code).toBe('ERR_NOT_FOUND');
    expect(fs.existsSync(path.join(pkg, 'icon-sets'))).toBe(false);
  });
});
