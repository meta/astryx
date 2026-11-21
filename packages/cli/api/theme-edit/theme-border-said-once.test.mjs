// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A whole-theme border said once ("1px #ccc borders") covers both
 * modes, the dark one at the theme's gray as far off the dark page, and
 * reaches the surfaces, fields and controls Core draws with none, never a
 * small box nor the layout frame.
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
    // A color off the grays stays the light mode's.
    expect((await commands('border color #ffd6e0')).join('\n')).toMatch(
      /--color-border '#ffd6e0' --mode light/,
    );
  }, 240_000);

  it('reaches the surfaces, fields and controls drawn with none', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('br', {cwd, like: 'neutral'});
    const cmds = await commands('1px #ccc borders', 'br');
    /** @param {string} part */
    const bordered = part =>
      cmds.some(c =>
        new RegExp(`^set br border '1px solid .* --on ${part}$`).test(c),
      );
    for (const part of ['button', 'table', 'popover', 'dropdown-menu'])
      expect(bordered(part), part).toBe(true);
    for (const part of ['badge', 'layout-header', 'avatar', 'collapsible'])
      expect(bordered(part), part).toBe(false);
    // A muted card (a neutral look Core draws borderless) takes it; a hue's
    // look keeps its own.
    expect(
      cmds.some(x =>
        /^set br border '1px solid .*#ccc.*' --on card --when variant:muted$/.test(
          x,
        ),
      ),
    ).toBe(true);
    expect(
      cmds.some(x => / --on clickable-card --when variant:muted$/.test(x)),
    ).toBe(true);
    expect(cmds.some(x => /--on card --when variant:blue/.test(x))).toBe(false);
    // Flat surfaces said with it: the cards keep a border too.
    expect(
      (
        await themeEditHow(
          'Surface: flat, subtle shadow only on overlays. Edges: 6px corners, 1px #d0d7de borders.',
          {cwd, theme: 'br'},
        )
      ).data.results
        .flatMap((/** @type {{commands: string[]}} */ r) => r.commands)
        .some((/** @type {string} */ x) =>
          /border '1px solid .* --on card$/.test(x),
        ),
    ).toBe(true);
    // A role word leading the ask narrows it: overlays get no button border.
    const overlays = await commands('overlays: a 1px #4d4d4d border', 'br');
    expect(overlays.some(x => / --on popover$/.test(x))).toBe(true);
    expect(overlays.some(x => / --on button$/.test(x))).toBe(false);
  }, 240_000);
});
