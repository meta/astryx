// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A text color set on rows whose labels are parts of their own (option
 * rows) reaches the tokens those labels read, so a dark row fill keeps
 * readable text. Against a real bundled base theme.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-row-label-color-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a text color on rows whose labels are parts of their own', () => {
  it('reaches the label, so a dark fill keeps readable text on every option row', async ctx => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      ctx.skip();
      return;
    }
    await themeEditNew('nv', {cwd, like: 'neutral'});
    await themeEditSet('nv', 'background-color', '#000080', {
      cwd,
      on: 'option-rows',
      state: 'hover',
    });
    const r = await themeEditSet('nv', 'color', '#ffffff', {
      cwd,
      on: 'option-rows',
      state: 'hover',
    });
    const css = fs.readFileSync(
      path.join(cwd, 'themes', 'nv', 'nv.css'),
      'utf8',
    );
    const hover = (/** @type {string} */ p) =>
      (
        css.match(
          new RegExp(`\\.astryx-${p}\\b[^{]*:hover[^{]*\\{[^}]*\\}`, 'g'),
        ) ?? []
      ).join('\n');
    expect(hover('selector-option-row')).toMatch(
      /--color-text-primary: #ffffff/,
    );
    // (An option's description is the Item's, drawn on the option row's
    // element: it follows too.)
    expect(hover('selector-option-row')).toMatch(
      /--color-text-secondary: #ffffff/,
    );
    expect(
      (r.data.newProblems ?? [])
        .map((/** @type {any} */ p) => p.problem)
        .join(' '),
    ).not.toMatch(/selector-option-row/);
  }, 240_000);

  it('keeps content an app puts inside a part that is no row as it is', async ctx => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      ctx.skip();
      return;
    }
    await themeEditNew('tb', {cwd, like: 'neutral'});
    for (const on of ['table', 'markdown'])
      await themeEditSet('tb', 'color', '#123456', {cwd, on});
    const css = fs.readFileSync(
      path.join(cwd, 'themes', 'tb', 'tb.css'),
      'utf8',
    );
    for (const p of ['table', 'markdown'])
      expect(
        (
          css.match(new RegExp(`\\.astryx-${p}\\b[^{]*\\{[^}]*\\}`, 'g')) ?? []
        ).join('\n'),
        p,
      ).not.toMatch(/--color-text-secondary: #123456/);
  }, 240_000);
});
