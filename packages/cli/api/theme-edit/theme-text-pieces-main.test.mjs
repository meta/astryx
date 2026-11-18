// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A text property set on a part whose text is drawn by pieces inside
 * it (a dialog title block's title and description, a top nav heading's
 * heading and superheading) is set on the main piece, the largest text at
 * rest, through the token it reads; the result names that piece and the
 * other pieces' tokens. A part that draws its own text is set as before.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-text-pieces-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {any} r */
const written = r => JSON.stringify(r.data.setting ?? r.data);

/** @param {any} r */
const notes = r => JSON.stringify(r.data.notes ?? r.data.setting?.note ?? '');

describe('a part whose text is drawn by pieces inside it', () => {
  it("sets the dialog title block's title, naming its description", async () => {
    await themeEditNew('t1', {cwd, like: 'neutral'});
    for (const [prop, value, main, other] of [
      ['font-size', '14px', '--text-heading-2-size', '--font-size-sm'],
      ['font-weight', '700', '--text-heading-2-weight', '--text-body-weight'],
      ['color', '#ffffff', '--color-text-primary', '--color-text-secondary'],
    ]) {
      const r = await themeEditSet('t1', prop, value, {
        cwd,
        on: 'dialog-header-title-block',
      });
      expect(written(r), prop).toContain(main);
      expect(notes(r), prop).toMatch(/heading is its main text/);
      expect(notes(r), prop).toContain(`its text reads ${other}`);
    }
  }, 240_000);

  it('sets the top nav heading on its larger text, naming its smaller text', async () => {
    await themeEditNew('t2', {cwd, like: 'neutral'});
    const size = await themeEditSet('t2', 'font-size', '18px', {
      cwd,
      on: 'top-nav-heading',
    });
    expect(written(size)).toContain('--text-large-size');
    expect(notes(size)).toContain(
      'its smaller text reads --text-supporting-size',
    );
    const weight = await themeEditSet('t2', 'font-weight', '700', {
      cwd,
      on: 'top-nav-heading',
    });
    expect(written(weight)).toContain('--font-weight-semibold');
  }, 240_000);

  it('a part that draws its own text is set as before', async () => {
    await themeEditNew('t3', {cwd, like: 'neutral'});
    const r = await themeEditSet('t3', 'font-size', '14px', {cwd, on: 'badge'});
    expect(written(r)).toMatch(/font-size/);
    expect(written(r)).not.toMatch(/--text-supporting-size/);
    expect(notes(r)).not.toMatch(/main text/);
  }, 240_000);
});
