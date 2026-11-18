// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Part facts read from Core: the elements a part is rendered as (a table
 * row's box takes no padding, so its cells do) and the corners Core draws by
 * place on the parts inside it (a button group's end buttons). Against real
 * bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
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
  cwd = makeLinkedFixture('astryx-theme-parts53-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'butter']);
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

describe('padding on a table row', () => {
  it('is refused for the cells, which take it, and how answers on the cells', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('n', {cwd, like: 'neutral'});
    const r = await refusal(() =>
      themeEditSet('n', 'padding', '20px', {cwd, on: 'table-row'}),
    );
    expect(r.code).toBe('ERR_THEME_NO_EFFECT');
    expect(r.run).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/set n padding 20px --on table-cell$/),
      ]),
    );
    const {data} = await themeEditHow('table rows padding 16px', {
      cwd,
      theme: 'n',
    });
    const commands = (data.results ?? [])
      .flatMap((/** @type {any} */ x) => x.commands)
      .join('\n');
    expect(commands).toMatch(/set n padding 16px --on table-cell/);
    expect(commands).not.toMatch(/padding 16px --on table-row/);
  }, 240_000);
});

describe('corners on a button group', () => {
  it("are its end buttons' corner token, written on the group", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('g', {cwd, like: 'neutral'});
    const r = await themeEditSet('g', 'corners', 'square', {
      cwd,
      on: 'button-group',
    });
    expect(r.data.styled.join('\n')).toMatch(
      /button-group: --radius-element 0px/,
    );
    expect(r.data.styled.join('\n')).not.toMatch(/border-radius/);
  }, 240_000);
});
