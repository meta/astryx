// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The twenty-eighth pass over `astryx experimental theme editor`: the
 * render key reads the files Core runs from, a page edited by hand is
 * rendered again, and a folder in place of an output written for some
 * themes only is refused by name.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditShow} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {withRealRenders} from '../../test-utils/theme-render-stub.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

const renders = vi.hoisted(() => ({count: 0}));
vi.mock('./_parts.mjs', async importOriginal => {
  const actual = /** @type {any} */ (await importOriginal());
  return {
    ...actual,
    renderGenerated: async (/** @type {any[]} */ ...args) => {
      renders.count += 1;
      return actual.renderGenerated(...args);
    },
  };
});
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt28-', FIXTURE_PACKAGES);
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug @param {string} file */
const at = (slug, file) => path.join(cwd, 'themes', slug, file);

describe('hunt28', () => {
  it('N3: a page edited by hand, or junk under a pasted key, is rendered again', async () => {
    await themeEditNew('p', {cwd});
    await withRealRenders(async () => {
      await themeEditShow('p', {cwd});
      const page = at('p', 'preview.html');
      const stamp = /<!-- astryx: render of [0-9a-f]{24} [0-9a-f]{16} -->/.exec(
        fs.readFileSync(page, 'utf8'),
      )?.[0];
      expect(stamp).toBeTruthy();
      fs.writeFileSync(page, `junk\n${stamp}\n`);
      renders.count = 0;
      await themeEditShow('p', {cwd});
      expect(renders.count).toBeGreaterThan(0);
      expect(fs.readFileSync(page, 'utf8')).not.toMatch(/^junk/);
      renders.count = 0;
      await themeEditShow('p', {cwd});
      expect(renders.count).toBe(0);
    });
  }, 480_000);

  it('N2: a folder in place of the variants types is refused by name', async () => {
    await themeEditNew('v', {cwd});
    fs.mkdirSync(at('v', 'v.variants.d.ts'));
    const r = await refusal(() => themeEditShow('v', {cwd}));
    expect(r.code).toBe('ERR_FILE_EXISTS');
    expect(r.run[0]).toBe('ls -la themes/v/v.variants.d.ts');
    fs.rmdirSync(at('v', 'v.variants.d.ts'));
  }, 240_000);
});
