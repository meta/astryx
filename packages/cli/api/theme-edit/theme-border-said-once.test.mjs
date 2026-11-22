// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A whole-theme color said once covers both modes: a border ("1px
 * #ccc borders") at its twin as far off the dark page, a link color the
 * dark page leaves under 4.5:1 at its twin that reads there.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
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
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-border-once-', FIXTURE_PACKAGES);
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

/** The first answer's commands, bare. @param {string} q @param {string} [theme] */
const commands = async (q, theme = 'bo') => {
  const {data} = await themeEditHow(q, {cwd, theme});
  return /** @type {string[]} */ (data.results?.[0]?.commands ?? []).map(c =>
    c.replace(/^.*? theme editor /, ''),
  );
};

describe('a whole-theme border said once', () => {
  it('covers both modes, the dark one off the dark page', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('bo', {cwd, like: 'neutral'});
    const cmds = (await commands('borders 1px #ccc')).join('\n');
    expect(cmds).not.toMatch(/--color-border(?:-emphasized)? \S+ --mode light/);
    // (Neutral's dark page is #1b1b1b; #ccc stands 1.6:1 off white, so the
    // dark border is the first gray that stands as far off #1b1b1b.)
    expect(cmds).toMatch(
      /set bo --color-border 'light-dark\(#ccc, #(?!1b1b1b)[0-9a-f]{6}\)'/,
    );
    // A color off the grays takes its twin too.
    expect((await commands('border color #ffd6e0')).join('\n')).toMatch(
      /--color-border 'light-dark\(#ffd6e0, #[0-9a-f]{6}\)'/,
    );
  }, 240_000);
});

describe('a whole-theme link color said once', () => {
  it('takes a twin in dark mode where the dark page leaves it under 4.5:1', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('lk', {cwd, like: 'neutral'});
    const {data} = await themeEditHow(
      'Color: green #1f883d primary buttons, blue #0969da links, neutral grays.',
      {cwd, theme: 'lk'},
    );
    const cmds = (data.results ?? []).flatMap(
      (/** @type {{commands: string[]}} */ r) => r.commands,
    );
    const m = cmds
      .map(c =>
        /--color-text-accent 'light-dark\(#0969da, (#[0-9a-f]{6})\)'$/.exec(c),
      )
      .find(Boolean);
    expect(m, cmds.join('\n')).toBeTruthy();
    // (The twin reads at 4.5:1 on the dark page, #1b1b1b on neutral.)
    const lum = (/** @type {string} */ h) => {
      const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
      const [r, g, b] = c.map(x =>
        x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4,
      );
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    expect(
      (lum(/** @type {RegExpExecArray} */ (m)[1]) + 0.05) /
        (lum('#1b1b1b') + 0.05),
    ).toBeGreaterThanOrEqual(4.5);
    // (In light mode, on the muted accent fill an applied preset draws, it
    // reads under 4.5:1: named, the color kept as asked.)
    expect(data.results[0].text).toMatch(
      /on the muted accent fill .* in light mode/,
    );
    // (One kept to dark mode is never named for the light fill, and a
    // twinned border gets no light-only note.)
    const darkOnly = (await themeEditHow('links #93c5fd', {cwd, theme: 'lk'}))
      .data.results[0].text;
    expect(darkOnly).not.toMatch(/muted accent fill/);
    const border = (await themeEditHow('borders 1px #ccc', {cwd, theme: 'lk'}))
      .data.results[0].text;
    expect(border).not.toMatch(/in light mode only/);
  }, 240_000);
});
