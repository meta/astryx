// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * States Core paints from ARIA attributes, several states at once, a
 * group spreading only where its members are alike, scoped tokens on the
 * parts a list or a menu holds, and a fill drawn inside a part. Against
 * real bundled base themes.
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
  cwd = makeLinkedFixture(
    'astryx-theme-states-core-paints-aria-',
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

describe('a state Core paints from an ARIA attribute', () => {
  it("names an open menu button as a state, and a pagination's current page as its cell's", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('a', {cwd, like: 'neutral'});
    const {data} = await themeEditHow('button', {cwd, theme: 'a'});
    expect(data.states).toEqual(
      expect.arrayContaining(['pressed', 'expanded']),
    );
    // The current page is a part of its own, in its own state.
    const cell = await themeEditHow('pagination-item', {cwd, theme: 'a'});
    expect(cell.data.states).toContain('selected');
    await themeEditSet('a', 'background-color', '#ff0000', {
      cwd,
      on: 'pagination-item',
      state: 'selected',
    });
    await themeEditSet('a', 'background-color', '#0000ff', {
      cwd,
      on: 'button',
      state: 'expanded',
    });
    const css = cssOf('a');
    expect(css).toMatch(
      /\.astryx-pagination-item\[data-selected="selected"\]\s*\{\s*background-color: #ff0000/,
    );
    expect(css).toMatch(
      /\.astryx-button:is\(\[aria-expanded="true"\]\)\s*\{\s*background-color: #0000ff/,
    );
  }, 240_000);
});

describe('several states at once', () => {
  it('takes a checked and disabled box as one state, where Core paints it', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('c', {cwd, like: 'neutral'});
    const {data} = await themeEditHow('checkbox-indicator', {
      cwd,
      theme: 'c',
    });
    expect(JSON.stringify(data.reads)).toMatch(/--state checked\+disabled/);
    await themeEditSet('c', 'background-color', '#999999', {
      cwd,
      on: 'checkbox-indicator',
      state: 'checked+disabled',
      only: true,
    });
    expect(cssOf('c')).toMatch(
      /\.astryx-checkbox-indicator\[data-checked="checked"\]\[data-disabled="disabled"\]\s*\{\s*background-color: #999999/,
    );
    const r = await refusal(() =>
      themeEditSet('c', 'background-color', '#999999', {
        cwd,
        on: 'button',
        state: 'expanded+disabled',
      }),
    );
    expect(r.code).toBe('ERR_THEME_UNKNOWN_STATE');
    expect(r.message).toMatch(/never paints button disabled and expanded/);
  }, 240_000);
});

describe('a group styled alike', () => {
  it("keeps a checkbox's corners off the radios, and spreads what they draw alike", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('g', {cwd, like: 'neutral'});
    await themeEditSet('g', 'border-radius', '2px', {
      cwd,
      on: 'checkbox-indicator',
    });
    await themeEditSet('g', 'border-color', '#ff0000', {
      cwd,
      on: 'checkbox-indicator',
    });
    const css = cssOf('g');
    const radio = /\.astryx-radio-indicator\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(radio).toMatch(/border-color: #ff0000/);
    expect(radio).not.toMatch(/border-radius/);
    expect(css).toMatch(
      /\.astryx-checkbox-indicator\s*\{[^}]*border-radius: 2px/,
    );
  }, 240_000);
});

describe('scoped tokens on what a part holds', () => {
  it("reach a checkbox list's rows and a menu row's icon", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('s', {cwd, like: 'neutral'});
    const list = await themeEditSet('s', '--color-accent-muted', '#ff0000', {
      cwd,
      on: 'checkbox-list',
    });
    expect(list.data.setting).toMatchObject({on: 'checkbox-list'});
    const icon = await themeEditSet('s', '--color-icon-secondary', '#ff0000', {
      cwd,
      on: 'dropdown-menu-item',
    });
    expect(icon.data.setting).toMatchObject({on: 'dropdown-menu-item'});
  }, 240_000);
});

describe('a fill drawn inside a part', () => {
  it("colors a slider's filled range through the token its control paints it with", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('f', {cwd, like: 'neutral'});
    const r = await top('make the slider fill red', 'f');
    expect(r.commands).toEqual([
      "set f --color-accent '#dc2626' --on slider-control",
    ]);
    expect(r.text).toMatch(/slider-thumb inside too/);
  }, 240_000);
});
