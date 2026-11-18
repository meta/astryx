// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * One-mode borders on a part with no line take no room; a divider's line
 * is reached per variant (color, thickness by an amount, removal) and a
 * setting on the divider's own element is refused; a token family follows
 * a light-dark() source; a variant's contrast problem is listed once,
 * scoped; a status keeps its own ring under a state shadow; pieces named
 * after a part's catalog name. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import * as fs from 'node:fs';
import * as path from 'node:path';
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
  cwd = makeLinkedFixture('astryx-theme-parts68-', FIXTURE_PACKAGES);
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

/** The first answer's commands, bare. @param {string} q @param {string} theme */
const top = async (q, theme) => {
  const {data} = await themeEditHow(q, {cwd, theme});
  const r = (data.results ?? []).find(x =>
    x.commands.some(c => / editor (set|undo) /.test(c)),
  );
  return {
    text: (data.results ?? []).map(x => x.text).join('\n'),
    commands: (r?.commands ?? []).map(c => c.replace(/^.*? editor /, '')),
  };
};

/** @param {string} slug */
const cssOf = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

describe('a one-mode border on a part that draws none', () => {
  it('is a ring that takes no room, never a border in the other mode', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('b', {cwd, like: 'neutral'});
    expect(
      (await top('make the button border red in dark mode', 'b')).commands,
    ).toEqual([
      "set b box-shadow 'inset 0 0 0 1px light-dark(transparent, #dc2626)' --on button --when elevation:none",
    ]);
  }, 240_000);

  it('keeps the outline dial beside the one-mode colors of outlined buttons', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o', {cwd, like: 'neutral'});
    const r = await top('make outline buttons red in dark mode', 'o');
    expect(r.commands[0]).toBe('set o buttons outline');
    expect(r.commands.slice(1).every(x => / --mode dark$/.test(x))).toBe(true);
    expect(r.text).toMatch(/the buttons dial is the same in light and dark/);
  }, 240_000);
});

describe("a divider's line", () => {
  it('takes its color per variant, its thickness by the amount said, and goes away transparent', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('d', {cwd, like: 'neutral'});
    expect(
      (await top('make strong dividers blue in light mode', 'd')).commands,
    ).toEqual([
      "set d --color-border-emphasized '#2563eb' --on divider --when variant:strong --mode light",
    ]);
    expect((await top('make the dividers blue', 'd')).commands).toEqual([
      "set d --color-border '#2563eb' --on divider",
      "set d --color-border-emphasized '#2563eb' --on divider",
    ]);
    expect(
      (await top('make dividers three times as thick', 'd')).commands,
    ).toEqual(['set d --border-width 3px --on divider']);
    expect((await top('make the divider 50% thicker', 'd')).commands).toEqual([
      'set d --border-width 1.5px --on divider',
    ]);
    expect((await top('remove the dividers', 'd')).commands).toEqual([
      'set d --color-border transparent --on divider',
      'set d --color-border-emphasized transparent --on divider',
    ]);
  }, 240_000);

  it("refuses a fill on the divider's own element and a token its variant does not read", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('r', {cwd, like: 'neutral'});
    const fill = await refusal(() =>
      themeEditSet('r', 'background-color', '#ff0000', {cwd, on: 'divider'}),
    );
    expect(fill.code).toBe('ERR_THEME_NO_EFFECT');
    expect(fill.run.join(' ')).toMatch(/--color-border '#ff0000' --on divider/);
    const strong = await refusal(() =>
      themeEditSet('r', '--color-border', '#ff0000', {
        cwd,
        on: 'divider',
        when: 'variant:strong',
      }),
    );
    expect(strong.code).toBe('ERR_THEME_NO_EFFECT');
    expect(strong.run.join(' ')).toMatch(
      /--color-border-emphasized '#ff0000' --on divider --when variant:strong/,
    );
  }, 240_000);
});

describe('a token family', () => {
  it('follows a source written as one light-dark() value', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('f', {cwd, like: 'neutral'});
    await themeEditSet('f', '--color-border', 'light-dark(#000000, #ffffff)', {
      cwd,
    });
    expect(cssOf('f')).toMatch(
      /--color-border-emphasized: light-dark\(#000000, #ffffff\)/,
    );
  }, 240_000);
});

describe("a variant's low-contrast text", () => {
  it('is listed once per variant, with a fix for that variant', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('c', {cwd, like: 'neutral'});
    const r = await themeEditSet('c', 'color', '#f0f0f0', {
      cwd,
      on: 'badge',
      mode: 'light',
    });
    const listed = /** @type {Array<{problem: string, fix: string}>} */ (
      r.data.newProblems
    );
    const variants = listed.map(x => /variant (\w+)/.exec(x.problem)?.[1]);
    expect(variants.length).toBeGreaterThan(1);
    expect(new Set(variants).size).toBe(variants.length);
    for (const x of listed)
      expect(x.fix).toContain(
        `--when variant:${/variant (\w+)/.exec(x.problem)?.[1]}`,
      );
  }, 240_000);
});

describe('borders and thickness on parts with no line', () => {
  it("never colors a toast's border through a ghost button that draws none", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('t', {cwd, like: 'neutral'});
    const r = await top('make the toast border red', 't');
    expect(r.commands.join(' ')).not.toMatch(/--color-border/);
  }, 240_000);

  it("makes a slider's track thicker by its own height", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('s', {cwd, like: 'neutral'});
    expect((await top('make the slider track thicker', 's')).commands).toEqual([
      'set s height 6px --on slider-track --when orientation:horizontal',
    ]);
  }, 240_000);
});

describe('a status ring under a state shadow', () => {
  it("keeps each status's own hover ring where the plain one is kept", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('h', {cwd, like: 'neutral'});
    const {commands} = await top(
      'make hovered inputs have a blue shadow in dark mode',
      'h',
    );
    const m = /^set h box-shadow '(.*)' --on inputs --state hover$/.exec(
      commands[0],
    );
    expect(m).toBeTruthy();
    await themeEditSet('h', 'box-shadow', /** @type {string[]} */ (m)[1], {
      cwd,
      on: 'inputs',
      state: 'hover',
    });
    expect(cssOf('h')).toMatch(
      /\.astryx-text-input\[data-status="error"\]:hover[^{]*\{\s*box-shadow: var\(--shadow-inset-error\), /,
    );
  }, 240_000);
});

describe("pieces named after a part's catalog name", () => {
  it("reads a select's arrow and a checkbox's check as those parts", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('p', {cwd, like: 'neutral'});
    expect((await top('make the select arrow blue', 'p')).commands).toEqual([
      "set p color '#2563eb' --on selector-indicator-icon",
    ]);
    expect((await top('make the checkbox check red', 'p')).commands).toEqual([
      "set p color '#dc2626' --on checkbox-indicator-check",
    ]);
  }, 240_000);
});
