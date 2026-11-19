// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A resting shadow on a part that rings itself in its box-shadow keeps the
 * rings: each state Core rings is written with the shadow and that ring.
 * how answers a sunken bevel there. Against real bundled base themes.
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
    'astryx-theme-resting-shadow-part-rings-',
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

/** @param {string} slug */
const cssOf = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

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

describe('a resting shadow on a ringed part', () => {
  it('is written with each ring Core draws in its states', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('b', {cwd, like: 'neutral'});
    const bevel = 'inset 1px 1px 0 #808080, inset -1px -1px 0 #ffffff';
    await themeEditSet('b', 'box-shadow', bevel, {cwd, on: 'inputs'});
    const css = cssOf('b');
    const rule = (/** @type {string} */ sel) =>
      new RegExp(
        `${sel.replace(/[.[\]="()]/g, m => `\\${m}`)}[^{]*\\{\\s*box-shadow: ([^;]*);`,
      ).exec(css)?.[1];
    expect(rule('.astryx-text-input')).toBe(bevel);
    // The hover and focus rings come after the bevel; a status keeps its own.
    expect(rule('.astryx-text-input:hover')).toMatch(
      new RegExp(`^${bevel}, inset 0 0 0 2px color-mix\\(`),
    );
    expect(rule('.astryx-text-input:focus-within')).toBe(
      `${bevel}, inset 0 0 0 2px var(--color-accent-muted)`,
    );
    expect(rule('.astryx-text-input[data-status="error"]:hover')).toBe(
      `${bevel}, var(--shadow-inset-error)`,
    );
  }, 240_000);

  it('keeps a shadow the theme sets for a state', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('k', {cwd, like: 'neutral'});
    await themeEditSet('k', 'box-shadow', '0 0 0 3px #ff0000', {
      cwd,
      on: 'text-input',
      state: 'focus-within',
      only: true,
    });
    await themeEditSet('k', 'box-shadow', 'inset 0 1px 2px #00000040', {
      cwd,
      on: 'inputs',
    });
    expect(cssOf('k')).toMatch(
      /\.astryx-text-input:focus-within\s*\{\s*box-shadow: 0 0 0 3px #ff0000;/,
    );
  }, 240_000);

  it('is how a sunken bevel on inputs is answered', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('s', {cwd, like: 'neutral'});
    const r = await top('sunken bevel on inputs', 's');
    expect(r.commands[0]).toMatch(
      /^set s box-shadow 'inset 1px 1px 0 #9ca3af, inset -1px -1px 0 #ffffff' --on inputs$/,
    );
  }, 240_000);
});
