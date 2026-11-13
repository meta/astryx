// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The thirty-eighth pass over `astryx experimental theme editor`: an
 * own theme source deleted by hand is written again, exact role sizes and
 * families are named under the dials, and pasted values are read as meant.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
import {editorMissingSource} from './_adapter.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt38-', FIXTURE_PACKAGES);
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {any} r */
const notes = r => (r.data.notes ?? []).join('\n');

describe('hunt38', () => {
  it('R18-A: a no-op set writes a deleted own source again and says so; compile names show', async () => {
    await themeEditNew('a', {cwd});
    const ts = path.join(cwd, 'themes/a/a.theme.ts');
    fs.rmSync(ts);
    const r = await themeEditSet('a', 'mode', 'both', {cwd});
    expect(fs.existsSync(ts)).toBe(true);
    expect(JSON.stringify(r.data)).toMatch(/a\.theme\.ts was missing/);
    fs.rmSync(ts);
    expect(editorMissingSource('themes/a/a.theme.ts', cwd)?.name).toMatch(
      / experimental theme editor show a$/,
    );
    expect(editorMissingSource('themes/a/other.ts', cwd)).toBeNull();
  }, 240_000);

  it('N35: text-size and type name an exact role size they keep', async () => {
    await themeEditNew('s', {cwd});
    await themeEditSet('s', '--text-body-size', '13px', {cwd});
    const size = await themeEditSet('s', 'text-size', '20', {cwd});
    expect(notes(size)).toMatch(/keeps your exact --text-body-size = 13px/);
    await themeEditSet('s', '--text-heading-1-size', '40px', {cwd});
    const type = await themeEditSet('s', 'type', 'display', {cwd});
    expect(notes(type)).toMatch(/--text-heading-1-size = 40px/);
  }, 240_000);

  it('N36: an exact role family is named under a role font, the whole font, and its undo', async () => {
    await themeEditNew('f', {cwd});
    await themeEditSet('f', '--font-family-heading', 'Inter, sans-serif', {
      cwd,
    });
    const role = await themeEditSet('f', 'font', 'georgia', {
      cwd,
      on: 'heading',
    });
    expect(notes(role)).toMatch(
      /keeps your exact --font-family-heading.*undo f --font-family-heading/,
    );
    const whole = await themeEditSet('f', 'font', 'georgia', {cwd});
    expect(notes(whole)).not.toMatch(/a font for one role wins/);
    const undo = await themeEditUndo('f', {cwd, thing: 'font', on: 'heading'});
    expect(/** @type {any} */ (undo.data).now).toMatch(/--font-family-heading/);
  }, 240_000);

  it('N28: !important and pasted font shapes suggest the value meant', async () => {
    await themeEditNew('p', {cwd});
    const imp = await refusal(() =>
      themeEditSet('p', '--font-size-base', '16px !important', {cwd}),
    );
    expect(imp.message).toMatch(/!important is not used/);
    expect(imp.run[0]).toMatch(/ --font-size-base 16px$/);
    for (const [v, want] of [
      ['Georgia, serif;', / font 'Georgia, serif'$/],
      ['Georgia;', / font Georgia$/],
      ['Georgia /* x */', / font Georgia$/],
      ['Georgia !important', / font Georgia$/],
    ]) {
      const r = await refusal(() =>
        themeEditSet('p', 'font', /** @type {string} */ (v), {cwd}),
      );
      expect(r.run[0], String(v)).toMatch(/** @type {RegExp} */ (want));
    }
  }, 240_000);
});
