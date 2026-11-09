// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon sets over library exports whose names start with a digit once
 * the library prefix comes off (`fa0`, `Digit1Icon`): every export name the
 * CLI writes is a valid JavaScript name, and the set passes the strict check.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {parse} from '@babel/parser';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {ICON_NAMES} from '../../../authoring/doctypes/icon-set/icon-names.mjs';

/** @type {string} */
let tmp;
/** @type {string} */
let pkg;

const IDENTIFIER_RE = /^[$A-Z_a-z][$\w]*$/u;

/**
 * Write a library under node_modules, with a license file.
 * @param {string} name
 * @param {string} source its index.js
 */
function writeLibrary(name, source) {
  const lib = path.join(pkg, 'node_modules', ...name.split('/'));
  fs.mkdirSync(lib, {recursive: true});
  fs.writeFileSync(
    path.join(lib, 'package.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      license: 'MIT',
      type: 'module',
      exports: {'.': './index.js'},
    }),
  );
  fs.writeFileSync(path.join(lib, 'LICENSE'), 'MIT License\n');
  fs.writeFileSync(path.join(lib, 'index.js'), source);
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-digits-'));
  pkg = path.join(tmp, 'icons');
  fs.mkdirSync(path.join(pkg, 'src'), {recursive: true});
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
          '@acme/glyph-data': '^1.0.0',
          '@acme/digits': '^1.0.0',
          '@acme/more-digits': '^1.0.0',
        },
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(pkg, 'src', 'adapt.js'),
    'export function adapt(data) { return () => null; }\n',
  );
  writeLibrary(
    '@acme/glyph-data',
    [
      "export const fa0 = {prefix: 'fas', iconName: '0', icon: [320, 512, [], '30', 'M0 0']};",
      "export const fa1 = {prefix: 'fas', iconName: '1', icon: [320, 512, [], '31', 'M0 1']};",
      "export const faXmark = {prefix: 'fas', iconName: 'xmark', icon: [384, 512, [], 'f00d', 'M1 1']};",
      "export const faHouse = {prefix: 'fas', iconName: 'house', icon: [576, 512, [], 'f015', 'M2 2']};",
      '',
    ].join('\n'),
  );
  writeLibrary(
    '@acme/digits',
    [
      'export function Digit1Icon(props) { return null; }',
      'export function Digit2Icon(props) { return null; }',
      '',
    ].join('\n'),
  );
  writeLibrary(
    '@acme/more-digits',
    'export function Digit1Icon(props) { return null; }\n',
  );
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** @param {string[]} args */
async function json(args) {
  const res = await runCli([...args, '--json'], pkg);
  return {code: res.code, body: JSON.parse(res.stdout)};
}

/** @param {string} set @param {string} ext */
const setFile = (set, ext) => path.join(pkg, 'icon-sets', set, `${set}.${ext}`);

/** @param {string} set */
const dataOf = set =>
  JSON.parse(fs.readFileSync(setFile(set, 'icons.json'), 'utf-8'));

/**
 * Every export name the set writes: the data file's exports and variants,
 * and each name the generated module and its declaration file declare. Both
 * files must parse.
 * @param {string} set
 */
function writtenNames(set) {
  const data = dataOf(set);
  const names = data.icons.flatMap((/** @type {any} */ icon) => [
    icon.export,
    ...(icon.variants ?? []).map((/** @type {any} */ each) => each.export),
  ]);
  for (const ext of ['generated.js', 'generated.d.ts']) {
    const text = fs.readFileSync(setFile(set, ext), 'utf-8');
    const ast = parse(text, {sourceType: 'module', plugins: ['typescript']});
    for (const node of ast.program.body) {
      if (node.type !== 'ExportNamedDeclaration') continue;
      for (const specifier of node.specifiers) {
        if (specifier.exported.type === 'Identifier') {
          names.push(specifier.exported.name);
        }
      }
      if (node.declaration?.type === 'VariableDeclaration') {
        for (const each of node.declaration.declarations) {
          if (each.id.type === 'Identifier') names.push(each.id.name);
        }
      }
    }
  }
  return names;
}

/**
 * Map every built-in definition to one icon, wire the entry, and run the
 * strict check. Returns every issue it reports and every failure, without the skipped
 * TypeScript work.
 * @param {string} set
 * @param {string} icon
 */
async function strictFailures(set, icon) {
  const mapped = await json([
    'experimental',
    'icon',
    'map',
    '--set',
    set,
    '--pairs',
    ICON_NAMES.map(name => `${name}=${icon}`).join(','),
  ]);
  expect(mapped.code, JSON.stringify(mapped.body)).toBe(0);
  fs.writeFileSync(
    path.join(pkg, 'index.js'),
    `export * from './icon-sets/${set}/${set}.generated.js';\n`,
  );
  const res = await runCli(['integration', 'check', '--strict', '--json'], pkg);
  const {checks, failures} = JSON.parse(res.stdout).data;
  return [
    ...checks.flatMap(
      (/** @type {any} */ each) => each.response?.data?.issues ?? [],
    ),
    ...failures,
  ]
    .filter(
      (/** @type {{code: string}} */ each) => each.code !== 'doc_types_skipped',
    )
    .map(
      (/** @type {{code: string, message: string}} */ each) =>
        `${each.code}: ${each.message}`,
    );
}

describe('library names that start with a digit once the prefix comes off', () => {
  it('a library of icon data objects with digit glyphs (`fa0`) gets valid export names and passes the strict check', async () => {
    const created = await json(['experimental', 'icon', 'new-set', 'solid']);
    expect(created.code, JSON.stringify(created.body)).toBe(0);
    const data = dataOf('solid');
    data.adapter = {module: './src/adapt.js', export: 'adapt'};
    fs.writeFileSync(setFile('solid', 'icons.json'), JSON.stringify(data));
    const wrapped = await json([
      'experimental',
      'icon',
      'new-set',
      'solid',
      '--from',
      '@acme/glyph-data',
    ]);
    expect(wrapped.code, JSON.stringify(wrapped.body)).toBe(0);
    expect(
      dataOf('solid').icons.map((/** @type {any} */ i) => [i.id, i.export]),
    ).toEqual([
      ['0', 'Digit0Icon'],
      ['1', 'Digit1Icon'],
      ['house', 'HouseIcon'],
      ['xmark', 'XmarkIcon'],
    ]);
    const names = writtenNames('solid');
    expect(names).toContain('Digit0Icon');
    expect(names.filter(name => !IDENTIFIER_RE.test(name))).toEqual([]);
    expect(await strictFailures('solid', 'xmark')).toEqual([]);
  });

  it('a component library whose only shared word is `Digit` keeps valid names, also for an icon added under a digit id', async () => {
    const created = await json([
      'experimental',
      'icon',
      'new-set',
      'digits',
      '--from',
      '@acme/digits',
    ]);
    expect(created.code, JSON.stringify(created.body)).toBe(0);
    expect(
      dataOf('digits').icons.map((/** @type {any} */ i) => [i.id, i.export]),
    ).toEqual([
      ['1', 'Digit1Icon'],
      ['2', 'Digit2Icon'],
    ]);
    const added = await json([
      'experimental',
      'icon',
      'add',
      'Digit1Icon',
      '--from',
      '@acme/more-digits',
      '--id',
      '7',
      '--definition',
      'close',
    ]);
    expect(added.code, JSON.stringify(added.body)).toBe(0);
    const names = writtenNames('digits');
    expect(names).toContain('Digit7Icon');
    expect(names.filter(name => !IDENTIFIER_RE.test(name))).toEqual([]);
    expect(await strictFailures('digits', '1')).toEqual([]);
  });
});
