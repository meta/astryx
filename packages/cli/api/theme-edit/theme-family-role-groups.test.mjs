// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The family roles the census reads from the parts' own structure are
 * groups `--on` takes: each expands to its members, and a look set on one
 * never overwrites a member the theme set the same thing on itself. A look
 * said of one member (a gradient, a frame, a selected pill) reaches its
 * family; set on one member names the members without it, with the family
 * line. The looks are Bootstrap 1.4's. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {context} from './_context.mjs';
import {groupsOf} from './_settings.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-family-role-groups-', FIXTURE_PACKAGES);
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

describe('family role groups', () => {
  it('each expand to the members their structure gives', async ctx => {
    if (needBases(ctx)) return;
    const groups = groupsOf(await context(cwd));
    const has = (/** @type {string} */ g, /** @type {string[]} */ ms) =>
      expect(groups[g], g).toEqual(expect.arrayContaining(ms));
    has('button-like', ['button', 'toggle-button']);
    has('overlays', [
      'dialog',
      'drawer',
      'bottom-sheet',
      'popover',
      'hover-card',
    ]);
    has('option-rows', ['dropdown-menu-item', 'typeahead-option']);
    has('selected-items', [
      'calendar-day',
      'side-nav-item',
      'segmented-control-item',
    ]);
    has('accent-fills', ['button', 'progress-bar-fill']);
    has('inset-fields', ['text-input', 'slider-track']);
    has('status-surfaces', ['banner', 'toast']);
    has('overlay-headers', ['dialog-header', 'drawer-header']);
    // (A badge or a dot is a mark, not a status surface.)
    expect(groups['status-surfaces']).not.toContain('badge');
    // (A selectable item is never button-like; a tooltip is no surface.)
    expect(groups['button-like']).not.toContain('segmented-control-item');
    expect(groups.overlays).not.toContain('tooltip');
  }, 240_000);

  it('a look on a group keeps a member the theme set itself', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('k', {cwd, like: 'neutral'});
    await themeEditSet('k', 'background-image', 'linear-gradient(red, blue)', {
      cwd,
      on: 'toggle-button',
    });
    await themeEditSet(
      'k',
      'background-image',
      'linear-gradient(#ffffff, #e6e6e6)',
      {cwd, on: 'button-like'},
    );
    const css = fs.readFileSync(path.join(cwd, 'themes', 'k', 'k.css'), 'utf8');
    const rule = (/** @type {string} */ p) =>
      new RegExp(`\\.astryx-${p} \\{[^}]*\\}`).exec(css)?.[0] ?? '';
    expect(rule('button')).toMatch(/linear-gradient\(#ffffff, #e6e6e6\)/);
    expect(rule('toggle-button')).toMatch(/linear-gradient\(red, blue\)/);
  }, 240_000);

  it("keeps a member's own setting in every mode it sets, against a one-mode group look", async ctx => {
    if (needBases(ctx)) return;
    // Both modes: a dark-only group look leaves the member's own in dark.
    await themeEditNew('km', {cwd, like: 'neutral'});
    await themeEditSet('km', 'background-image', 'linear-gradient(red, blue)', {
      cwd,
      on: 'toggle-button',
    });
    await themeEditSet(
      'km',
      'background-image',
      'linear-gradient(#111111, #222222)',
      {cwd, on: 'button-like', mode: 'dark'},
    );
    const both = fs.readFileSync(
      path.join(cwd, 'themes', 'km', 'km.css'),
      'utf8',
    );
    const toggle = (/** @type {string} */ css) =>
      (css.match(/\.astryx-toggle-button\b[^{]*\{[^}]*\}/g) ?? []).join('\n');
    expect(toggle(both)).toMatch(/linear-gradient\(red, blue\)/);
    expect(toggle(both)).not.toMatch(/linear-gradient\(#111111, #222222\)/);
    // One mode: the member keeps its own there; the group look takes the other.
    await themeEditNew('kl', {cwd, like: 'neutral'});
    await themeEditSet('kl', 'background-image', 'linear-gradient(red, blue)', {
      cwd,
      on: 'toggle-button',
      mode: 'light',
    });
    await themeEditSet(
      'kl',
      'background-image',
      'linear-gradient(#111111, #222222)',
      {cwd, on: 'button-like'},
    );
    const one = fs.readFileSync(
      path.join(cwd, 'themes', 'kl', 'kl.css'),
      'utf8',
    );
    expect(toggle(one)).toMatch(/linear-gradient\(red, blue\)/);
  }, 240_000);
});

/** @param {string} q @param {string} theme */
const first = async (q, theme) =>
  ((await themeEditHow(q, {cwd, theme})).data.results?.[0]?.commands ?? []).map(
    (/** @type {string} */ c) => c.replace(/^.*? editor /, ''),
  );

/** @param {string} theme */
const cssOf = theme =>
  fs.readFileSync(path.join(cwd, 'themes', theme, `${theme}.css`), 'utf8');

/** @param {string} css @param {string} sel */
const ruleOf = (css, sel) =>
  new RegExp(`${sel.replace(/[.[\]"=]/g, '\\$&')} \\{[^}]*\\}`).exec(
    css,
  )?.[0] ?? '';

describe('a family look said of one member (Bootstrap 1.4)', () => {
  it('the button gradient reaches the toggle buttons', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('b', {cwd, like: 'neutral'});
    const lines = await first(
      'buttons with a gradient from #ffffff to #e6e6e6',
      'b',
    );
    expect(lines).toEqual([
      "set b background 'linear-gradient(#ffffff, #e6e6e6)' --on button-like",
    ]);
    // The answer names the widening: the family and every member it reaches.
    const {data} = /** @type {any} */ (
      await themeEditHow('buttons with a gradient from #ffffff to #e6e6e6', {
        cwd,
        theme: 'b',
      })
    );
    expect(String(data.results[0].text)).toMatch(
      /\(on button-like: every part of that family that draws alike, [^)]*\bbutton\b[^)]*\btoggle-button\b/,
    );
    await themeEditSet('b', 'background', 'linear-gradient(#ffffff, #e6e6e6)', {
      cwd,
      on: 'button-like',
    });
    expect(ruleOf(cssOf('b'), '.astryx-toggle-button')).toMatch(
      /linear-gradient\(#ffffff, #e6e6e6\)/,
    );
  }, 240_000);

  it('the menu-row gradient reaches every option row', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o', {cwd, like: 'neutral'});
    expect(
      await first('menu rows with a gradient from #049cdb to #0064cd', 'o'),
    ).toEqual([
      "set o background 'linear-gradient(#049cdb, #0064cd)' --on option-rows",
    ]);
    await themeEditSet('o', 'background', 'linear-gradient(#049cdb, #0064cd)', {
      cwd,
      on: 'option-rows',
    });
    for (const p of ['typeahead-option', 'selector-option-row'])
      expect(ruleOf(cssOf('o'), `.astryx-${p}`), p).toMatch(
        /linear-gradient\(#049cdb, #0064cd\)/,
      );
  }, 240_000);

  it('the modal frame reaches the drawer, sheet, popover and hover card', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('d', {cwd, like: 'neutral'});
    const lines = await first(
      'dialogs with a 1px solid #4d4d4d border and a 0 3px 7px #4d4d4d shadow',
      'd',
    );
    expect(lines).toEqual([
      "set d border '1px solid #4d4d4d' --on overlays",
      "set d box-shadow '0 3px 7px #4d4d4d' --on overlays",
    ]);
    // (A shadow alone, or a removal, stays the dialog's.)
    expect(await first('no shadow on dialogs', 'd')).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/--on overlays/)]),
    );
  }, 240_000);

  it('the selected pill, set on one item, names the family and its line', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('p', {cwd, like: 'neutral'});
    const r = await themeEditSet('p', 'border-radius', '4px', {
      cwd,
      on: 'side-nav-item',
      state: 'selected',
    });
    const note = JSON.stringify(r.data?.leftOut ?? []);
    expect(note).toMatch(/calendar-day/);
    expect(note).toContain('--on selected-items --state selected');
    for (const [thing, v] of [
      ['border-radius', '4px'],
      ['background-color', '#0069d6'],
      ['color', '#ffffff'],
    ])
      await themeEditSet('p', thing, v, {
        cwd,
        on: 'selected-items',
        state: 'selected',
      });
    const day = ruleOf(
      cssOf('p'),
      '.astryx-calendar-day[data-selected="selected"]',
    );
    expect(day).toMatch(/border-radius: 4px/);
    expect(day).toMatch(/background-color: #0069d6/);
  }, 240_000);
});

describe('alerts and overlay headers (Bootstrap 1.4)', () => {
  it('the alert gradient reaches the toasts; the header rule every overlay header', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('a', {cwd, like: 'neutral'});
    expect(
      await first('banners with a gradient from #fceec1 to #eedc94', 'a'),
    ).toEqual([
      "set a background 'linear-gradient(#fceec1, #eedc94)' --on status-surfaces",
    ]);
    const r = await themeEditSet('a', 'border-bottom', '1px solid #eeeeee', {
      cwd,
      on: 'dialog-header',
    });
    const note = JSON.stringify(r.data?.leftOut ?? []);
    expect(note).toMatch(/drawer-header/);
    expect(note).toContain('--on overlay-headers');
  }, 240_000);
});
