// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Family reach is the editor's default: a setting on one part reaches the
 * members of its family that draw the same thing alike, unless --only. A
 * part's own setting wins over its group's or family's whatever the order;
 * a later setting on another member of a thing the family already carries
 * is that member's drill-in; one undo takes a spread back; show says which
 * settings reach a family and which drill in. Against real bundled base
 * themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-family-reach-', FIXTURE_PACKAGES);
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

/** @param {string} theme */
const cssOf = theme =>
  fs.readFileSync(path.join(cwd, 'themes', theme, `${theme}.css`), 'utf8');

/** @param {string} css @param {string} part */
const ruleOf = (css, part) =>
  new RegExp(`\\.astryx-${part} \\{[^}]*\\}`).exec(css)?.[0] ?? '';

/** @param {string} theme */
const settingsOf = theme =>
  JSON.parse(
    fs.readFileSync(
      path.join(cwd, 'themes', theme, `${theme}.settings.json`),
      'utf8',
    ),
  ).settings;

const GRADIENT = 'linear-gradient(#ffffff, #e6e6e6)';

describe('family reach by default', () => {
  it('a look set on one member reaches the members drawn alike; --only keeps it to the member', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('r', {cwd, like: 'neutral'});
    const r = await themeEditSet('r', 'background-image', GRADIENT, {
      cwd,
      on: 'button',
    });
    expect(r.data.group?.name).toBe('button-like');
    expect(r.data.parts).toEqual(
      expect.arrayContaining(['button', 'toggle-button']),
    );
    expect(r.data.group?.only).toMatch(/--on button --only$/);
    expect(r.data.notes.join(' ')).toMatch(
      /reaches button's family \(button-like\).*toggle-button.*--only/,
    );
    expect(ruleOf(cssOf('r'), 'toggle-button')).toContain(GRADIENT);
    // One undo takes the spread back from every part it reached.
    await themeEditUndo('r', {cwd});
    expect(ruleOf(cssOf('r'), 'toggle-button')).not.toContain(GRADIENT);
    const only = await themeEditSet('r', 'background-image', GRADIENT, {
      cwd,
      on: 'button',
      only: true,
    });
    expect(only.data.parts).toEqual(['button']);
    expect(only.data.group).toBeNull();
    expect(ruleOf(cssOf('r'), 'toggle-button')).not.toContain(GRADIENT);
  }, 240_000);

  it("a member's own setting wins over the family's, set before or after", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o', {cwd, like: 'neutral'});
    // Before: the toggle button's own, then the family's from the button.
    await themeEditSet('o', 'background-image', 'linear-gradient(red, blue)', {
      cwd,
      on: 'toggle-button',
      only: true,
    });
    const r = await themeEditSet('o', 'background-image', GRADIENT, {
      cwd,
      on: 'button',
    });
    expect(r.data.group?.kept).toEqual(['toggle-button']);
    expect(r.data.parts).not.toContain('toggle-button');
    expect(r.data.notes.join(' ')).toMatch(/toggle-button keeps its own/);
    const css = cssOf('o');
    expect(ruleOf(css, 'button')).toContain(GRADIENT);
    expect(ruleOf(css, 'toggle-button')).toContain('linear-gradient(red, blue)');
  }, 240_000);

  it('a later setting on another member is its drill-in; undo gives it the family look back', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('d', {cwd, like: 'neutral'});
    await themeEditSet('d', 'background-image', GRADIENT, {cwd, on: 'button'});
    const drill = await themeEditSet(
      'd',
      'background-image',
      'linear-gradient(red, blue)',
      {cwd, on: 'toggle-button'},
    );
    expect(drill.data.setting.only).toBe(true);
    expect(drill.data.parts).toEqual(['toggle-button']);
    expect(drill.data.notes.join(' ')).toMatch(
      /toggle-button keeps this on its own \(saved with --only\).*--on button-like/,
    );
    // The family keeps the button's look everywhere else.
    expect(settingsOf('d')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({on: 'button', value: GRADIENT}),
        expect.objectContaining({on: 'toggle-button', only: true}),
      ]),
    );
    const show = await themeEditShow('d', {cwd});
    const entry = (/** @type {string} */ on) =>
      show.data.settings.find(
        (/** @type {any} */ s) => s.on === on && s.thing === 'background-image',
      );
    expect(entry('button')?.reach).toEqual(
      expect.objectContaining({family: 'button-like', kept: ['toggle-button']}),
    );
    expect(entry('toggle-button')?.reach).toEqual(
      expect.objectContaining({family: 'button-like', drillIn: true}),
    );
    expect(entry('toggle-button')?.reach?.over).toMatch(/on button\b/);
    const undo = await themeEditUndo('d', {
      thing: 'background-image',
      cwd,
      on: 'toggle-button',
      only: true,
    });
    expect(undo.data.now).toMatch(/background-image = .*on button\b/);
    expect(ruleOf(cssOf('d'), 'toggle-button')).toContain(GRADIENT);
  }, 240_000);

  it("a menu row's hover look reaches each list option in the state that draws the row the pointer is on", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('h', {cwd, like: 'neutral'});
    const look = 'linear-gradient(#eeeeee, #dddddd)';
    const r = await themeEditSet('h', 'background-image', look, {
      cwd,
      on: 'dropdown-menu-item',
      state: 'focus',
    });
    expect(r.data.parts).toEqual(expect.arrayContaining(['typeahead-option']));
    // (A typeahead option draws that row as highlighted, never on focus.)
    const css = cssOf('h');
    const rule = new RegExp(
      `\\.astryx-typeahead-option\\[data-highlighted[^{]*\\{[^}]*${look.replace(/[()#,]/g, '\\$&')}`,
    );
    expect(css).toMatch(rule);
  }, 240_000);

  it('a member that draws the thing differently is left as Core draws it', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('k', {cwd, like: 'neutral'});
    // (A checkbox has small corners where a radio is round.)
    const r = await themeEditSet('k', 'border-radius', '2px', {
      cwd,
      on: 'checkbox-indicator',
    });
    expect(r.data.parts).toEqual(['checkbox-indicator']);
  }, 240_000);
});
