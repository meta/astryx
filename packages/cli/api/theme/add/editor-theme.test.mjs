// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `theme add` wires a theme the theme editor made (./themes/<t>/),
 * and list, use and remove treat it like any local theme.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeAdd} from './add.mjs';
import {themeUse} from '../use/use.mjs';
import {themeRemove} from '../remove/remove.mjs';
import {themeListAvailable} from '../list/list.mjs';
import {themeEditNew} from '../../theme-edit/theme-edit.mjs';
import {resolveThemeModule} from '../../../foundation/config/theme-state.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../../test-utils/base-theme-fixture.mjs';

vi.mock('../../theme-edit/_preview.mjs', async importOriginal =>
  (await import('../../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-editor-add-', FIXTURE_PACKAGES);
  await themeEditNew('ocean', {cwd});
  await themeEditNew('dune', {cwd});
}, 240_000);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {() => Promise<unknown>} run */
async function refusal(run) {
  try {
    await run();
  } catch (error) {
    return /** @type {any} */ (error);
  }
  throw new Error('expected a refusal');
}

const record = () => {
  const {file} = resolveThemeModule(cwd);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
};

describe('theme add with an editor theme', () => {
  it('lists it as a local theme', async () => {
    const list = await themeListAvailable({cwd});
    const ocean = /** @type {any[]} */ (list.data).find(
      t => t.slug === 'ocean',
    );
    expect(ocean).toMatchObject({source: 'local', package: './themes'});
  });

  it('records its built module and stylesheet', async () => {
    await themeAdd('ocean', {cwd});
    const text = record();
    expect(text).toMatch(
      /import \{oceanTheme as \w+\} from "\.\.?\/themes\/ocean\/ocean\.js";/,
    );
    expect(text).toMatch(/import "\.\.?\/themes\/ocean\/ocean\.css";/);
    expect(text).toContain('"ocean":"./themes"');
    const list = await themeListAvailable({cwd});
    expect(
      /** @type {any[]} */ (list.data).find(t => t.slug === 'ocean'),
    ).toMatchObject({added: true});
  }, 240_000);

  it('use and remove keep it coherent', async () => {
    await themeAdd('dune', {cwd});
    await themeUse('dune', {cwd});
    expect(record()).toMatch(/defaultThemeSlug[^;]*"dune"/);
    await themeRemove('ocean', {cwd});
    expect(record()).not.toContain('ocean/ocean.js');
    expect(record()).toMatch(/\/themes\/dune\/dune\.js"/);
  }, 240_000);

  it('refuses an unbuilt editor theme with the editor build step', async () => {
    fs.rmSync(path.join(cwd, 'themes/ocean/ocean.js'));
    const err = await refusal(() => themeAdd('ocean', {cwd}));
    expect(err.message).toContain(
      'made with the theme editor and is not built',
    );
    expect(
      (err.suggestions ?? []).map((/** @type {any} */ s) => s.name),
    ).toContainEqual(
      expect.stringMatching(/experimental theme editor show ocean$/),
    );
  }, 240_000);
});
