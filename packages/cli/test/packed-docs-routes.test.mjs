// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The published package names a docs route in the lookup commands' not-found
 * hint from the routes `prepack` stores: the package script writes them, the
 * packed tarball ships them, and the CLI run from that tarball names the
 * route without loading the docs tree, as long as the docs it read are
 * unchanged.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import nodeModule from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';
import {cliDocsRoutesNow} from '../api/docs/_entry-names.mjs';
import {
  cliTarball,
  extractTarball,
  tarballFiles,
} from '../test-utils/global-local-fixtures.mjs';

const STORE = 'assets/docs-routes.generated.json';

/** Whether this Node can count module loads (module.registerHooks). */
const hasModuleHooks =
  typeof (/** @type {any} */ (nodeModule).registerHooks) === 'function';

/** @type {string} */
let work;
/** @type {string} */
let packed;
/**
 * A project of no CLI of its own and no integration, where each CLI answers
 * itself.
 * @type {string}
 */
let outside;

beforeAll(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'packed-docs-routes-'));
  packed = path.join(work, 'node_modules', '@astryxdesign', 'cli');
  extractTarball(cliTarball(), packed);
  fs.symlinkSync(
    path.join(CLI_ROOT, 'node_modules'),
    path.join(packed, 'node_modules'),
    'dir',
  );
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'packed-docs-routes-run-'));
  fs.writeFileSync(
    path.join(outside, 'package.json'),
    JSON.stringify({name: 'consumer', private: true}),
  );
  fs.mkdirSync(path.join(outside, 'node_modules', '@astryxdesign'), {
    recursive: true,
  });
  fs.symlinkSync(
    path.resolve(CLI_ROOT, '..', 'core'),
    path.join(outside, 'node_modules', '@astryxdesign', 'core'),
    'dir',
  );
}, 120_000);

afterAll(() => {
  if (work) fs.rmSync(work, {recursive: true, force: true});
  if (outside) fs.rmSync(outside, {recursive: true, force: true});
});

/**
 * Run a CLI's `hook <name>`, counting the loads of the docs tree's module.
 * @param {string} cliRoot
 * @param {string} name
 * @returns {{suggestions: unknown, treeLoads: number}}
 */
function hookMiss(cliRoot, name) {
  const counter = path.join(work, `loads-${fs.readdirSync(work).length}.txt`);
  const preload = path.join(work, 'count-tree-loads.mjs');
  fs.writeFileSync(
    preload,
    `import fs from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({
  load(url, context, next) {
    if (url.split('?')[0].endsWith('/foundation/doc-compiler/tree.mjs')) fs.appendFileSync(process.env.COUNT_TO, '.');
    return next(url, context);
  },
});
`,
  );
  fs.writeFileSync(counter, '');
  const run = spawnSync(
    process.execPath,
    [
      '--import',
      preload,
      path.join(cliRoot, 'clients', 'cli', 'bin', 'astryx.mjs'),
      'hook',
      name,
      '--json',
    ],
    {
      cwd: outside,
      encoding: 'utf8',
      env: {
        ...process.env,
        COUNT_TO: counter,
        NO_UPDATE_NOTIFIER: '1',
        // No kept summaries: each run reads the stored routes itself.
        XDG_CACHE_HOME: path.join(work, 'no-cache'),
      },
    },
  );
  const out = JSON.parse(run.stdout);
  expect(out.code).toBe('ERR_UNKNOWN_HOOK');
  return {
    suggestions: out.suggestions,
    treeLoads: fs.readFileSync(counter, 'utf8').length,
  };
}

/**
 * A route below the tree's root whose last segment no root route, Core
 * component or hook has, so only the full route list names it.
 * @param {string[]} routes
 * @returns {string}
 */
function nestedRoute(routes) {
  const roots = new Set(routes.filter(route => !route.includes('/')));
  const found = routes.find(route => {
    const last = route.slice(route.lastIndexOf('/') + 1);
    return route.includes('/') && !roots.has(last) && !last.startsWith('use');
  });
  if (!found) throw new Error('the CLI docs tree has no nested route');
  return found;
}

describe('the packed package', () => {
  it('writes the routes in prepack and removes them after packing', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'),
    );
    expect(pkg.scripts.prepack).toContain('scripts/generate-docs-routes.mjs');
    expect(pkg.scripts.postpack).toContain(
      'node scripts/generate-docs-routes.mjs --clean',
    );
  });

  it("ships the CLI's own routes", async () => {
    expect(tarballFiles(cliTarball())).toContain(STORE);
    const stored = JSON.parse(
      fs.readFileSync(path.join(packed, STORE), 'utf8'),
    ).routes;
    expect(stored.value).toEqual(await cliDocsRoutesNow());
  });

  it.skipIf(!hasModuleHooks)(
    'names a nested docs route without loading the tree, the same way',
    () => {
      const route = nestedRoute(
        JSON.parse(fs.readFileSync(path.join(packed, STORE), 'utf8')).routes
          .value,
      );
      const name = route.slice(route.lastIndexOf('/') + 1);
      const fromTarball = hookMiss(packed, name);
      const fromCheckout = hookMiss(CLI_ROOT, name);
      expect(fromCheckout.treeLoads).toBeGreaterThan(0);
      expect(fromTarball.treeLoads).toBe(0);
      expect(fromTarball.suggestions).toEqual(fromCheckout.suggestions);
      expect(fromTarball.suggestions).toContainEqual(
        expect.objectContaining({name: `astryx docs ${route}`}),
      );
    },
    120_000,
  );

  it.skipIf(!hasModuleHooks)(
    'builds the tree again once a doc it read changes',
    () => {
      const copy = path.join(work, 'edited', 'node_modules', '@astryxdesign');
      fs.mkdirSync(copy, {recursive: true});
      const cli = path.join(copy, 'cli');
      fs.cpSync(packed, cli, {
        recursive: true,
        filter: source => path.basename(source) !== 'node_modules',
      });
      fs.symlinkSync(
        path.join(CLI_ROOT, 'node_modules'),
        path.join(cli, 'node_modules'),
        'dir',
      );
      const stored = JSON.parse(
        fs.readFileSync(path.join(cli, STORE), 'utf8'),
      ).routes;
      const route = nestedRoute(stored.value);
      const doc = Object.keys(stored.inputs).find(rel =>
        rel.endsWith('.doc.mjs'),
      );
      if (!doc) throw new Error('the stored routes read no doc');
      fs.appendFileSync(path.join(cli, doc), '\n// edited\n');
      const edited = hookMiss(cli, route.slice(route.lastIndexOf('/') + 1));
      expect(edited.treeLoads).toBeGreaterThan(0);
      expect(edited.suggestions).toContainEqual(
        expect.objectContaining({name: `astryx docs ${route}`}),
      );
    },
    120_000,
  );
});
