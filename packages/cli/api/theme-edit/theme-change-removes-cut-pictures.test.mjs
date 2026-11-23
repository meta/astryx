// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A change removes the pictures cut from a tall one
 * (`sheet-containers-1.png`) with the others, so none keeps showing the old
 * look, and names what takes them again.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {recordWritten} from './_settings.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-change-removes-cut-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a change', () => {
  it(
    'removes the pictures cut from a tall one with the others',
    async () => {
      const dir = path.join(cwd, 'themes/t');
      const cut = ['sheet-containers-1.png', 'sheet-containers-dark-2.png'];
      for (const n of cut) fs.writeFileSync(path.join(dir, n), 'png');
      recordWritten(
        cwd,
        't',
        cut.map(n => path.join(dir, n)),
      );
      const r = /** @type {any} */ (
        await themeEditSet('t', 'corners', 'square', {cwd})
      );
      for (const n of cut)
        expect(fs.existsSync(path.join(dir, n)), n).toBe(false);
      const removed = r.data.notes.find((/** @type {string} */ n) =>
        n.startsWith('removed '),
      );
      expect(removed).toContain('themes/t/sheet-containers-1.png');
      expect(removed).toContain('show t --png --section containers');
    },
    T,
  );
});
