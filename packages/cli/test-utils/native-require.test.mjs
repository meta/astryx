// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every test that loads its code under test with `requireNatively`
 *   calls no Vitest module mock or reset. They do not reach a module that
 *   loads natively, so such a call would test nothing.
 */

import {describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from '@babel/parser';
import * as os from 'node:os';
import {requireNatively, stubBuiltin} from './native-require.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, '..');
const HELPER = path.join(HERE, 'native-require.mjs');

/**
 * Every test file under `dir`, outside dependency folders.
 * @param {string} dir
 * @returns {string[]}
 */
function testFiles(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return testFiles(full);
    return entry.name.endsWith('.test.mjs') ? [full] : [];
  });
}

/**
 * Calls `visit` on `node` and on every node under it.
 * @param {any} node
 * @param {(node: any) => void} visit
 */
function walk(node, visit) {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (typeof node.type === 'string') visit(node);
  for (const [key, child] of Object.entries(node)) {
    if (key !== 'loc' && key !== 'leadingComments') walk(child, visit);
  }
}

/** The `vi` calls that mock, reset or load around Vitest's module graph. */
const MODULE_CALLS = new Set([
  'mock',
  'doMock',
  'importActual',
  'importMock',
  'resetModules',
]);

/**
 * Whether `file` imports the helper, and each call in it that
 * {@link MODULE_CALLS} names, as `line: vi.mock`.
 * @param {string} file
 * @returns {{loadsNatively: boolean, mocks: string[]}}
 */
function nativeLoadsAndMocks(file) {
  const ast = parse(fs.readFileSync(file, 'utf8'), {
    sourceType: 'module',
    plugins: ['importAttributes'],
  });
  const loadsNatively = ast.program.body.some(
    (/** @type {any} */ node) =>
      node.type === 'ImportDeclaration' &&
      node.source.value.startsWith('.') &&
      path.resolve(path.dirname(file), node.source.value) === HELPER,
  );
  /** @type {string[]} */
  const mocks = [];
  walk(ast.program, node => {
    const callee = node.type === 'CallExpression' ? node.callee : null;
    if (
      callee?.type === 'MemberExpression' &&
      callee.object.type === 'Identifier' &&
      callee.object.name === 'vi' &&
      callee.property.type === 'Identifier' &&
      MODULE_CALLS.has(callee.property.name)
    ) {
      mocks.push(`${node.loc.start.line}: vi.${callee.property.name}`);
    }
  });
  return {loadsNatively, mocks};
}

describe('requireNatively', () => {
  it('is used by no test that mocks or resets a module', () => {
    /** @type {Record<string, string[]>} */
    const mocking = {};
    let users = 0;
    for (const file of testFiles(CLI)) {
      if (!fs.readFileSync(file, 'utf8').includes('native-require.mjs')) {
        continue;
      }
      const {loadsNatively, mocks} = nativeLoadsAndMocks(file);
      if (!loadsNatively) continue;
      users += 1;
      if (mocks.length) mocking[path.relative(CLI, file)] = mocks;
    }
    // The scan finds the tests that use the helper, so no mocks means
    // something.
    expect(users).toBeGreaterThan(0);
    expect(mocking).toEqual({});
  });

  it('finds each module mock and reset in a test that loads natively', () => {
    const planted = path.join(HERE, 'native-require.planted-mock.mjs');
    expect(nativeLoadsAndMocks(planted)).toEqual({
      loadsNatively: true,
      mocks: [
        '15: vi.mock',
        '16: vi.doMock',
        '17: vi.importActual',
        '18: vi.importMock',
        '19: vi.resetModules',
      ],
    });
  });
});

describe('stubBuiltin', () => {
  it('reaches natively loaded code, by name and by namespace, until restored', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-stub-builtin-'));
    try {
      const file = path.join(dir, 'uses-os.mjs');
      fs.writeFileSync(
        file,
        [
          "import {hostname} from 'node:os';",
          "import * as osModule from 'node:os';",
          'export const named = () => hostname();',
          'export const viaNamespace = () => osModule.hostname();',
          '',
        ].join('\n'),
      );
      /** @type {{named: () => string, viaNamespace: () => string}} */
      const uses = requireNatively(import.meta.url)(file);
      const restore = stubBuiltin('node:os', () => ({hostname: () => 'stub'}));
      try {
        expect([uses.named(), uses.viaNamespace()]).toEqual(['stub', 'stub']);
      } finally {
        restore();
      }
      expect([uses.named(), uses.viaNamespace()]).toEqual([
        os.hostname(),
        os.hostname(),
      ]);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
