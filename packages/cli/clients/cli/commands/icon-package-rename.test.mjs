// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon sets after the package is renamed in package.json: the next
 * command that writes the set gives the data file's `module` the new name,
 * so `integration check` passes without a hand edit.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {ICON_NAMES} from '../../../authoring/doctypes/icon-set/icon-names.mjs';

/** @type {string} */
let tmp;
/** @type {string} */
let pkg;

const LIBRARY = '@acme/glyph-library';

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-rename-'));
  pkg = path.join(tmp, 'icons');
  const lib = path.join(pkg, 'node_modules', ...LIBRARY.split('/'));
  fs.mkdirSync(lib, {recursive: true});
  fs.writeFileSync(
    path.join(lib, 'package.json'),
    JSON.stringify({
      name: LIBRARY,
      version: '2.0.0',
      license: 'MIT',
      type: 'module',
      exports: {'.': './index.js'},
    }),
  );
  fs.writeFileSync(path.join(lib, 'LICENSE'), 'MIT License\n');
  fs.writeFileSync(
    path.join(lib, 'index.js'),
    [
      'export function Bin(props) { return null; }',
      'export function Cross(props) { return null; }',
      '',
    ].join('\n'),
  );
  writePackage('@acme/old-icons');
  fs.writeFileSync(
    path.join(pkg, 'index.js'),
    "export * from './icon-sets/outline/outline.generated.js';\n",
  );
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** @param {string} name */
function writePackage(name) {
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify(
      {
        name,
        version: '1.0.0',
        license: 'MIT',
        type: 'module',
        exports: {'.': './index.js'},
        dependencies: {[LIBRARY]: '^2.0.0'},
      },
      null,
      2,
    ),
  );
}

/** @param {string[]} args */
async function json(args) {
  const res = await runCli([...args, '--json'], pkg);
  return {code: res.code, body: JSON.parse(res.stdout)};
}

const dataOf = () =>
  JSON.parse(
    fs.readFileSync(
      path.join(pkg, 'icon-sets', 'outline', 'outline.icons.json'),
      'utf-8',
    ),
  );

/** The pairs that map every built-in definition to `cross`. */
const ALL_PAIRS = ICON_NAMES.map(name => `${name}=cross`).join(',');

/** Wrap the library and map every built-in definition. */
async function wrapAndMap() {
  const wrapped = await json([
    'experimental',
    'icon',
    'new-set',
    'outline',
    '--from',
    LIBRARY,
  ]);
  expect(wrapped.code, JSON.stringify(wrapped.body)).toBe(0);
  const mapped = await json([
    'experimental',
    'icon',
    'map',
    '--pairs',
    ALL_PAIRS,
  ]);
  expect(mapped.code, JSON.stringify(mapped.body)).toBe(0);
  expect(dataOf().module).toBe('@acme/old-icons');
}

/**
 * Every issue the strict check reports and every failure, without the
 * skipped TypeScript work.
 */
async function strictFailures() {
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

describe('a renamed icon-set package', () => {
  it('map, run again with the same entries, writes the new package name', async () => {
    await wrapAndMap();
    expect(await strictFailures()).toEqual([]);
    writePackage('@acme/new-icons');
    const mapped = await json([
      'experimental',
      'icon',
      'map',
      '--pairs',
      ALL_PAIRS,
    ]);
    expect(mapped.code, JSON.stringify(mapped.body)).toBe(0);
    expect(dataOf().module).toBe('@acme/new-icons');
    expect(await strictFailures()).toEqual([]);
  });

  it('a refresh and an add each write the new package name', async () => {
    await wrapAndMap();
    for (const [name, run] of /** @type {Array<[string, string[]]>} */ ([
      ['@acme/refreshed', ['new-set', 'outline', '--from', LIBRARY]],
      [
        '@acme/added',
        ['add', 'Bin', '--from', LIBRARY, '--definition', 'delete'],
      ],
    ])) {
      writePackage(name);
      const done = await json(['experimental', 'icon', ...run]);
      expect(done.code, JSON.stringify(done.body)).toBe(0);
      expect(dataOf().module, run.join(' ')).toBe(name);
      expect(await strictFailures(), run.join(' ')).toEqual([]);
    }
  });
});

describe('receipts after a package rename', () => {
  const MODULE_LINE =
    '[ok] Updated module to "@acme/new-icons" (was "@acme/old-icons"), the package name in package.json.';

  /** @param {string[]} args */
  async function textOf(args) {
    const res = await runCli(['experimental', 'icon', ...args], pkg);
    expect(res.code, res.stdout + res.stderr).toBe(0);
    return res.stdout;
  }

  it('a repeated add says the icon is already there and reports the module rewrite', async () => {
    await wrapAndMap();
    await textOf(['add', 'Bin', '--from', LIBRARY, '--definition', 'delete']);
    writePackage('@acme/new-icons');
    const done = await json([
      'experimental',
      'icon',
      'add',
      'Bin',
      '--from',
      LIBRARY,
      '--definition',
      'delete',
    ]);
    expect(done.code, JSON.stringify(done.body)).toBe(0);
    expect(done.body.data).toMatchObject({
      added: false,
      changed: true,
      moduleUpdate: {previous: '@acme/old-icons', module: '@acme/new-icons'},
    });
    writePackage('@acme/old-icons');
    await textOf(['map', 'close', 'cross']);
    writePackage('@acme/new-icons');
    const out = await textOf([
      'add',
      'Bin',
      '--from',
      LIBRARY,
      '--definition',
      'delete',
    ]);
    expect(out).toContain(
      '[ok] BinIcon is already "bin" and map.delete names it.',
    );
    expect(out).toContain(MODULE_LINE);
    expect(out).not.toContain('Added');
  });

  it('a single map that changes no entry says so and reports the module rewrite', async () => {
    await wrapAndMap();
    writePackage('@acme/new-icons');
    const out = await textOf(['map', 'close', 'cross']);
    expect(out).toContain('[ok] map.close is already "cross".');
    expect(out).toContain(MODULE_LINE);
    expect(out).not.toContain('(was "cross")');
    expect(dataOf().module).toBe('@acme/new-icons');
  });

  it('map --remove on an unmapped definition says it has no entry and reports the module rewrite', async () => {
    await wrapAndMap();
    await textOf(['map', 'close', '--remove']);
    writePackage('@acme/new-icons');
    const res = await json([
      'experimental',
      'icon',
      'map',
      'close',
      '--remove',
    ]);
    expect(res.body.data).toMatchObject({
      previous: null,
      changed: true,
      moduleUpdate: {previous: '@acme/old-icons', module: '@acme/new-icons'},
    });
    writePackage('@acme/old-icons');
    await textOf(['map', 'search', '--remove']);
    writePackage('@acme/new-icons');
    const out = await textOf(['map', 'search', '--remove']);
    expect(out).toContain('has no map.search.');
    expect(out).toContain(MODULE_LINE);
    expect(out).not.toContain('Removed');
    expect(out).not.toContain('"null"');
  });

  it('--pairs words each entry from its previous icon and reports the module rewrite', async () => {
    await wrapAndMap();
    await textOf(['map', 'search', '--remove']);
    writePackage('@acme/new-icons');
    const out = await textOf([
      'map',
      '--pairs',
      'close=cross,menu=bin,search=bin',
    ]);
    expect(out).toContain('2 of 3 map entries changed');
    expect(out).toContain('close = "cross" (unchanged)');
    expect(out).toContain('menu = "bin" (was "cross")');
    expect(out).toContain('search = "bin" (was not mapped)');
    expect(out).toContain(MODULE_LINE);
    expect(dataOf().module).toBe('@acme/new-icons');
  });
});
