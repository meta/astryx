// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Part facts read from Core: a background a part inherits from the region
 * it sits in, a target that shares its element with another, the focus ring
 * an indicator draws inline, the text an element inside a part sizes
 * itself, the edges a part's inner parts draw, a checkbox's indeterminate
 * look, and what an inherited text property reaches. Also `how` answers a
 * color ask with a color, never a filter. Against real bundled base themes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';

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
  cwd = makeLinkedFixture('astryx-theme-parts50-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'butter']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug @param {string} selector */
const ruleOf = (slug, selector) => {
  const css = fs.readFileSync(
    path.join(cwd, 'themes', slug, `${slug}.css`),
    'utf8',
  );
  const i = css.indexOf(`${selector} {`);
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
};

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

/** Every command of a how answer's results, joined. */
const answer = async (/** @type {string} */ question, theme = 'n') => {
  const {data} = await themeEditHow(question, {cwd, theme});
  return /** @type {Array<{commands: string[]}>} */ (data.results ?? [])
    .flatMap(r => r.commands)
    .join('\n');
};

describe('part facts from Core', () => {
  it("reads a side nav's background from the shell region it sits in", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('n', {cwd, like: 'neutral'});
    for (const part of ['side-nav', 'app-shell-sidenav']) {
      const {data} = await themeEditHow(part, {cwd, theme: 'n'});
      expect(data.recorded, part).toBe(true);
      expect(
        data.reads.background.map((/** @type {any} */ r) => r.token),
        part,
      ).toContain('--color-background-body');
    }
  }, 240_000);

  it('answers a color ask with a color, from the page it is compared to', async ctx => {
    if (needBases(ctx)) return;
    const commands = await answer(
      'make the sidebar a little darker than the page background',
    );
    expect(commands).toMatch(
      /set n background-color '#[0-9a-f]{6}' --on side-nav/,
    );
    expect(commands).not.toMatch(/filter/);
  }, 240_000);

  it('refuses the outline on an indicator, whose ring Core draws inline, for its token', async ctx => {
    if (needBases(ctx)) return;
    const width = await refusal(() =>
      themeEditSet('n', 'outline-width', '6px', {
        cwd,
        on: 'checkbox-indicator',
      }),
    );
    expect(width.code).toBe('ERR_THEME_NO_EFFECT');
    expect(width.run[0]).toMatch(
      /set n --focus-outline-width 6px --on checkbox-indicator$/,
    );
    const state = await refusal(() =>
      themeEditSet('n', '--focus-outline-color', '#ff0000', {
        cwd,
        on: 'checkbox-indicator',
        state: 'focus-visible',
        mode: 'dark',
      }),
    );
    expect(state.run[0]).toMatch(
      /set n --focus-outline-color '#ff0000' --on checkbox-indicator --mode dark$/,
    );
    // The pointer works, and the radio indicator takes the ring too.
    await themeEditSet('n', '--focus-outline-color', '#ff0000', {
      cwd,
      on: 'checkbox-indicator',
      mode: 'dark',
    });
    await themeEditSet('n', '--focus-outline-width', '3px', {
      cwd,
      on: 'radio-indicator',
      only: true,
    });
    expect(ruleOf('n', '.astryx-radio-indicator')).toMatch(
      /--focus-outline-width: 3px/,
    );
  }, 240_000);

  it('points a text property on a part whose inner text sizes itself to its token', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('b', {cwd, like: 'butter'});
    const r = await refusal(() =>
      themeEditSet('b', 'font-weight', '700', {cwd, on: 'top-nav-heading'}),
    );
    expect(r.code).toBe('ERR_THEME_NO_EFFECT');
    expect(r.run[0]).toMatch(
      /set b --font-weight-semibold 700 --on top-nav-heading$/,
    );
    expect(await answer('bold app name in the top nav', 'b')).toMatch(
      /set b --font-weight-semibold 700 --on top-nav-heading/,
    );
    const {data} = await themeEditHow('bigger app title', {cwd, theme: 'b'});
    const text = JSON.stringify(data.results);
    expect(text).toMatch(/--text-large-size/);
    expect(text).not.toMatch(/font-size 1\.094rem/);
  }, 240_000);

  it('routes a border on a date-time input to the boxes that draw its edges', async ctx => {
    if (needBases(ctx)) return;
    const r = await refusal(() =>
      themeEditSet('n', 'border-color', '#ff0000', {
        cwd,
        on: 'date-time-input',
        only: true,
      }),
    );
    expect(r.code).toBe('ERR_THEME_NO_EFFECT');
    expect(r.run).toEqual([
      expect.stringMatching(/--on date-time-input-date-segment$/),
      expect.stringMatching(/--on date-time-input-time-segment$/),
    ]);
    const commands = await answer('red border on the date and time input');
    expect(commands).toMatch(/--on date-time-input-date-segment/);
    expect(commands).toMatch(/--on date-time-input-time-segment/);
  }, 240_000);

  it("reaches a checkbox's indeterminate look, and how covers it with checked", async ctx => {
    if (needBases(ctx)) return;
    await themeEditSet('n', 'background', '#16a34a', {
      cwd,
      on: 'checks',
      when: 'checked:indeterminate',
    });
    expect(
      ruleOf('n', '.astryx-checkbox-indicator[data-checked="indeterminate"]'),
    ).toMatch(/#16a34a/);
    const commands = await answer('green checkboxes');
    expect(commands).toMatch(/--on checks --state checked/);
    expect(commands).toMatch(/--on checks --when checked:indeterminate/);
  }, 240_000);

  it('says which inner parts an inherited text property reaches', async ctx => {
    if (needBases(ctx)) return;
    const r = await themeEditSet('n', 'text-transform', 'uppercase', {
      cwd,
      on: 'side-nav-section',
    });
    expect(r.data.notes.join(' ')).toMatch(
      /text-transform is inherited, so it also reaches side-nav-item/,
    );
  }, 240_000);
});

describe('striped rows', () => {
  it('colors and removes the stripes with the token Core paints them with', async ctx => {
    if (needBases(ctx)) return;
    expect(await answer('striped table rows in light blue')).toMatch(
      /set n --color-background-muted '#[0-9a-f]{6}' --on table-row/,
    );
    expect(await answer('no zebra stripes on tables')).toMatch(
      /set n --color-background-muted transparent --on table-row/,
    );
  }, 240_000);
});
