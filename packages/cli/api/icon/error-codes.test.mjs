// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every error code each icon API function documents (spec:AST-042 FR2,
 * AST-084): one case per function and code, each asserting the code the
 * function's reference doc lists, and a check that the docs list exactly the
 * codes these cases raise.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  writeIconPackage,
  writeIconSetProject,
} from '../../test-utils/icon-set-fixture.mjs';

// The manifest's root changes between the dry run and the write when a case
// sets `conflict.root`: the write then meets a root it did not plan for.
const conflict = vi.hoisted(() => ({
  root: /** @type {string | null} */ (null),
}));
vi.mock(
  '../../foundation/integrations/manifest-writer.mjs',
  async importOriginal => {
    const actual =
      /** @type {typeof import('../../foundation/integrations/manifest-writer.mjs')} */ (
        await importOriginal()
      );
    return {
      ...actual,
      /** @type {typeof actual.patchIntegrationRoot} */
      patchIntegrationRoot: async (packageDir, key, rootPath, options) => {
        if (conflict.root && !options?.dryRun) {
          fs.writeFileSync(
            path.join(packageDir, 'astryx.integration.mjs'),
            `export default {experimental: {iconSets: '${conflict.root}'}};\n`,
          );
        }
        return actual.patchIntegrationRoot(packageDir, key, rootPath, options);
      },
    };
  },
);

const {icon} = await import('./icon.mjs');
const {iconAdd} = await import('./add/add.mjs');
const {iconMap} = await import('./map/map.mjs');
const {iconUse} = await import('./use/use.mjs');
const {iconNewSet} = await import('./new-set/new-set.mjs');
const {iconNewDefinition} = await import('./new-definition/new-definition.mjs');

/** @type {string} */
let tmp;
/** @type {string[]} */
let locked;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-errors-'));
  locked = [];
  conflict.root = null;
});
afterEach(() => {
  for (const dir of locked) fs.chmodSync(dir, 0o755);
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** A fresh folder: no package.json above it and no project. */
function outside() {
  return fs.mkdtempSync(path.join(tmp, 'outside-'));
}

/** The icon-set package `@acme/glyphs`, with its set `glyphs`. */
function pkg() {
  const dir = path.join(fs.mkdtempSync(path.join(tmp, 'pkg-')), 'glyphs');
  writeIconPackage(dir);
  return dir;
}

/** A package with a name and no icon set yet. @returns {string} */
function bare() {
  const dir = fs.mkdtempSync(path.join(tmp, 'bare-'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: '@acme/bare', version: '1.0.0'}),
  );
  return dir;
}

/** @param {Parameters<typeof writeIconSetProject>[1]} [options] */
function app(options) {
  return writeIconSetProject(fs.mkdtempSync(path.join(tmp, 'app-')), options);
}

/** A folder nothing may write into, unlocked after the test. @param {string} dir */
function lock(dir) {
  fs.mkdirSync(dir, {recursive: true});
  fs.chmodSync(dir, 0o555);
  locked.push(dir);
}

/** @param {string} dir @param {string} text */
function manifest(dir, text) {
  fs.writeFileSync(path.join(dir, 'astryx.integration.mjs'), text);
}

/** @param {string} dir */
function withSecondSet(dir) {
  const from = path.join(dir, 'icon-sets', 'glyphs');
  const to = path.join(dir, 'icon-sets', 'extra');
  fs.mkdirSync(to);
  fs.writeFileSync(
    path.join(to, 'extra.doc.mjs'),
    fs
      .readFileSync(path.join(from, 'glyphs.doc.mjs'), 'utf8')
      .replace('"glyphs"', '"extra"'),
  );
  fs.copyFileSync(
    path.join(from, 'glyphs.icons.json'),
    path.join(to, 'extra.icons.json'),
  );
  return dir;
}

const DEFINITION = {description: 'Turn something.', words: ['turn']};

/**
 * Each function's cases, by the code each raises.
 * @type {Record<string, Record<string, () => Promise<unknown>>>}
 */
const CASES = {
  icon: {
    ERR_MISSING_ARGUMENT: () => icon('', {cwd: app()}),
    ERR_INVALID_ARGUMENT: () => icon('close', {cwd: app(), limit: 0}),
    ERR_NOT_FOUND: () => icon('glyphs/nope', {cwd: app()}),
    ERR_INVALID_OPTION: () => icon('close', {cwd: app(), list: true}),
  },
  iconAdd: {
    ERR_INVALID_OPTION: () =>
      iconAdd('XIcon', {cwd: pkg(), from: './icons/x.js', all: true}),
    ERR_PROJECT_REQUIRED: () =>
      iconAdd('XIcon', {cwd: outside(), from: './x.js'}),
    ERR_INVALID_ARGUMENT: () =>
      iconAdd('not a name', {cwd: pkg(), from: './icons/x.js'}),
    ERR_MISSING_ARGUMENT: () =>
      iconAdd('XIcon', /** @type {any} */ ({cwd: pkg()})),
    ERR_NOT_FOUND: () =>
      iconAdd('NopeIcon', {
        cwd: pkg(),
        from: './icons/x.js',
        definition: 'close',
      }),
    ERR_FILE_NOT_FOUND: () =>
      iconAdd('XIcon', {cwd: pkg(), from: './icons/missing.js'}),
    ERR_FILE_EXISTS: () =>
      iconAdd('XIcon', {
        cwd: pkg(),
        from: './icons/x.js',
        definition: 'close',
        id: 'search',
      }),
    ERR_PATH_TRAVERSAL: () =>
      iconAdd('XIcon', {cwd: pkg(), from: '../outside.js'}),
    ERR_WRITE_FAILED: () => {
      const dir = pkg();
      lock(path.join(dir, 'icon-sets', 'glyphs'));
      return iconAdd('XIcon', {
        cwd: dir,
        from: './icons/x.js',
        definition: 'close',
        id: 'x-again',
      });
    },
  },
  iconMap: {
    ERR_PROJECT_REQUIRED: () => iconMap('close', 'x', {cwd: outside()}),
    ERR_INVALID_OPTION: () =>
      iconMap('close', undefined, {cwd: pkg(), pairs: 'close=x'}),
    ERR_MISSING_ARGUMENT: () => iconMap('', 'x', {cwd: pkg()}),
    ERR_INVALID_ARGUMENT: () =>
      iconMap('close', 'x', {cwd: withSecondSet(pkg())}),
    ERR_NOT_FOUND: () => iconMap('notADefinition', 'x', {cwd: pkg()}),
    ERR_PATH_TRAVERSAL: () => {
      const dir = pkg();
      manifest(dir, "export default {experimental: {iconSets: '../out'}};\n");
      return iconMap('close', 'x', {cwd: dir});
    },
    ERR_WRITE_FAILED: () => {
      const dir = pkg();
      lock(path.join(dir, 'icon-sets', 'glyphs'));
      return iconMap('home', 'x', {cwd: dir});
    },
  },
  iconUse: {
    ERR_PROJECT_REQUIRED: () => iconUse('glyphs', {cwd: outside()}),
    ERR_MISSING_ARGUMENT: () => iconUse('', {cwd: app()}),
    ERR_NOT_FOUND: () => iconUse('nope', {cwd: app()}),
    ERR_INVALID_ARGUMENT: () =>
      iconUse('glyphs', {
        cwd: app({packages: [{}, {name: '@acme/lines', set: 'glyphs'}]}),
      }),
    // A config whose default export is not an object literal.
    ERR_WRITE_FAILED: () => {
      const dir = app();
      fs.writeFileSync(
        path.join(dir, 'astryx.config.mjs'),
        'function make() {\n  return {};\n}\nexport default make();\n',
      );
      return iconUse('glyphs', {cwd: dir});
    },
    ERR_CODEMOD_PROTECTED: () => {
      const dir = app();
      fs.writeFileSync(
        path.join(dir, '.gitattributes'),
        'astryx.config.mjs linguist-generated\n',
      );
      return iconUse('glyphs', {cwd: dir});
    },
    // A .gitattributes rule with no attribute cannot be read.
    ERR_CODEMOD_PROTECTION_SOURCE: () => {
      const dir = app();
      fs.writeFileSync(path.join(dir, '.gitattributes'), 'astryx.config.mjs\n');
      return iconUse('glyphs', {cwd: dir});
    },
  },
  iconNewSet: {
    ERR_PROJECT_REQUIRED: () => iconNewSet('outline', {cwd: outside()}),
    ERR_INVALID_ARGUMENT: () => iconNewSet('Outline', {cwd: bare()}),
    ERR_INVALID_OPTION: () =>
      iconNewSet('outline', {cwd: bare(), exclude: 'Meta'}),
    ERR_FILE_EXISTS: async () => {
      const dir = bare();
      await iconNewSet('outline', {cwd: dir});
      return iconNewSet('outline', {cwd: dir});
    },
    ERR_PATH_TRAVERSAL: () => {
      const dir = bare();
      manifest(dir, "export default {experimental: {iconSets: '../x'}};\n");
      return iconNewSet('outline', {cwd: dir});
    },
    // The manifest names another root by the time the set is written.
    ERR_INTEGRATION_ROOT_CONFLICT: () => {
      conflict.root = './elsewhere';
      return iconNewSet('outline', {cwd: bare()});
    },
    ERR_WRITE_FAILED: () => {
      const dir = bare();
      manifest(dir, "export default {experimental: {iconSets: './taken'}};\n");
      fs.writeFileSync(path.join(dir, 'taken'), 'not a directory');
      return iconNewSet('outline', {cwd: dir});
    },
    ERR_NOT_FOUND: () =>
      iconNewSet('outline', {cwd: bare(), from: 'not-installed-library'}),
    ERR_FILE_NOT_FOUND: () =>
      iconNewSet('outline', {cwd: bare(), from: './missing.js'}),
  },
  iconNewDefinition: {
    ERR_PROJECT_REQUIRED: () =>
      iconNewDefinition('random', {cwd: outside(), ...DEFINITION}),
    ERR_INVALID_ARGUMENT: () =>
      iconNewDefinition('Not-Camel', {cwd: pkg(), ...DEFINITION}),
    ERR_MISSING_ARGUMENT: () =>
      iconNewDefinition('random', {cwd: pkg(), words: ['turn']}),
    ERR_FILE_EXISTS: async () => {
      const dir = pkg();
      await iconNewDefinition('random', {cwd: dir, ...DEFINITION});
      return iconNewDefinition('random', {cwd: dir, ...DEFINITION});
    },
    ERR_NOT_FOUND: () =>
      iconNewDefinition('random', {cwd: pkg(), ...DEFINITION, icon: 'nope'}),
    ERR_PATH_TRAVERSAL: () => {
      const dir = pkg();
      manifest(dir, "export default {experimental: {iconSets: '../out'}};\n");
      return iconNewDefinition('random', {cwd: dir, ...DEFINITION});
    },
    ERR_WRITE_FAILED: () => {
      const dir = pkg();
      lock(path.join(dir, 'icon-sets', 'glyphs', 'definitions'));
      return iconNewDefinition('random', {cwd: dir, ...DEFINITION});
    },
  },
};

/** The codes a function's reference doc lists. @param {string} name */
async function documented(name) {
  const {doc} = await import(`./${name}.doc.mjs`);
  return (doc.throws ?? []).map((/** @type {any} */ each) => each.code).sort();
}

describe.each(Object.entries(CASES))('%s', (name, cases) => {
  it('documents exactly the codes it raises', async () => {
    expect(await documented(name)).toEqual(Object.keys(cases).sort());
  });

  it.each(Object.entries(cases))('raises %s', async (code, run) => {
    await expect(run()).rejects.toMatchObject({code});
  });
});

describe('a write that fails leaves the package as it was', () => {
  it('iconNewSet: a root that changes before the write rolls back package.json', async () => {
    const dir = bare();
    const before = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
    conflict.root = './elsewhere';
    await expect(iconNewSet('outline', {cwd: dir})).rejects.toMatchObject({
      code: 'ERR_INTEGRATION_ROOT_CONFLICT',
    });
    expect(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).toBe(
      before,
    );
    // No file of the set is left (the shared write transaction keeps the
    // folders it made).
    const left = fs.existsSync(path.join(dir, 'icon-sets'))
      ? fs
          .readdirSync(path.join(dir, 'icon-sets'), {recursive: true})
          .filter(each =>
            fs.statSync(path.join(dir, 'icon-sets', String(each))).isFile(),
          )
      : [];
    expect(left).toEqual([]);
  });
});

describe('iconUse beside a spread', () => {
  it('refuses with ERR_WRITE_FAILED and leaves a config that spreads another object as it was', async () => {
    const dir = app();
    const file = path.join(dir, 'astryx.config.mjs');
    fs.writeFileSync(
      path.join(dir, 'base.mjs'),
      "export default {integrations: ['@acme/glyphs']};\n",
    );
    const before =
      "import base from './base.mjs';\n\nexport default {\n  ...base,\n};\n";
    fs.writeFileSync(file, before);
    await expect(iconUse('glyphs', {cwd: dir})).rejects.toMatchObject({
      code: 'ERR_WRITE_FAILED',
      message: expect.stringContaining('spreads another object'),
    });
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });
});
