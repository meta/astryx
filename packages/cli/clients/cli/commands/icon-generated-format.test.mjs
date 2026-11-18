// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon sets whose generated module and declaration file a project
 * formatter rewrote (Prettier re-wraps long lines, and may drop semicolons
 * and switch quotes): `integration check --strict` still passes, and a real
 * change to a declared export still fails it.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as prettier from 'prettier';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {ICON_NAMES} from '../../../authoring/doctypes/icon-set/icon-names.mjs';

/** @type {string} */
let tmp;
/** @type {string} */
let pkg;

const LIBRARY = '@acme/glyph-data';
const COMPONENTS = '@acme/glyph-components';

/**
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
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-formatted-'));
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
        dependencies: {[LIBRARY]: '^1.0.0', [COMPONENTS]: '^1.0.0'},
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(pkg, 'src', 'adapt.js'),
    'export function adapt(data) { return () => null; }\n',
  );
  fs.writeFileSync(
    path.join(pkg, 'index.js'),
    "export * from './icon-sets/glyphs/glyphs.generated.js';\n",
  );
  // Long names make every kind of generated line wrap at 80 columns.
  writeLibrary(
    LIBRARY,
    [
      "export const glyphMagnifyingGlassWithPlusSign = {path: 'M0 0'};",
      "export const glyphArrowsPointingOutwardDiagonal = {path: 'M1 1'};",
      "export const glyphX = {path: 'M2 2'};",
      '',
    ].join('\n'),
  );
  writeLibrary(
    COMPONENTS,
    [
      'export function CalendarDaysWithClockOverlayOutline(props) { return null; }',
      'export function HomeModern(props) { return null; }',
      '',
    ].join('\n'),
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

const setFile = (/** @type {string} */ ext) =>
  path.join(pkg, 'icon-sets', 'glyphs', `glyphs.${ext}`);

/** A set of adapted data icons and component re-exports, fully mapped. */
async function writeSet() {
  const created = await json(['experimental', 'icon', 'new-set', 'glyphs']);
  expect(created.code, JSON.stringify(created.body)).toBe(0);
  const data = JSON.parse(fs.readFileSync(setFile('icons.json'), 'utf-8'));
  data.adapter = {module: './src/adapt.js', export: 'adapt'};
  fs.writeFileSync(setFile('icons.json'), JSON.stringify(data));
  for (const args of [
    ['new-set', 'glyphs', '--from', LIBRARY],
    [
      'add',
      'CalendarDaysWithClockOverlayOutline',
      '--from',
      COMPONENTS,
      '--definition',
      'calendar',
    ],
    ['add', 'HomeModern', '--from', COMPONENTS, '--definition', 'home'],
    ['map', '--pairs', ICON_NAMES.map(name => `${name}=x`).join(',')],
  ]) {
    const done = await json(['experimental', 'icon', ...args]);
    expect(done.code, `${args[0]}: ${JSON.stringify(done.body)}`).toBe(0);
  }
}

/**
 * Format the generated module and its declaration file in place.
 * @param {import('prettier').Options} options
 */
async function formatGenerated(options) {
  for (const ext of ['generated.js', 'generated.d.ts']) {
    const file = setFile(ext);
    const text = fs.readFileSync(file, 'utf-8');
    fs.writeFileSync(
      file,
      await prettier.format(text, {filepath: file, printWidth: 80, ...options}),
    );
  }
}

/**
 * The codes the strict check reports: every issue of every check, and every
 * failure except the skipped TypeScript work.
 */
async function strictCodes() {
  const res = await runCli(['integration', 'check', '--strict', '--json'], pkg);
  const {checks, failures} = JSON.parse(res.stdout).data;
  return [
    ...checks.flatMap(
      (/** @type {any} */ each) => each.response?.data?.issues ?? [],
    ),
    ...failures,
  ]
    .map((/** @type {{code: string}} */ each) => each.code)
    .filter((/** @type {string} */ code) => code !== 'doc_types_skipped');
}

describe('generated files a formatter rewrote', () => {
  it.each([
    ['Prettier defaults at 80 columns', {}],
    ['no semicolons and single quotes', {semi: false, singleQuote: true}],
  ])(
    'the strict check passes after %s, and fails on a changed export name',
    async (_, options) => {
      await writeSet();
      expect(await strictCodes()).toEqual([]);
      await formatGenerated(options);
      const types = fs.readFileSync(setFile('generated.d.ts'), 'utf-8');
      // The formatter really re-wrapped a long type argument.
      expect(types).toMatch(/ComponentType<\n\s+SVGProps<SVGSVGElement>\n>/u);
      expect(await strictCodes()).toEqual([]);
      fs.writeFileSync(
        setFile('generated.d.ts'),
        types.replace('HomeModernIcon', 'HomeModernGlyph'),
      );
      expect(await strictCodes()).toContain('icon_generated_types_mismatch');
    },
  );
});
