// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The not-found hint's one name index: a project's first miss makes
 * the kept gathers' folder and keeps the index there, later misses reuse it,
 * adding, renaming or removing a doc, a template or an integration shows in
 * the very next hint, a new CLI build makes it again, and an installed Core
 * is kept by its package.json (a Core upgrade makes it again) while a linked
 * one is stamped file by file. The index is kept
 * only by an installed CLI with a build id, so the CLI's root is set to an
 * installed-looking folder with one.
 *
 * @input a project whose one integration ships a component, a template and a
 *   docs topic
 * @output assertions on findOtherCommand's hint and on the kept index
 * @position foundation/suggest/ beside the module it tests
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
      nodePath.join(nodeOs.tmpdir(), 'astryx-name-index-'),
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
/** @type {typeof import('../config/project.mjs').Project} */
let Project;
/** @type {string} */
let project;
/** @type {string} */
let pkgDir;
const savedCache = process.env.XDG_CACHE_HOME;
const CACHE = path.join(TEMP_ROOT, 'cache');
const STORE = path.join(CACHE, 'astryx', 'catalogs');

beforeAll(async () => {
  fs.mkdirSync(path.join(FAKE_CLI_ROOT, 'clients', 'cli'), {recursive: true});
  fs.writeFileSync(
    path.join(FAKE_CLI_ROOT, 'clients', 'cli', 'build-id.generated.json'),
    JSON.stringify({id: 'name-index-test'}),
  );
  // No kept gathers' folder yet: the first miss makes it.
  process.env.XDG_CACHE_HOME = CACHE;

  // Outside the repository, whose folder other tests change while this one
  // waits for its stamps to settle.
  project = fs.mkdtempSync(path.join(TEMP_ROOT, 'project-'));
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  // A repository and a lockfile mark the project's root, as for a project
  // that is installed and checked out, so no folder above it is read: the
  // system temp folder above changes while this test waits.
  fs.mkdirSync(path.join(project, '.git'));
  fs.writeFileSync(path.join(project, 'package-lock.json'), '{}\n');
  fs.writeFileSync(
    path.join(project, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/glints']};\n",
  );
  pkgDir = path.join(project, 'node_modules', '@acme', 'glints');
  for (const dir of ['components', 'templates', 'docs']) {
    fs.mkdirSync(path.join(pkgDir, dir), {recursive: true});
  }
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({name: '@acme/glints', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    "export default {components: './components', templates: './templates', docs: './docs'};\n",
  );
  fs.writeFileSync(
    path.join(pkgDir, 'components', 'GlintCard.doc.mjs'),
    "export default {type: 'component', name: 'GlintCard', description: 'A card.', props: []};\n",
  );
  fs.writeFileSync(
    path.join(pkgDir, 'components', 'GlintCard.tsx'),
    'export function GlintCard() { return null; }\n',
  );
  writeTopic('glint-guide');
  ({findOtherCommand} = await import('./other-command.mjs'));
  ({Project} = await import('../config/project.mjs'));
});

afterAll(() => {
  if (savedCache === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = savedCache;
  fs.rmSync(project, {recursive: true, force: true});
  fs.rmSync(TEMP_ROOT, {recursive: true, force: true});
});

/**
 * Write the docs topic `name` as the integration's one doc.
 * @param {string} name
 */
function writeTopic(name) {
  fs.writeFileSync(
    path.join(pkgDir, 'docs', `${name}.doc.mjs`),
    `export const docs = ${JSON.stringify({
      type: 'generic',
      name,
      title: 'Glint guide',
      description: 'How glints work.',
      sections: [{title: 'One', content: [{type: 'prose', text: 'One.'}]}],
    })};\n`,
  );
}

/**
 * Write the block template `id` with its source.
 * @param {string} id
 */
function writeTemplate(id) {
  fs.writeFileSync(
    path.join(pkgDir, 'templates', `${id}.doc.mjs`),
    `export default {type: 'block', name: '${id}', description: 'A panel.'};\n`,
  );
  fs.writeFileSync(
    path.join(pkgDir, 'templates', `${id}.tsx`),
    'export default function Fixture() { return null; }\n',
  );
}

/** @param {number} ms */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** @returns {number} the kept name indexes in the store */
const keptIndexes = () =>
  fs.existsSync(STORE)
    ? fs
        .readdirSync(STORE)
        .filter(name => name.startsWith('gather-') && name.endsWith('.json'))
        .filter(name =>
          fs
            .readFileSync(path.join(STORE, name), 'utf8')
            .includes('hint-names'),
        ).length
    : 0;

/**
 * The hint `astryx hook <name>` gives, with the integrations as they are on
 * the disk now, or with `integrations` when given.
 * @param {string} name
 * @param {unknown[]} [integrations]
 * @returns {Promise<string | null>}
 */
const hint = async (name, integrations) =>
  (
    await findOtherCommand(name, {
      from: 'hook',
      cwd: project,
      integrations: /** @type {any} */ (
        integrations ??
          (await Project.load(project, {fresh: true})).loadedIntegrations
      ),
    })
  )?.hint.name ?? null;

describe('the name index', () => {
  it(
    'makes the kept folder on the first miss and keeps one index there',
    async () => {
      expect(fs.existsSync(STORE)).toBe(false);
      await sleep(SETTLE_WAIT_MS);
      expect(await hint('GlintCard')).toBe('astryx component GlintCard');
      expect(fs.statSync(STORE).mode & 0o777).toBe(0o700);
      expect(keptIndexes()).toBe(1);
      // A later miss, of any name, reads the same index.
      expect(await hint('glint-guide')).toBe('astryx docs glint-guide');
      expect(await hint('zorbletwobble')).toBeNull();
      expect(keptIndexes()).toBe(1);
    },
    SLOW,
  );

  it(
    'shows an added, renamed or removed doc, template or integration at once',
    async () => {
      expect(await hint('shiny-panel')).toBeNull();
      writeTemplate('shiny-panel');
      expect(await hint('shiny-panel')).toBe('astryx template shiny-panel');

      // A renamed template answers to its new id only.
      for (const ext of ['.doc.mjs', '.tsx']) {
        fs.renameSync(
          path.join(pkgDir, 'templates', `shiny-panel${ext}`),
          path.join(pkgDir, 'templates', `glossy-panel${ext}`),
        );
      }
      expect(await hint('shiny-panel')).toBeNull();
      expect(await hint('glossy-panel')).toBe('astryx template glossy-panel');

      // A doc renamed in its text and its file name.
      fs.rmSync(path.join(pkgDir, 'docs', 'glint-guide.doc.mjs'));
      writeTopic('sparkle-guide');
      expect(await hint('glint-guide')).toBeNull();
      expect(await hint('sparkle-guide')).toBe('astryx docs sparkle-guide');

      // A removed doc.
      fs.rmSync(path.join(pkgDir, 'docs', 'sparkle-guide.doc.mjs'));
      expect(await hint('sparkle-guide')).toBeNull();

      // A project without the integration has none of its names.
      expect(await hint('GlintCard', [])).toBeNull();
      expect(await hint('glossy-panel', [])).toBeNull();
      expect(await hint('GlintCard')).toBe('astryx component GlintCard');
    },
    SLOW,
  );

  it(
    'is made again for a new CLI build, which its own files are kept under',
    async () => {
      await sleep(SETTLE_WAIT_MS);
      expect(await hint('GlintCard')).toBe('astryx component GlintCard');
      const before = keptIndexes();
      fs.writeFileSync(
        path.join(FAKE_CLI_ROOT, 'clients', 'cli', 'build-id.generated.json'),
        JSON.stringify({id: 'name-index-test-upgraded'}),
      );
      expect(await hint('GlintCard')).toBe('astryx component GlintCard');
      expect(keptIndexes()).toBe(before + 1);
    },
    SLOW,
  );

  it(
    "keeps an installed Core by its package.json, and a linked Core's files each",
    async () => {
      const {hintNameIndex} = await import('./name-index.mjs');
      /**
       * A Core with one component, at `dir`.
       * @param {string} dir
       * @param {string} version
       */
      const writeCore = (dir, version) => {
        fs.mkdirSync(path.join(dir, 'src', 'Glimmer'), {recursive: true});
        fs.writeFileSync(
          path.join(dir, 'package.json'),
          JSON.stringify({name: '@astryxdesign/core', version}),
        );
        fs.writeFileSync(
          path.join(dir, 'src', 'Glimmer', 'Glimmer.tsx'),
          'export function Glimmer() { return null; }\n',
        );
      };
      /**
       * The stamps the kept index for `coreDir` holds, by path.
       * @param {string} coreDir
       * @returns {string[]}
       */
      const keptPaths = coreDir => {
        const entries = fs
          .readdirSync(STORE)
          .filter(name => name.startsWith('gather-') && name.endsWith('.json'))
          .map(name =>
            JSON.parse(fs.readFileSync(path.join(STORE, name), 'utf8')),
          )
          .filter(
            entry =>
              entry.summary &&
              JSON.stringify(entry.key).includes('hint-names') &&
              JSON.stringify(entry.key).includes(coreDir),
          );
        expect(entries).toHaveLength(1);
        return entries[0].stamps.map((/** @type {[string]} */ [at]) => at);
      };

      const installed = path.join(
        project,
        'node_modules',
        '@astryxdesign',
        'core',
      );
      writeCore(installed, '1.0.0');
      await sleep(SETTLE_WAIT_MS);
      expect((await hintNameIndex(project, installed, [])).core).toContain(
        'tglimmer',
      );
      const stamped = keptPaths(installed);
      expect(stamped).toContain(path.join(installed, 'package.json'));
      expect(
        stamped.filter(at => at.startsWith(path.join(installed, 'src'))),
      ).toEqual([]);

      // A Core upgrade rewrites its package.json: the index is made again.
      fs.mkdirSync(path.join(installed, 'src', 'Sparkle'));
      fs.writeFileSync(
        path.join(installed, 'src', 'Sparkle', 'Sparkle.tsx'),
        'export function Sparkle() { return null; }\n',
      );
      fs.writeFileSync(
        path.join(installed, 'package.json'),
        JSON.stringify({name: '@astryxdesign/core', version: '1.1.0'}),
      );
      expect((await hintNameIndex(project, installed, [])).core).toContain(
        'tsparkle',
      );

      // A linked Core, outside any node_modules folder, is stamped file by
      // file: an edit to its sources shows at once.
      const linked = path.join(TEMP_ROOT, 'workspace-core');
      writeCore(linked, '0.0.0');
      await sleep(SETTLE_WAIT_MS);
      await hintNameIndex(project, linked, []);
      expect(
        keptPaths(linked).filter(at => at.startsWith(path.join(linked, 'src'))),
      ).not.toEqual([]);
      fs.writeFileSync(
        path.join(linked, 'src', 'Glimmer', 'GlimmerTwo.tsx'),
        'export function GlimmerTwo() { return null; }\n',
      );
      expect((await hintNameIndex(project, linked, [])).core).toContain(
        'tglimmertwo',
      );
    },
    SLOW,
  );
});
