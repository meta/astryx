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
    expect((await answer('selected list items blue', 'l')).writes).toContain(
      "set l background-color '#2563eb' --on list-item --state selected",
    );
    await themeEditSet('l', 'background-color', '#2563eb', {
      cwd,
      on: 'list-item',
      state: 'selected',
    });
    const css = fs.readFileSync(path.join(cwd, 'themes', 'l', 'l.css'), 'utf8');
    expect(css).toMatch(/\.astryx-list-item\[data-selected="selected"\]/);
  }, 240_000);

  it("shows a checkbox's or radio's hover from the part holding its input", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('h', {cwd, like: 'neutral'});
    await themeEditSet('h', 'background-color', '#dc2626', {
      cwd,
      on: 'checkbox-indicator',
      state: 'hover',
      only: true,
    });
    await themeEditSet('h', 'background-color', '#dc2626', {
      cwd,
      on: 'radio-indicator',
      state: 'hover',
      only: true,
    });
    const css = fs.readFileSync(path.join(cwd, 'themes', 'h', 'h.css'), 'utf8');
    expect(css).toMatch(
      /\.astryx-checkbox-indicator:where\(\.astryx-checkbox-input:hover \*\)/,
    );
    expect(css).toMatch(
      /\.astryx-radio-indicator:where\(\.astryx-[\w-]+:hover \*\)/,
    );
  }, 240_000);

  it("names a container's state on the part inside it that has it", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('p', {cwd, like: 'neutral'});
    const r = await refusal(() =>
      themeEditSet('p', 'background-color', '#2563eb', {
        cwd,
        on: 'pagination',
        state: 'current',
      }),
    );
    expect(r.code).toBe('ERR_THEME_UNKNOWN_STATE');
    expect(r.message).toMatch(/button has it/);
    expect(r.run[0]).toMatch(/ --on button --state current$/);
  }, 240_000);
});
