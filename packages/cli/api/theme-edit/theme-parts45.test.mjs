// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * State objects, one-mode halves across the background family and states,
 * one-mode tokens that are no color, and the spacing dial around variant
 * sizes, against real bundled base themes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {sizePx} from './_settings.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-parts45-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['butter', 'neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug */
const cssOf = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

/** @param {string} slug @param {string} selector */
const ruleOf = (slug, selector) => {
  const css = cssOf(slug);
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

const HOVER = ':hover:where(:not(:disabled,[aria-disabled="true"]))';

describe('state settings keep what they do not name', () => {
  it("keeps butter's own secondary hover background under a hover text color", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('s1', {cwd, like: 'butter'});
    await themeEditSet('s1', 'color', '#00ff00', {
      cwd,
      on: 'button',
      state: 'hover',
      mode: 'dark',
    });
    expect(
      ruleOf('s1', `.astryx-button[data-variant="secondary"]${HOVER}`),
    ).toMatch(/background-color: light-dark\(#225bff14, #fdee8c14\)/);
  }, 240_000);

  it("keeps the other mode's resting color as a one-mode hover's other half", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('s2', {cwd, like: 'neutral'});
    await themeEditSet('s2', 'background', '#eeeeee', {
      cwd,
      on: 'button',
      mode: 'light',
    });
    await themeEditSet('s2', 'background', '#0000ff', {
      cwd,
      on: 'button',
      state: 'hover',
      mode: 'dark',
    });
    expect(
      ruleOf('s2', `.astryx-button[data-variant="primary"]${HOVER}`),
    ).toMatch(/background-color: light-dark\(#eeeeee, #0000ff\)/);
  }, 240_000);

  it('accepts a one-mode border color in a state the base theme gives a border color (butter)', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('s3', {cwd, like: 'butter'});
    await themeEditSet('s3', 'border-color', '#00ff00', {
      cwd,
      on: 'button',
      when: 'variant:secondary',
      state: 'hover',
      mode: 'light',
    });
    expect(cssOf('s3')).toMatch(/border-color: light-dark\(#00ff00, /);
  }, 240_000);
});

describe('the background family across one-mode and both-mode settings', () => {
  it("keeps a variant's earlier other half when its own one-mode background follows (butter card)", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('b1', {cwd, like: 'butter'});
    await themeEditSet('b1', 'background', '#ff0000', {
      cwd,
      on: 'card',
      mode: 'light',
    });
    await themeEditSet('b1', 'background', '#0000ff', {
      cwd,
      on: 'card',
      when: 'variant:muted',
      mode: 'dark',
    });
    const muted = ruleOf('b1', '.astryx-card[data-variant="muted"]');
    expect(muted).toMatch(/light-dark\(#ff0000, #0000ff\)/);
    expect(muted).not.toMatch(/light-dark\([^)]*, #0000ff\)[^]*background/);
  }, 240_000);

  it('replaces a one-mode background with a later both-mode background-color', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('b2', {cwd, like: 'neutral'});
    await themeEditSet('b2', 'background', '#eeeeee', {
      cwd,
      on: 'button',
      mode: 'light',
    });
    const r = await themeEditSet('b2', 'background-color', '#333333', {
      cwd,
      on: 'button',
    });
    expect(JSON.stringify(r.data.replaced)).toMatch(/background/);
    expect(cssOf('b2')).not.toMatch(/#eeeeee/);
  }, 240_000);
});

describe('one-mode themes', () => {
  it('never writes light-dark() for a token that is no color', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o1', {cwd, like: 'neutral'});
    await themeEditSet('o1', 'mode', 'light-only', {cwd});
    await themeEditSet('o1', '--shadow-low', '0 1px 2px rgba(0,0,0,.2)', {cwd});
    await themeEditNew('o2', {cwd, like: 'neutral'});
    await themeEditSet('o2', 'mode', 'dark-only', {cwd});
    await themeEditSet('o2', '--shadow-high', 'none', {cwd});
    for (const slug of ['o1', 'o2'])
      for (const line of cssOf(slug).split('\n'))
        if (/^\s*--(shadow|radius|spacing|size|font|text)-/.test(line))
          // A color inside a shadow may differ by mode; the whole value
          // never does.
          expect(line, slug).not.toMatch(/:\s*light-dark\(/);
    expect(cssOf('o2')).toMatch(/--shadow-high: none;/);
  }, 240_000);

  it('keeps --when and --state in the command it offers for a refused --mode', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o3', {cwd, like: 'neutral'});
    await themeEditSet('o3', 'mode', 'dark-only', {cwd});
    const r = await refusal(() =>
      themeEditSet('o3', 'background', '#ff0000', {
        cwd,
        on: 'button',
        when: 'variant:primary',
        state: 'hover',
        mode: 'light',
      }),
    );
    expect(r.run[0]).toMatch(/set o3 mode both$/);
    expect(r.run[1]).toMatch(/--when variant:primary --state hover$/);
  }, 240_000);
});

describe('the spacing dial around kept sizes', () => {
  it('reads pt, em and upper-case units', () => {
    expect(sizePx('26pt')).toBeCloseTo(34.667, 2);
    expect(sizePx('34PX')).toBe(34);
    expect(sizePx('2.2em')).toBeCloseTo(35.2, 5);
    expect(sizePx('1REM')).toBe(16);
  });

  it("keeps a variant's own exact size in order on that variant (neutral)", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('d8', {cwd, like: 'neutral'});
    await themeEditSet('d8', '--size-element-md', '34px', {
      cwd,
      on: 'button',
      when: 'variant:primary',
    });
    const r = await themeEditSet('d8', 'spacing', 'tight', {cwd});
    const lg = /--size-element-lg:\s*([\d.]+)px/.exec(
      ruleOf('d8', '.astryx-button[data-variant="primary"]'),
    )?.[1];
    expect(Number(lg)).toBeGreaterThan(34);
    expect(r.data.notes.join(' ')).toMatch(
      /keeps your exact --size-element-md = 34px on button when variant:primary/,
    );
  }, 240_000);
});
