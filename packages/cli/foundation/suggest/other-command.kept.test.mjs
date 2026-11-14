// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The not-found hint's kept integration component names follow the
 * docs and sources they come from: a doc that records an export name gives
 * the hint under that name, and an edit to the source's exports changes the
 * hint on the next run. The names are kept only by an installed CLI with a
 * build id, so the CLI's root is set to an installed-looking folder with one.
 *
 * @input a project whose one integration ships a component doc that names a
 *   differently named export of its source
 * @output assertions on findOtherCommand's hint and on the kept summaries
 * @position foundation/suggest/ beside the module it tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {REPO_ROOT} from '../../test-utils/repo-root.mjs';

const SLOW = 30_000;

/** The time a stamp needs to settle before a summary is stored, plus margin. */
const SETTLE_WAIT_MS = 2200;

const {TEMP_ROOT} = await vi.hoisted(async () => {
  const nodeFs = await import('node:fs');
  const nodeOs = await import('node:os');
  const nodePath = await import('node:path');
  return {
    TEMP_ROOT: nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), 'astryx-other-command-kept-'),
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

/** @type {typeof import('./other-command.mjs').findOtherCommand} */
let findOtherCommand;
/** @type {string} */
let project;
/** @type {string} */
let source;
const savedCache = process.env.XDG_CACHE_HOME;
const STORE = path.join(TEMP_ROOT, 'cache', 'astryx', 'catalogs');

beforeAll(async () => {
  fs.mkdirSync(path.join(FAKE_CLI_ROOT, 'clients', 'cli'), {recursive: true});
  fs.writeFileSync(
    path.join(FAKE_CLI_ROOT, 'clients', 'cli', 'build-id.generated.json'),
    JSON.stringify({id: 'other-command-kept-test'}),
  );
  process.env.XDG_CACHE_HOME = path.join(TEMP_ROOT, 'cache');
  fs.mkdirSync(STORE, {recursive: true, mode: 0o700});
  fs.chmodSync(path.join(TEMP_ROOT, 'cache', 'astryx'), 0o700);

  project = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-other-kept-'));
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  fs.writeFileSync(
    path.join(project, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/glints']};\n",
  );
  const pkgDir = path.join(project, 'node_modules', '@acme', 'glints');
  fs.mkdirSync(path.join(pkgDir, 'components'), {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({name: '@acme/glints', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    "export default {components: './components'};\n",
  );
  fs.writeFileSync(
    path.join(pkgDir, 'components', 'TwinkCard.doc.mjs'),
    "export default {type: 'component', name: 'GlintCard', description: 'A card.', props: []};\n",
  );
  source = path.join(pkgDir, 'components', 'TwinkCard.tsx');
  fs.writeFileSync(source, 'export function GlintCard() { return null; }\n');
  ({findOtherCommand} = await import('./other-command.mjs'));
});

afterAll(() => {
  if (savedCache === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = savedCache;
  fs.rmSync(project, {recursive: true, force: true});
  fs.rmSync(TEMP_ROOT, {recursive: true, force: true});
});

/** @param {number} ms */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** @returns {number} the kept component name lists in the store */
const keptLists = () =>
  fs
    .readdirSync(STORE)
    .filter(name => name.startsWith('gather-') && name.endsWith('.json'))
    .filter(name =>
      fs
        .readFileSync(path.join(STORE, name), 'utf8')
        .includes('integration-component-list'),
    ).length;

/** @param {string} name */
const hint = async name =>
  (await findOtherCommand(name, {from: 'hook', cwd: project}))?.hint.name ??
  null;

describe('the kept integration component names', () => {
  it(
    'give a doc its recorded export name, and follow an edit to the source',
    async () => {
      await sleep(SETTLE_WAIT_MS);
      expect(await hint('GlintCard')).toBe('astryx component GlintCard');
      expect(keptLists()).toBe(1);
      // A warm run reads the kept list.
      expect(await hint('glint-card')).toBe('astryx component GlintCard');
      expect(await hint('TwinkCard')).toBeNull();

      // The source now exports the doc's own name: the doc is listed under it.
      fs.writeFileSync(
        source,
        'export function TwinkCard() { return null; }\n',
      );
      expect(await hint('GlintCard')).toBeNull();
      expect(await hint('TwinkCard')).toBe('astryx component TwinkCard');
      await sleep(SETTLE_WAIT_MS);
      expect(await hint('TwinkCard')).toBe('astryx component TwinkCard');
      expect(await hint('GlintCard')).toBeNull();
    },
    SLOW,
  );
});
