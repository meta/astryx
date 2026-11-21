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
  linkedPackageOf,
  packageLookups,
  packageModuleUrl,
  packageResolveHooks,
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
  // A package linked from outside node_modules, as a workspace or `npm link`
  // links one, by a relative link and by an absolute one.
  put(
    'linked/lib/package.json',
    JSON.stringify({
      name: '@scope/linked',
      type: 'module',
      exports: {'.': './dist/index.js', './sub': './dist/sub.js'},
    }),
  );
  put(
    'linked/lib/dist/index.js',
    "export {a} from './a.js';\nexport {s, c} from './sub.js';\n",
  );
  put('linked/lib/dist/a.js', "export const a = 'a';\n");
  put(
    'linked/lib/dist/sub.js',
    "export {c} from './inner/c.js';\nexport const s = 's';\n",
  );
  put('linked/lib/dist/inner/c.js', "export const c = 'c';\n");
  put(
    'linked/lib/dist/legacy/package.json',
    JSON.stringify({type: 'commonjs'}),
  );
  put('linked/lib/dist/legacy/l.js', "exports.l = 'l';\n");
  put(
    'linked/lib/dist/stray/package.json',
    JSON.stringify({name: 'stray', type: 'module'}),
  );
  put('linked/lib/dist/stray/x.js', "export const x = 'x';\n");
  put(
    'linked/lib/node_modules/vend/v.js',
    "module.exports = {vend: 'linked'};\n",
  );
  fs.symlinkSync(
    path.join(dir, 'linked', 'lib', 'dist', 'a.js'),
    path.join(dir, 'linked', 'lib', 'dist', 'alias.js'),
  );
  put(
    'linked/lib/dist/edges.js',
    [
      "export {l} from './legacy/l.js';",
      "export {x} from './stray/x.js';",
      "export {a as viaLink} from './alias.js';",
      "import v from '../node_modules/vend/v.js';",
      'export {v};',
      '',
    ].join('\n'),
  );
  fs.symlinkSync(
    path.join('..', '..', 'linked', 'lib'),
    path.join(dir, 'node_modules', '@scope', 'linked'),
  );
  put(
    'linked/abs/package.json',
    JSON.stringify({
      name: 'abs-linked',
      type: 'module',
      exports: './dist/main.js',
    }),
  );
  put('linked/abs/dist/main.js', "export {b} from './b.js';\n");
  put('linked/abs/dist/b.js', "export const b = 'b';\n");
  fs.symlinkSync(
    path.join(dir, 'linked', 'abs'),
    path.join(dir, 'node_modules', 'abs-linked'),
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

describe('a linked package', () => {
  const lib = () => path.join(dir, 'linked', 'lib');
  /** @param {string} file */
  const linkedUrl = file => pathToFileURL(path.join(lib(), file)).href;
  /** Resolve `specifier` from `parent` through the hooks, with Node's answer given. @param {any} hooks @param {string} specifier @param {string} url */
  const through = (hooks, specifier, url) =>
    hooks.resolve(
      specifier,
      {parentURL: pathToFileURL(path.join(dir, 'page', 'page.js')).href},
      () => ({url, format: 'module'}),
    );

  it('is noted from a bare import Node resolved outside node_modules, by its package.json name', () => {
    const lookups = packageLookups();
    const hooks = packageResolveHooks(lookups);
    const answer = through(
      hooks,
      '@scope/linked/sub',
      linkedUrl('dist/sub.js'),
    );
    expect(answer).toEqual({url: linkedUrl('dist/sub.js'), format: 'module'});
    expect(linkedPackageOf(path.join(lib(), 'dist', 'a.js'), lookups)).toBe(
      lib(),
    );
    expect(
      packageModuleUrl('./a.js', linkedUrl('dist/index.js'), lookups),
    ).toBe(linkedUrl('dist/a.js'));
    expect(
      packageModuleUrl('./inner/c.js', linkedUrl('dist/sub.js'), lookups),
    ).toBe(linkedUrl('dist/inner/c.js'));
  });

  it('is not noted from a file whose nearest package.json names another package, or from a folder skipped', () => {
    const lookups = packageLookups();
    // The nearest package.json of a file in a folder of its own names that
    // folder's package, not the one the import names.
    through(
      packageResolveHooks(lookups),
      '@scope/linked',
      linkedUrl('dist/stray/x.js'),
    );
    through(
      packageResolveHooks(lookups, {skip: f => f === lib() + path.sep}),
      '@scope/linked',
      linkedUrl('dist/index.js'),
    );
    expect(lookups.linked.size).toBe(0);
    expect(
      packageModuleUrl('./a.js', linkedUrl('dist/index.js'), lookups),
    ).toBeNull();
  });

  it('leaves to Node every import inside it that Node answers otherwise', () => {
    const lookups = packageLookups();
    through(
      packageResolveHooks(lookups),
      '@scope/linked',
      linkedUrl('dist/index.js'),
    );
    for (const specifier of [
      './legacy/l.js',
      './alias.js',
      '../node_modules/vend/v.js',
      './nope.js',
      './a',
      '../package.json',
    ]) {
      expect(
        packageModuleUrl(specifier, linkedUrl('dist/edges.js'), lookups),
        specifier,
      ).toBeNull();
    }
    expect(
      linkedPackageOf(
        path.join(lib(), 'node_modules', 'vend', 'v.js'),
        lookups,
      ),
    ).toBeNull();
  });
});

/**
 * Import each specifier from the fixture in one fresh Node, with or without
 * the hook, and print every import Node resolved (its specifier, the URL and
 * format it resolved to) and what each import gave or how it failed.
 * @param {string[]} specifiers
 * @param {boolean} hook
 */
const resolutionsIn = (specifiers, hook) => {
  const code = [
    "const {registerHooks} = await import('node:module');",
    hook
      ? `const {packageLookups, packageResolveHooks} = await import(${JSON.stringify(HOOKS)}); globalThis.lookups = packageLookups(); registerHooks(packageResolveHooks(globalThis.lookups));`
      : '',
    'const seen = [];',
    'registerHooks({resolve(s, c, next) { const r = next(s, c); seen.push([s, c.parentURL ?? null, r.url, r.format ?? null]); return r; }});',
    `for (const s of ${JSON.stringify(specifiers)}) {`,
    '  try { const m = await import(s); seen.push([s, JSON.stringify(Object.entries(m).sort())]); }',
    '  catch (e) { seen.push([s, e.code, String(e.message).replace(/\\s+/g, " ")]); }',
    '}',
    'console.log(JSON.stringify({seen, linked: [...(globalThis.lookups?.linked ?? [])].length, typed: globalThis.lookups?.types.size ?? 0}));',
  ].join('\n');
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: dir,
    encoding: 'utf8',
  });
  return r.stdout.trim();
};

describe.skipIf(!hasHooks)('a linked package through the hook', () => {
  it('resolves every import to the URL and format Node gives with no hook', () => {
    const specifiers = [
      '@scope/linked',
      '@scope/linked/sub',
      pathToFileURL(path.join(dir, 'linked', 'lib', 'dist', 'edges.js')).href,
      'abs-linked',
    ];
    const plain = JSON.parse(resolutionsIn(specifiers, false));
    const hooked = JSON.parse(resolutionsIn(specifiers, true));
    expect(plain.seen.length).toBeGreaterThan(specifiers.length);
    expect(hooked.seen).toEqual(plain.seen);
    // The hook noted both linked packages and answered imports inside them.
    expect(hooked.linked).toBe(2);
    expect(hooked.typed).toBeGreaterThan(0);
  }, 60_000);
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
