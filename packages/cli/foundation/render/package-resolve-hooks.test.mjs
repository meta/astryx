// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the export worker's package resolve hook: it answers only
 * a relative, fully specified ES module import between two files of one
 * installed package, as Node resolves it, and every other import resolves as
 * Node resolves it with no hook.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import nodeModule from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  installedPackageOf,
  packageLookups,
  packageModuleUrl,
} from './package-resolve-hooks.mjs';

const HOOKS = new URL('./package-resolve-hooks.mjs', import.meta.url).href;
const hasHooks =
  typeof (/** @type {any} */ (nodeModule).registerHooks) === 'function';

/** @type {string} */
let dir;
/** @type {string} */
let pkg;

/** @param {string} name @param {string} text */
const put = (name, text) => {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text);
  return file;
};

beforeAll(() => {
  dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-package-resolve-')),
  );
  pkg = path.join(dir, 'node_modules', '@scope', 'lib');
  put(
    'node_modules/@scope/lib/package.json',
    JSON.stringify({
      name: '@scope/lib',
      type: 'module',
      exports: {'.': './dist/index.js'},
    }),
  );
  put(
    'node_modules/@scope/lib/dist/index.js',
    "export {b} from './b.js';\nexport {c} from './cjs/c.cjs';\nexport {m} from './m.mjs';\n",
  );
  put('node_modules/@scope/lib/dist/b.js', "export const b = 'b';\n");
  put('node_modules/@scope/lib/dist/m.mjs', "export const m = 'm';\n");
  put('node_modules/@scope/lib/dist/cjs/c.cjs', "exports.c = 'c';\n");
  put(
    'node_modules/@scope/lib/dist/legacy/package.json',
    JSON.stringify({type: 'commonjs'}),
  );
  put('node_modules/@scope/lib/dist/legacy/l.js', "exports.l = 'l';\n");
  put('node_modules/@scope/lib/dist/notype/package.json', JSON.stringify({}));
  put('node_modules/@scope/lib/dist/notype/n.js', "export const n = 'n';\n");
  fs.mkdirSync(path.join(pkg, 'dist', 'folder'), {recursive: true});
  put('node_modules/@scope/lib/dist/folder/index.js', 'export default 1;\n');
  fs.symlinkSync(
    path.join(pkg, 'dist', 'b.js'),
    path.join(pkg, 'dist', 'link.js'),
  );
  put(
    'node_modules/other/package.json',
    JSON.stringify({name: 'other', type: 'module'}),
  );
  put('node_modules/other/o.js', "export const o = 'o';\n");
  put('page/page.js', "export const p = 'p';\n");
  put(
    'node_modules/@scope/lib/node_modules/vend/x.js',
    "module.exports = {vend: 'cjs'};\n",
  );
});

afterAll(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/** @param {string} file */
const urlOf = file => pathToFileURL(path.join(pkg, file)).href;

describe('installedPackageOf', () => {
  it('names the package folder after the last node_modules, scoped or not', () => {
    expect(installedPackageOf(path.join(pkg, 'dist', 'b.js'))).toBe(pkg);
    expect(
      installedPackageOf(path.join(dir, 'node_modules', 'other', 'o.js')),
    ).toBe(path.join(dir, 'node_modules', 'other'));
    expect(installedPackageOf(path.join(dir, 'page', 'page.js'))).toBeNull();
    expect(
      installedPackageOf(path.join(dir, 'node_modules', 'loose.js')),
    ).toBeNull();
  });
});

describe('packageModuleUrl', () => {
  const from = () => urlOf('dist/index.js');

  it('answers a relative, fully specified ES module import inside the package', () => {
    const lookups = packageLookups();
    expect(packageModuleUrl('./b.js', from(), lookups)).toBe(
      urlOf('dist/b.js'),
    );
    expect(packageModuleUrl('./m.mjs', from(), lookups)).toBe(
      urlOf('dist/m.mjs'),
    );
    expect(packageModuleUrl('../package.json', from(), lookups)).toBeNull();
  });

  it('leaves to Node every import it would answer differently or not at all', () => {
    const lookups = packageLookups();
    for (const specifier of [
      './nope.js',
      './folder',
      './folder/',
      './b',
      './b.js?x=1',
      './b.js#x',
      './%62.js',
      './link.js',
      './cjs/c.cjs',
      './legacy/l.js',
      './notype/n.js',
      '../../other/o.js',
      '../node_modules/vend/x.js',
      '#internal',
      '@scope/lib',
      'other',
      'node:fs',
    ]) {
      expect(
        packageModuleUrl(specifier, from(), lookups),
        specifier,
      ).toBeNull();
    }
  });

  it('never answers an import from a file outside an installed package', () => {
    const page = pathToFileURL(path.join(dir, 'page', 'page.js')).href;
    expect(packageModuleUrl('./page.js', page, packageLookups())).toBeNull();
    expect(packageModuleUrl('./b.js', undefined, packageLookups())).toBeNull();
    expect(
      packageModuleUrl('./b.js', 'data:text/javascript,1', packageLookups()),
    ).toBeNull();
  });
});

/**
 * Import `specifier` from the fixture in a fresh Node, with or without the
 * hook, and print what it gave or how it failed.
 * @param {string} specifier
 * @param {boolean} hook
 */
const importIn = (specifier, hook) => {
  const code = [
    hook
      ? `const {registerHooks} = await import('node:module'); const {packageResolveHooks} = await import(${JSON.stringify(HOOKS)}); registerHooks(packageResolveHooks());`
      : '',
    `try { const m = await import(${JSON.stringify(specifier)}); console.log(JSON.stringify(Object.entries(m).sort())); }`,
    'catch (e) { console.log(e.code, String(e.message).replace(/\\s+/g, " ")); }',
  ].join('\n');
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: dir,
    encoding: 'utf8',
  });
  return r.stdout.trim();
};

describe.skipIf(!hasHooks)('an import through the hook', () => {
  it('gives the same modules and the same errors as Node with no hook', () => {
    const broken = put(
      'node_modules/@scope/lib/dist/broken.js',
      "export {gone} from './gone.js';\n",
    );
    const toFolder = put(
      'node_modules/@scope/lib/dist/to-folder.js',
      "export {default} from './folder';\n",
    );
    const bare = put(
      'node_modules/@scope/lib/dist/bare.js',
      "export {b} from './b';\n",
    );
    const linked = put(
      'node_modules/@scope/lib/dist/linked.js',
      "export {b} from './link.js';\n",
    );
    const nested = put(
      'node_modules/@scope/lib/dist/nested.js',
      "import v from '../node_modules/vend/x.js';\nexport default v;\n",
    );
    for (const specifier of [
      '@scope/lib',
      pathToFileURL(broken).href,
      pathToFileURL(toFolder).href,
      pathToFileURL(bare).href,
      pathToFileURL(linked).href,
      pathToFileURL(nested).href,
      urlOf('dist/legacy/l.js'),
      urlOf('dist/notype/n.js'),
    ]) {
      const plain = importIn(specifier, false);
      expect(plain, specifier).not.toBe('');
      expect(importIn(specifier, true), specifier).toBe(plain);
    }
  }, 60_000);
});
