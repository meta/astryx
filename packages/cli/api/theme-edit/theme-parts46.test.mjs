// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A theme made in a design session: heading colors, the page background
 * and its gradients per mode, background values with many variables, and
 * what the page background token reaches, against a real bundled base.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {maskLayers} from './_settings.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-parts46-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
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

describe('heading colors', () => {
  it('writes a heading color as the text color tokens on the heading, per level too', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('h1', {cwd, like: 'neutral'});
    await themeEditSet('h1', 'color', 'var(--color-accent)', {
      cwd,
      on: 'heading',
    });
    expect(ruleOf('h1', '.astryx-heading')).toMatch(
      /--color-text-primary: var\(--color-accent\)/,
    );
    await themeEditSet('h1', 'color', '#aa3355', {
      cwd,
      on: 'heading',
      when: 'level:1',
    });
    expect(ruleOf('h1', '.astryx-heading[data-level="1"]')).toMatch(
      /--color-text-primary: #aa3355/,
    );
    // Body text keeps its own color.
    expect(cssOf('h1')).not.toMatch(/:root[^}]*--color-text-primary: #aa3355/);
    const how = await themeEditHow('headings in the accent color', {
      cwd,
      theme: 'h1',
    });
    expect(JSON.stringify(how.data)).toMatch(/set h1 color [^"]*--on heading/);
  }, 240_000);
});

describe('the page background', () => {
  it('points --on page at the app shell, and how offers it', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('p1', {cwd, like: 'neutral'});
    const r = await refusal(() =>
      themeEditSet('p1', 'background', 'linear-gradient(#ffffff, #ddeeff)', {
        cwd,
        on: 'page',
      }),
    );
    expect(r.run[0]).toMatch(/--on app-shell$/);
    const how = await themeEditHow('page background', {cwd, theme: 'p1'});
    expect(JSON.stringify(how.data)).toMatch(/--on app-shell/);
  }, 240_000);

  it('says the page background token shows on the page', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('p2', {cwd, like: 'neutral'});
    const r = await themeEditSet('p2', '--color-background-body', '#f0f4ff', {
      cwd,
    });
    const notes = JSON.stringify(r.data);
    expect(notes).not.toMatch(/changes nothing you see/);
  }, 240_000);

  it('gives the page a gradient per mode, each painted in its mode only', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('p3', {cwd, like: 'neutral'});
    await themeEditSet(
      'p3',
      'background',
      'linear-gradient(#ffffff, #ddeeff)',
      {
        cwd,
        on: 'app-shell',
        mode: 'light',
      },
    );
    await themeEditSet(
      'p3',
      'background',
      'linear-gradient(#000000, #112233)',
      {
        cwd,
        on: 'app-shell',
        mode: 'dark',
      },
    );
    const rule = ruleOf('p3', '.astryx-app-shell');
    expect(rule).toContain(
      'linear-gradient(light-dark(#ffffff, transparent), light-dark(#ddeeff, transparent))',
    );
    expect(rule).toContain(
      'linear-gradient(light-dark(transparent, #000000), light-dark(transparent, #112233))',
    );
  }, 240_000);

  it('keeps an earlier both-mode gradient in the other mode', () => {
    expect(
      maskLayers('linear-gradient(red, #000) 0 0 / 4px 4px, #fff', 'dark'),
    ).toEqual([
      'linear-gradient(light-dark(transparent, red), light-dark(transparent, #000)) 0 0 / 4px 4px',
      'linear-gradient(light-dark(transparent, #fff), light-dark(transparent, #fff))',
    ]);
  });
});

describe('background values with many variables', () => {
  it('accepts color-mix() with variables and stops, in many layers', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('v1', {cwd, like: 'neutral'});
    await themeEditSet(
      'v1',
      'background',
      'linear-gradient(115deg, color-mix(in srgb, var(--color-background-body) 74%, var(--color-accent)), color-mix(in srgb, var(--color-background-body) 88%, var(--color-accent)) 60%, color-mix(in srgb, var(--color-background-body) 72%, #c9a227))',
      {cwd, on: 'app-shell-header'},
    );
    const dot = 'color-mix(in srgb, var(--color-background-body) 35%, #ffffff)';
    await themeEditSet(
      'v1',
      'background',
      `radial-gradient(circle at 18% 22%, ${dot} 1.8px, transparent 2.8px) 0 0 / 71px 67px, radial-gradient(circle at 63% 71%, ${dot} 1.2px, transparent 2.2px) 0 0 / 53px 59px, radial-gradient(circle at 41% 47%, ${dot} 2.6px, transparent 3.8px) 0 0 / 139px 127px, linear-gradient(180deg, var(--color-background-body), color-mix(in srgb, var(--color-background-body) 82%, #6fa8bb))`,
      {cwd, on: 'layout-content'},
    );
    expect(ruleOf('v1', '.astryx-layout-content')).toMatch(/71px 67px/);
    // A variable that is no token is still refused.
    const r = await refusal(() =>
      themeEditSet(
        'v1',
        'background',
        'linear-gradient(red, var(--nope) 10px)',
        {
          cwd,
          on: 'card',
        },
      ),
    );
    expect(r.message).toMatch(/--nope is not a design token/);
  }, 240_000);
});
