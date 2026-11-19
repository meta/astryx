// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Asks that name a part by reference or in more than one state: "the
 * disabled one", "the others", two states at once by their kind, a
 * selected row hovered, a switch's on color, a border on a part that draws none,
 * tighter table rows. Against real bundled base themes.
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
  cwd = makeLinkedFixture('astryx-theme-asks-of-parts-', FIXTURE_PACKAGES);
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

describe('asks of parts', () => {
  it('reads each part, state and reference as Core draws it', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('a', {cwd, like: 'neutral'});
    /** @param {string} q */
    const top = async q => {
      const {data} = await themeEditHow(q, {cwd, theme: 'a'});
      const r = (data.results ?? [])[0];
      return {
        lines: (r?.commands ?? []).map((/** @type {string} */ c) =>
          c.replace(/^.*? editor /, ''),
        ),
        text: (data.results ?? [])
          .map((/** @type {any} */ x) => x.text)
          .join('\n'),
      };
    };
    // A border on a list inside an overlay's surface is the surface's edge.
    const list = await top('give the typeahead dropdown a red border');
    expect(list.lines).toEqual(['how popover']);
    expect(list.text).toMatch(/every popover/);
    // A divider's border is its line's color.
    expect((await top('make the divider border red')).lines).toEqual([
      "set a --color-border '#dc2626' --on divider",
      "set a --color-border-emphasized '#dc2626' --on divider",
    ]);
    // A selected row hovered: the selected wash's token, set for hover.
    expect((await top('make the row hovered and selected blue')).lines[0]).toBe(
      "set a --color-accent-muted '#2563eb' --on table-row --state hover",
    );
    // "The disabled one" is the element named, never its place.
    expect(
      (
        await top(
          'make the hovered item of menus blue and the disabled one gray',
        )
      ).lines,
    ).toEqual([
      "set a background-color '#2563eb' --on dropdown-menu-item --state hover",
      "set a background-color '#9e9e9e' --on dropdown-menu-item --state disabled",
    ]);
    // A condition said with another state is both at once, with each one
    // alone as the other reading; moment states said together are each,
    // with both at once as the other reading.
    const checks = await top('make the checked and disabled checkboxes gray');
    expect(checks.lines[0]).toMatch(
      /--on checkbox-indicator --state checked\+disabled/,
    );
    expect(checks.text).toMatch(
      /or each state alone: .*--state checked .*--state disabled /,
    );
    const moments = await top('hovered and pressed buttons should be orange');
    expect(moments.lines[0]).toBe(
      "set a background-color '#f97316' --on button --state hover",
    );
    expect(moments.text).toMatch(
      /or hover and pressed at once: .*--state hover\+active/,
    );
    // A switch's on color is its checked look.
    expect((await top('switch on color #635bff')).lines).toEqual([
      "set a background-color '#635bff' --on switch --state checked",
    ]);
    // "The others" are the part's other variants, or the part not in the
    // state named.
    expect(
      (await top('primary buttons blue and the others gray')).lines,
    ).toEqual([
      "set a background-color '#2563eb' --on button --when variant:primary",
      "set a background-color '#9e9e9e' --on button --when variant:secondary",
      "set a background-color '#9e9e9e' --on button --when variant:ghost",
      "set a background-color '#9e9e9e' --on button --when variant:destructive",
    ]);
    expect(
      (await top('make the selected tab text white and the others gray')).lines,
    ).toEqual([
      "set a color '#ffffff' --on tab --state selected",
      "set a color '#9e9e9e' --on tab",
    ]);
    // Tighter table rows: the spacing step on the rows first, then the
    // body cells' block padding one spacing step down, never the header
    // alone.
    const {data: rows} = await themeEditHow(
      'table rows should be tighter so more rows fit',
      {cwd, theme: 'a'},
    );
    const [first] = rows.results ?? [];
    const lines = first.commands.map((/** @type {string} */ c) =>
      c.replace(/^.*? editor /, ''),
    );
    expect(lines).toEqual([
      'set a spacing less --on table-row',
      "set a padding-block 'var(--spacing-1-5)' --on table-cell",
      "set a padding-block 'var(--spacing-1-5)' --on table-header-cell",
    ]);
  }, 240_000);

  it("refuses a border's color or width on a part that draws no border", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('b', {cwd, like: 'neutral'});
    const color = await refusal(() =>
      themeEditSet('b', 'border-color', 'red', {cwd, on: 'divider'}),
    );
    expect(color.code).toBe('ERR_THEME_NO_EFFECT');
    expect(color.run[0]).toMatch(/ set b --color-border red --on divider$/);
    const width = await refusal(() =>
      themeEditSet('b', 'border-width', '3px', {cwd, on: 'divider'}),
    );
    expect(width.code).toBe('ERR_THEME_NO_EFFECT');
    expect(width.run[0]).toMatch(/ set b --border-width 3px --on divider$/);
    // (A part that draws a border keeps it.)
    await themeEditSet('b', 'border-color', 'red', {cwd, on: 'card'});
  }, 240_000);
});
