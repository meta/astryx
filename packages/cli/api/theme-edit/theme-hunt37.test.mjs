// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The thirty-seventh pass over `astryx experimental theme editor`: a
 * token set on one part that reads a whole-theme token is checked for a
 * loop only within the scope it is set in, and an exact accent given as
 * `var()` or a two-color `light-dark()` gets on-accent text picked for the
 * color it really shows in each mode.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {parseColor, ratio} from './_color.mjs';
import {splitTop} from './_css.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

// The page renders cost seconds and these tests read settings and CSS.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt37-', FIXTURE_PACKAGES);
  for (const slug of ['ga', 'gb', 'gc', 'va', 'vb'])
    await themeEditNew(slug, {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {() => Promise<unknown>} run */
async function refusal(run) {
  try {
    await run();
  } catch (error) {
    return /** @type {any} */ (error);
  }
  throw new Error('expected a refusal');
}

describe('a part token that reads a whole-theme token', () => {
  const part = {on: 'top-nav-heading'};

  it('is accepted after the whole-theme token reads it back', async () => {
    await themeEditSet('ga', '--color-accent', 'var(--color-text-primary)', {
      cwd,
    });
    await themeEditSet('ga', '--color-text-primary', 'var(--color-accent)', {
      cwd,
      ...part,
    });
    await themeEditShow('ga', {cwd});
    await themeEditSet('ga', 'accent', '#2563eb', {cwd});
  }, 120_000);

  it('in the other order never leaves the theme refusing every command', async () => {
    await themeEditSet('gb', '--color-text-primary', 'var(--color-accent)', {
      cwd,
      ...part,
    });
    await themeEditSet('gb', '--color-accent', 'var(--color-text-primary)', {
      cwd,
    });
    await themeEditShow('gb', {cwd});
    await themeEditSet('gb', 'accent', '#2563eb', {cwd});
    await themeEditShow('gb', {cwd});
  }, 120_000);

  it('still refuses a loop that closes within one scope', async () => {
    // On one part: two tokens the card reads, each reading the other.
    await themeEditSet('gc', '--color-border', 'var(--color-background-card)', {
      cwd,
      on: 'card',
    });
    const onPart = await refusal(() =>
      themeEditSet('gc', '--color-background-card', 'var(--color-border)', {
        cwd,
        on: 'card',
      }),
    );
    expect(onPart.code).toBe('ERR_THEME_BAD_VALUE');
    expect(onPart.message).toMatch(
      /would read itself through --color-border \(on card\)/,
    );
    // In the whole theme.
    await themeEditSet('gc', '--color-accent', 'var(--color-text-primary)', {
      cwd,
    });
    const whole = await refusal(() =>
      themeEditSet('gc', '--color-text-primary', 'var(--color-accent)', {cwd}),
    );
    expect(whole.code).toBe('ERR_THEME_BAD_VALUE');
    expect(whole.message).toMatch(/would read itself/);
  }, 120_000);
});

/**
 * The color a theme CSS token gives in each mode.
 * @param {string} css
 * @param {string} token
 */
function modesOf(css, token) {
  const m = new RegExp(`${token}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`${token} not in the CSS`);
  const v = m[1].trim();
  const fn = /^light-dark\((.*)\)$/i.exec(v);
  const [light, dark] = fn ? splitTop(fn[1], ',').map(x => x.trim()) : [v, v];
  return {light, dark};
}

describe('an exact accent the palette must resolve', () => {
  /** @param {string} slug @param {{light: string, dark: string}} fill */
  const readsOn = (slug, fill) => {
    const css = fs.readFileSync(
      path.join(cwd, `themes/${slug}/${slug}.css`),
      'utf8',
    );
    const on = modesOf(css, '--color-on-accent');
    for (const m of /** @type {const} */ (['light', 'dark'])) {
      const r = ratio(
        /** @type {number[]} */ (parseColor(on[m])),
        /** @type {number[]} */ (parseColor(fill[m])),
      );
      expect(r, `${slug} ${m}: ${on[m]} on ${fill[m]}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  };

  it('reads var(--color-warning) as the color it names', async () => {
    await themeEditSet('va', '--color-accent', 'var(--color-warning)', {cwd});
    const r = await themeEditSet('va', 'accent', '#2563eb', {cwd});
    const notes = /** @type {any} */ (r).data.notes.join('\n');
    expect(notes).toMatch(
      /uses your exact setting \(var\(--color-warning\) = #/,
    );
    expect(notes).not.toMatch(/uses your exact color \(#2563eb/);
    const css = fs.readFileSync(path.join(cwd, 'themes/va/va.css'), 'utf8');
    expect(css).toMatch(/--color-accent:\s*var\(--color-warning\)/);
    // The warning color the base theme gives, in each mode.
    const warn = /** @type {any} */ (r).data.notes
      .join('\n')
      .match(/var\(--color-warning\) = (#[0-9a-f]{6})/gi)
      .map((/** @type {string} */ x) => x.split('= ')[1]);
    readsOn('va', {light: warn[0], dark: warn.at(-1)});
  }, 120_000);

  it('picks on-accent text per mode for a two-color light-dark()', async () => {
    await themeEditSet('vb', '--color-accent', 'light-dark(#2563eb, #ffff00)', {
      cwd,
    });
    const r = await themeEditSet('vb', 'accent', '#2563eb', {cwd});
    expect(/** @type {any} */ (r).data.notes.join('\n')).toMatch(
      /uses your exact setting \(#2563eb in light and #ffff00 in dark\)/,
    );
    readsOn('vb', {light: '#2563eb', dark: '#ffff00'});
  }, 120_000);
});
