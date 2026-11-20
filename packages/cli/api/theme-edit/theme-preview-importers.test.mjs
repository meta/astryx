// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The importer scan behind `preview remove` reads at most the source
 * files it is given as its limit, and past them reports so; `remove` then
 * refuses with nothing removed. The scan is read on a small real tree with
 * a small limit, and once through the command, whose scan is given a small
 * limit by this file's module stand-in.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditPreviewAdd, themeEditPreviewRemove} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {appPackages, refusal} from '../../test-utils/theme-edit-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

// The command's scan, given a limit of 2 source files: the command passes
// its own limit, which this stand-in replaces, as a project past the real
// one would reach it.
vi.mock('./_importers.mjs', async importOriginal => {
  const real = /** @type {typeof import('./_importers.mjs')} */ (
    await importOriginal()
  );
  return {
    ...real,
    pageImporters: (
      /** @type {Parameters<typeof real.pageImporters>} */ ...args
    ) =>
      real.pageImporters(args[0], args[1], args[2], args[3], {
        ...args[4],
        limit: 2,
      }),
  };
});

/** @type {string} */
let cwd;

/** @param {string} rel @param {string} text */
const write = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(cwd, rel)), {recursive: true});
  fs.writeFileSync(path.join(cwd, rel), text);
};

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-preview-importers-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    `${JSON.stringify(appPackages({packageManager: 'npm@10.9.0'}))}\n`,
  );
  write(
    'src/app/layout.tsx',
    "import '@astryxdesign/core/astryx.css';\nexport default function RootLayout({children}) { return children; }\n",
  );
}, 180_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('the importer scan', () => {
  it('reads at most its limit of source files, names an importer within it, and says when the tree holds more', async () => {
    const {pageImporters} = /** @type {typeof import('./_importers.mjs')} */ (
      await vi.importActual('./_importers.mjs')
    );
    const tree = fs.mkdtempSync(path.join(cwd, 'tree-'));
    const at = (/** @type {string} */ rel) => path.join(tree, rel);
    fs.mkdirSync(at('preview/_pages'), {recursive: true});
    fs.writeFileSync(at('preview/_pages/overview.tsx'), 'export default 1;\n');
    fs.writeFileSync(
      at('uses.ts'),
      "import page from './preview/_pages/overview';\nexport default page;\n",
    );
    fs.writeFileSync(at('other.ts'), 'export const x = 1;\n');
    const data = {files: ['_pages/overview.tsx']};
    const targets = [at('preview/_pages/overview')];
    const within = pageImporters(tree, data, at('preview'), targets, {
      aliases: [],
      limit: 2,
    });
    expect(within).toEqual({
      importers: ['uses.ts'],
      tooBig: false,
      limit: 2,
    });
    // One source file more than the limit: past it, no answer is guessed.
    fs.writeFileSync(at('third.ts'), 'export const y = 2;\n');
    const past = pageImporters(tree, data, at('preview'), targets, {
      aliases: [],
      limit: 2,
    });
    expect(past.tooBig).toBe(true);
    expect(past.limit).toBe(2);
    fs.rmSync(tree, {recursive: true, force: true});
  });

  it('remove refuses past the limit, says so, and removes nothing', async () => {
    await themeEditPreviewAdd(undefined, {cwd, path: 'src/app/z1'});
    // Three source files of the app's own, past the scan's limit of two.
    for (const n of ['a', 'b', 'c'])
      write(`src/lib/${n}.ts`, `export const ${n} = 1;\n`);
    const before = fs.readdirSync(path.join(cwd, 'src/app/z1'), {
      recursive: true,
    });
    const r = await refusal(() =>
      themeEditPreviewRemove(undefined, {cwd, path: 'src/app/z1'}),
    );
    expect(r.message).toContain(
      'This project holds more than 2 source files, too many to check that none of them imports the preview pages, so nothing was removed.',
    );
    expect(
      fs.readdirSync(path.join(cwd, 'src/app/z1'), {recursive: true}),
    ).toEqual(before);
  }, 120_000);
});
