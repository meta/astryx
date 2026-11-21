// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The states Core marks on a part's own element are the part's to set: a
 * list item's selected state (its rows ride an Item), a checkbox's or
 * radio's hover shown from the part holding its input, and a container's
 * state named on the part inside it that has it (a pagination's current
 * page). Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-part-states-marked-', FIXTURE_PACKAGES);
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

describe('states Core marks on a part', () => {
  it("takes a list item's selected state", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('l', {cwd, like: 'neutral'});
    // (how reads a selected list item as its current one, as main does.)
    expect((await answer('selected list items blue', 'l')).writes).toContain(
      "set l background-color '#2563eb' --on list-item --state current",
    );
    await themeEditSet('l', 'background-color', '#2563eb', {
      cwd,
      on: 'list-item',
      state: 'selected',
    });
    const css = fs.readFileSync(path.join(cwd, 'themes', 'l', 'l.css'), 'utf8');
    // (Written as the attribute Core marks, inside the plain rule: Core's
    // theme takes no style key for a list item's selected.)
    expect(css).toMatch(
      /\.astryx-list-item(?::is\()?\[data-selected="selected"\]/,
    );
  }, 240_000);

  it("refuses a checkbox's or radio's hover on the box, as main does", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('h', {cwd, like: 'neutral'});
    for (const on of ['checkbox-indicator', 'radio-indicator']) {
      const r = await refusal(() =>
        themeEditSet('h', 'background-color', '#dc2626', {
          cwd,
          on,
          state: 'hover',
          only: true,
        }),
      );
      expect(r.code, on).toBe('ERR_THEME_NO_EFFECT');
      expect(r.message, on).toMatch(/invisible input/);
    }
  }, 240_000);

  it("names a container's state on the part inside it that has it", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('p', {cwd, like: 'neutral'});
    const r = await refusal(() =>
      themeEditSet('p', 'background-color', '#2563eb', {
        cwd,
        on: 'pagination',
        state: 'selected',
      }),
    );
    expect(r.code).toBe('ERR_THEME_UNKNOWN_STATE');
    // (Its own cell first; the Button the cell is drawn on has it too.)
    expect(r.message).toMatch(/ pagination-item(?:, [a-z-]+)* ha(?:s|ve) it\./);
    expect(r.run[0]).toMatch(/ --on pagination-item --state selected$/);
  }, 240_000);
});
