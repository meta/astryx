// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The integration component views that the component lookup's
 * not-found matcher reads: the first read keeps them in the per-user cache
 * folder, a warm read takes them back without loading an integration doc,
 * and an added or edited component doc shows in the very next read. The
 * views are kept only by an installed CLI with a build id, so the CLI's root
 * is set to an installed-looking folder with one.
 *
 * @input a project whose one linked integration ships components
 * @output assertions on integrationComponentViews and on its kept entry
 * @position foundation/discovery/ beside the module it tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';

const SLOW = 60_000;

/** The time a stamp needs to settle before a summary is stored, plus margin. */
const SETTLE_WAIT_MS = 2200;

const {TEMP_ROOT} = await vi.hoisted(async () => {
  const nodeFs = await import('node:fs');
  const nodeOs = await import('node:os');
  const nodePath = await import('node:path');
  return {
    TEMP_ROOT: nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), 'astryx-integration-views-'),
    ),
  };
});

/** An installed-looking CLI root, so the store keeps entries. */
const FAKE_CLI_ROOT = path.join(
  TEMP_ROOT,
  'node_modules',
  '@astryxdesign',
  'cli',
);

vi.mock('../fs/paths.mjs', async importOriginal => ({
  .../** @type {object} */ (await importOriginal()),
  CLI_ROOT: path.join(TEMP_ROOT, 'node_modules', '@astryxdesign', 'cli'),
}));

// Counts the component docs that a read loads.
vi.mock('./component-loader.mjs', async importOriginal => {
  const real = /** @type {any} */ (await importOriginal());
  return {...real, loadDocs: vi.fn(real.loadDocs)};
});

/** @type {typeof import('./integration-component-views.mjs').integrationComponentViews} */
let integrationComponentViews;
/** @type {typeof import('../config/project.mjs').Project} */
let Project;
/** @type {import('vitest').Mock} */
let loadDocs;
/** @type {string} */
let project;
/** @type {string} */
let pkgDir;
const savedCache = process.env.XDG_CACHE_HOME;
const CACHE = path.join(TEMP_ROOT, 'cache');
const STORE = path.join(CACHE, 'astryx', 'catalogs');

/**
 * Write the integration component `name` with its doc and source.
 * @param {string} name
 * @param {string} description
 */
function writeComponent(name, description) {
  fs.writeFileSync(
    path.join(pkgDir, 'components', `${name}.doc.mjs`),
    `export default ${JSON.stringify({type: 'component', name, description, props: []})};\n`,
  );
  fs.writeFileSync(
    path.join(pkgDir, 'components', `${name}.tsx`),
    `export function ${name}() { return null; }\n`,
  );
}

beforeAll(async () => {
  fs.mkdirSync(path.join(FAKE_CLI_ROOT, 'clients', 'cli'), {recursive: true});
  fs.writeFileSync(
    path.join(FAKE_CLI_ROOT, 'clients', 'cli', 'build-id.generated.json'),
    JSON.stringify({id: 'integration-views-test'}),
  );
  process.env.XDG_CACHE_HOME = CACHE;
  // A run's first kept gather makes the folder; the views are kept only in it.
  (await import('../fs/gather-cache.mjs')).makeGatherCacheDir();

  // Outside the repository, whose folder other tests change while this one
  // waits for its stamps to settle. A repository and a lockfile mark the
  // project's root, so no folder above it is read.
  project = fs.mkdtempSync(path.join(TEMP_ROOT, 'project-'));
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  fs.mkdirSync(path.join(project, '.git'));
  fs.writeFileSync(path.join(project, 'package-lock.json'), '{}\n');
  fs.writeFileSync(
    path.join(project, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/glints']};\n",
  );
  // The integration is linked, as while it is developed beside the project,
  // so each of its files keeps its own stamp.
  pkgDir = path.join(TEMP_ROOT, 'glints');
  fs.mkdirSync(path.join(project, 'node_modules', '@acme'), {recursive: true});
  fs.symlinkSync(
    pkgDir,
    path.join(project, 'node_modules', '@acme', 'glints'),
    'dir',
  );
  fs.mkdirSync(path.join(pkgDir, 'components'), {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({name: '@acme/glints', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    "export default {components: './components'};\n",
  );
  writeComponent('GlintCard', 'A card.');
  ({integrationComponentViews} =
    await import('./integration-component-views.mjs'));
  ({Project} = await import('../config/project.mjs'));
  loadDocs = /** @type {any} */ (
    (await import('./component-loader.mjs')).loadDocs
  );
});

afterAll(() => {
  if (savedCache === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = savedCache;
  fs.rmSync(TEMP_ROOT, {recursive: true, force: true});
});

/** @param {number} ms */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * The kept views entry: its file and inode. A read-back touches the file in
 * place; storing writes a new file over it by a rename, so an unchanged inode
 * means the last read took the views back.
 * @returns {{file: string, ino: number}}
 */
const keptViews = () => {
  const files = fs
    .readdirSync(STORE)
    .filter(name => name.startsWith('gather-') && name.endsWith('.json'))
    .map(name => path.join(STORE, name))
    .filter(file => {
      const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
      return (
        entry.summary &&
        JSON.stringify(entry.key).includes('integration-component-views')
      );
    });
  expect(files).toHaveLength(1);
  return {file: files[0], ino: fs.statSync(files[0]).ino};
};

/**
 * Each component the integration lists now, with its doc's description,
 * sorted by name.
 * @returns {Promise<Array<[string, unknown]>>}
 */
const read = async () => {
  const integration = (
    await Project.load(project, {fresh: true})
  ).loadedIntegrations.find(
    (/** @type {{name: string}} */ loaded) => loaded.name === '@acme/glints',
  );
  return (await integrationComponentViews(/** @type {any} */ (integration)))
    .map(
      ({name, view}) =>
        /** @type {[string, unknown]} */ ([name, view?.description ?? null]),
    )
    .sort(([a], [b]) => a.localeCompare(b));
};

describe('integration component views', () => {
  it(
    'are kept, and a warm read takes them back without loading a doc',
    async () => {
      await sleep(SETTLE_WAIT_MS);
      expect(await read()).toEqual([['GlintCard', 'A card.']]);
      const kept = keptViews();
      const loads = loadDocs.mock.calls.length;
      expect(loads).toBeGreaterThan(0);
      expect(await read()).toEqual([['GlintCard', 'A card.']]);
      expect(loadDocs.mock.calls.length).toBe(loads);
      expect(keptViews().ino).toBe(kept.ino);
    },
    SLOW,
  );

  it(
    'show an added or an edited component doc in the very next read',
    async () => {
      writeComponent('ShinyBadge', 'A badge.');
      expect(await read()).toEqual([
        ['GlintCard', 'A card.'],
        ['ShinyBadge', 'A badge.'],
      ]);
      writeComponent('GlintCard', 'A glinting card.');
      expect(await read()).toEqual([
        ['GlintCard', 'A glinting card.'],
        ['ShinyBadge', 'A badge.'],
      ]);
    },
    SLOW,
  );
});
