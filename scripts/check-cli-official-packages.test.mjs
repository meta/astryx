// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Drift guard for the official package list the CLI carries for
 * `astryx discover` (spec:AST-051 FR11).
 *
 * `scripts/generate-cli-official-packages.mjs` builds the list from the
 * packages the release workflow publishes, with the CLI's own readers. This
 * test pins the committed file to what the generator builds now, and checks
 * the selection rule on a stand-in repository. When a package changes, run
 * `pnpm bundle:cli-official-packages` and commit the regenerated list.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  buildOfficialList,
  OFFICIAL_LIST_PATH,
  releaseChannel,
  serializeOfficialList,
} from './generate-cli-official-packages.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

describe('the official package list is in sync with the repository', () => {
  it('matches what the generator builds (run `pnpm bundle:cli-official-packages`)', async () => {
    const committed = fs.readFileSync(
      path.join(REPO_ROOT, OFFICIAL_LIST_PATH),
      'utf-8',
    );
    expect(committed).toBe(serializeOfficialList(await buildOfficialList()));
  });

  it('releases every listed package with Core, unless it is canary-only', async () => {
    // A package outside Core's version group would show and pin a version it
    // was never released at: a renamed package must move with the group.
    const loose = (await buildOfficialList()).packages
      .filter(p => !p.canaryOnly && !p.releasedWithCore)
      .map(p => p.package);
    expect(loose).toEqual([]);
  });

  it('lists every public theme package and no base package', async () => {
    const names = (await buildOfficialList()).packages.map(p => p.package);
    const themes = fs
      .readdirSync(path.join(REPO_ROOT, 'packages', 'themes'))
      .map(slug =>
        path.join(REPO_ROOT, 'packages', 'themes', slug, 'package.json'),
      )
      .filter(file => fs.existsSync(file))
      .map(file => JSON.parse(fs.readFileSync(file, 'utf-8')))
      .filter(pkg => pkg.private !== true)
      .map(pkg => pkg.name);
    expect(themes.length).toBeGreaterThan(0);
    for (const theme of themes) expect(names).toContain(theme);
    for (const base of [
      '@astryxdesign/core',
      '@astryxdesign/cli',
      '@astryxdesign/build',
    ]) {
      expect(names).not.toContain(base);
    }
  });
});

describe('releaseChannel follows the release workflow publish rule', () => {
  it.each([
    [{name: '@astryxdesign/theme-x'}, 'latest'],
    [{name: '@astryxdesign/theme-x', private: false}, 'latest'],
    [{name: '@astryxdesign/x', private: true}, null],
    [
      {name: '@astryxdesign/x', private: true, astryx: {canaryOnly: true}},
      'canary',
    ],
    [{name: '@astryxdesign/x', astryx: {canaryOnly: true}}, 'canary'],
    [{name: '@acme/theme-x'}, null],
    [{}, null],
  ])('%o publishes to %s', (pkg, channel) => {
    expect(releaseChannel(pkg)).toBe(channel);
  });
});

describe('buildOfficialList on a stand-in repository', () => {
  /** @type {string} */
  let root;

  /** @param {string} file @param {unknown} value */
  const writeJSON = (file, value) => {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, JSON.stringify(value));
  };

  /**
   * @param {string} slug
   * @param {object} pkg
   * @param {{descriptor?: boolean}} [options]
   */
  const theme = (slug, pkg, {descriptor = true} = {}) => {
    const dir = path.join(root, 'packages', 'themes', slug);
    writeJSON(path.join(dir, 'package.json'), pkg);
    fs.mkdirSync(path.join(dir, 'src'), {recursive: true});
    fs.writeFileSync(
      path.join(dir, 'src', `${slug}Theme.ts`),
      `export const ${slug}Theme = {};\n`,
    );
    if (descriptor) {
      fs.writeFileSync(
        path.join(dir, 'src', `${slug}Theme.doc.mjs`),
        `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: '${slug}', displayName: 'Ocean ${slug}', description: 'Blue ${slug}.', maintained: true};\n`,
      );
    }
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-official-list-'));
    writeJSON(path.join(root, '.changeset', 'config.json'), {
      fixed: [['@astryxdesign/core', '@astryxdesign/theme-ocean']],
    });
    writeJSON(path.join(root, 'packages', 'core', 'package.json'), {
      name: '@astryxdesign/core',
      description: 'The base.',
    });
  });

  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('keeps published packages that add something, and marks canary-only and Core-released ones', async () => {
    theme('ocean', {name: '@astryxdesign/theme-ocean', description: 'Sea.'});
    theme('lagoon', {
      name: '@astryxdesign/theme-lagoon',
      private: true,
      astryx: {canaryOnly: true},
    });
    theme('probe', {name: '@astryxdesign/theme-probe', private: true});
    theme('reef', {name: '@acme/theme-reef'});

    expect(await buildOfficialList(root)).toEqual({
      packages: [
        {
          package: '@astryxdesign/theme-lagoon',
          canaryOnly: true,
          contributions: [
            {
              kind: 'theme',
              name: 'lagoon',
              title: 'Ocean lagoon',
              summary: 'Blue lagoon.',
            },
          ],
        },
        {
          package: '@astryxdesign/theme-ocean',
          description: 'Sea.',
          releasedWithCore: true,
          contributions: [
            {
              kind: 'theme',
              name: 'ocean',
              title: 'Ocean ocean',
              summary: 'Blue ocean.',
            },
          ],
        },
      ],
    });
  });

  it('lists the same family members with or without a build of the package', async () => {
    // A canary-only package whose family member only its root entry exports,
    // as Lab's TourStep is: the list must not depend on a local build.
    const dir = path.join(root, 'packages', 'kit');
    writeJSON(path.join(dir, 'package.json'), {
      name: '@astryxdesign/kit',
      private: true,
      astryx: {canaryOnly: true},
      exports: {
        '.': {source: './src/index.ts', default: './dist/index.js'},
      },
    });
    const files = {
      'astryx.integration.mjs': "export default {components: './src'};\n",
      'src/index.ts':
        "export {Steps} from './Steps/Steps';\nexport {Step} from './Steps/Step';\n",
      'src/Steps/Steps.doc.mjs':
        "export default {type: 'component', name: 'Steps', usage: {description: 'x'}, components: [{name: 'Steps', description: 'x'}, {name: 'Step', description: 'x'}]};\n",
      'src/Steps/Steps.tsx': 'export function Steps() { return null; }\n',
      'src/Steps/Step.tsx': 'export function Step() { return null; }\n',
    };
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
      fs.writeFileSync(path.join(dir, file), text);
    }
    const unbuilt = serializeOfficialList(await buildOfficialList(root));
    expect(unbuilt).toContain('"name": "Step"');

    fs.mkdirSync(path.join(dir, 'dist'), {recursive: true});
    fs.writeFileSync(
      path.join(dir, 'dist', 'index.js'),
      'export function Steps() { return null; }\nexport function Step() { return null; }\n',
    );
    expect(serializeOfficialList(await buildOfficialList(root))).toBe(unbuilt);
  });

  it('refuses a published theme package with no descriptor', async () => {
    theme('bare', {name: '@astryxdesign/theme-bare'}, {descriptor: false});
    await expect(buildOfficialList(root)).rejects.toThrow(
      '@astryxdesign/theme-bare (packages/themes/bare) is published but has no src/bareTheme.ts with a same-stem src/bareTheme.doc.mjs descriptor',
    );
  });

  it('refuses a published theme package whose folder is not its file name', async () => {
    theme('ocean', {name: '@astryxdesign/theme-ocean'});
    fs.renameSync(
      path.join(root, 'packages', 'themes', 'ocean'),
      path.join(root, 'packages', 'themes', 'theme-ocean'),
    );
    await expect(buildOfficialList(root)).rejects.toThrow(
      'has no src/themeOceanTheme.ts with a same-stem src/themeOceanTheme.doc.mjs descriptor',
    );
  });

  it('refuses a published theme package whose descriptor does not read', async () => {
    theme('ocean', {name: '@astryxdesign/theme-ocean'});
    fs.writeFileSync(
      path.join(
        root,
        'packages',
        'themes',
        'ocean',
        'src',
        'oceanTheme.doc.mjs',
      ),
      'export default {};\n',
    );
    await expect(buildOfficialList(root)).rejects.toThrow(
      'must declare its public ThemeDoc type',
    );
  });
});
