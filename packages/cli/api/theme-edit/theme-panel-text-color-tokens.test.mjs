// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A panel's text is the text color tokens its heading and text read (a
 * drawer's, a bottom sheet's), and an inputs fill lands where each member
 * paints its box (a date and time field's two boxes). Against real bundled
 * base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture(
    'astryx-theme-panel-text-color-tokens-',
    FIXTURE_PACKAGES,
  );
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

/** @param {string} q @param {string} theme */
const answer = async (q, theme) => {
  const {data} = await themeEditHow(q, {cwd, theme});
  return {
    parts: data.understood?.parts ?? [],
    writes: (data.results ?? [])
      .flatMap((/** @type {any} */ r) => r.commands)
      .filter((/** @type {string} */ c) => / editor set /.test(c))
      .map((/** @type {string} */ c) => c.replace(/^.*? editor /, '')),
    text: (data.results ?? []).map((/** @type {any} */ r) => r.text).join('\n'),
  };
};

describe('panel text color tokens', () => {
  it("a panel's text color is its heading and text's tokens", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('d', {cwd, like: 'neutral'});
    for (const part of [
      'drawer',
      'bottom sheet',
      'alert dialog',
      'hover card',
    ]) {
      const r = await answer(`make the ${part} text #b91c1c`, 'd');
      expect(r.writes.join('\n'), part).toMatch(
        /--color-text-primary '#b91c1c'/,
      );
      expect(r.writes.join('\n'), part).not.toMatch(/ color '#b91c1c'/);
    }
  }, 240_000);

  it("an inputs fill paints a date and time field's boxes", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('f', {cwd, like: 'neutral'});
    await themeEditSet('f', 'background-color', '#e6e0e9', {
      cwd,
      on: 'inputs',
    });
    const css = fs.readFileSync(path.join(cwd, 'themes', 'f', 'f.css'), 'utf8');
    expect(css).toMatch(
      /astryx-date-time-input-date-segment[^{]*\{[^}]*#e6e0e9/i,
    );
  }, 240_000);
});
