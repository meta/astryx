// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The seventy-third pass over `astryx experimental theme editor`: a
 * hand-edited headings value with no axis, or a `mode` or `base` entry in
 * the settings list, is offered only lines that unlock the theme, and
 * following each does.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditShow} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt73-', FIXTURE_PACKAGES);
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('hunt73', () => {
  it.each([
    ['headings', 'bold,'],
    ['base', '"butter"'],
    ['mode', '"dark-only"'],
  ])(
    'a saved %s entry is offered only lines that unlock the theme',
    async (thing, value) => {
      const slug = `n76-${thing}`;
      await themeEditNew(slug, {cwd});
      const file = path.join(cwd, 'themes', slug, `${slug}.settings.json`);
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      j.settings = [{thing, value, source: 'dial'}];
      fs.writeFileSync(file, JSON.stringify(j, null, 2));
      const r = await refusal(() => themeEditShow(slug, {cwd}));
      // mode and base set the theme's own fields: no set line for the entry.
      if (thing !== 'headings')
        expect(r.run.join('\n'), thing).not.toMatch(
          new RegExp(` set ${slug} `),
        );
      // Every line offered is followed; then the theme opens.
      const line = r.run[0];
      expect(line, thing).toMatch(new RegExp(` undo ${slug} ${thing}`));
      const words = line
        .split(' experimental ')[1]
        .split(' ')
        .map(x => x.replace(/^'(.*)'$/, '$1'));
      const ran = await runCli(['experimental', ...words], {cwd});
      expect(ran.status, ran.stderr).toBe(0);
      await themeEditShow(slug, {cwd});
      // For headings, the set line offered (the cleaned value) unlocks too.
      if (thing === 'headings') {
        fs.writeFileSync(file, JSON.stringify(j, null, 2));
        const again = await refusal(() => themeEditShow(slug, {cwd}));
        const set = again.run.find(x => / set /.test(x));
        expect(set).toBeTruthy();
        const w = /** @type {string} */ (set)
          .split(' experimental ')[1]
          .split(' ');
        const r2 = await runCli(
          ['experimental', ...w.map(x => x.replace(/^'(.*)'$/, '$1'))],
          {cwd},
        );
        expect(r2.status, r2.stderr).toBe(0);
        await themeEditShow(slug, {cwd});
      }
    },
    240_000,
  );
});
