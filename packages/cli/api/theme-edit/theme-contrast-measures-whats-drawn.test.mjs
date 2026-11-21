// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contrast is measured on the color drawn under the text: a
 * see-through fill over the region it sits in (a top nav item in a
 * translucent top bar), never over the bare page; a fill color and its
 * on-color set inside a part are measured as that part draws them; and a
 * floating panel drawn with the popover's fill needs an edge against the
 * page and what sits on it.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

const T = 300_000;
/** @type {string} */
let cwd;
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-measures-drawn-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {any} r */
const texts = r =>
  /** @type {Array<{problem: string, fix: string | null}>} */ (
    r.data.newProblems ?? r.data.openProblems
  );

describe('contrast measures what is drawn', () => {
  it(
    'measures a see-through fill over its translucent region, not the page',
    async () => {
      if (unbuilt) return;
      await themeEditNew('tb', {cwd, like: 'neutral'});
      await themeEditSet('tb', 'background-color', 'rgba(15,23,42,0.85)', {
        cwd,
        on: 'app-shell-header',
      });
      const white = await themeEditSet('tb', 'color', '#ffffff', {
        cwd,
        on: 'top-nav-item',
      });
      expect(
        texts(white).filter(p => /^text in top-nav-item /.test(p.problem)),
      ).toEqual([]);
      // A bar drawn white under the same text is still a problem.
      const bar = await themeEditSet('tb', 'background-color', '#ffffff', {
        cwd,
        on: 'app-shell-header',
      });
      expect(
        texts(bar).some(p =>
          /^text in top-nav-item .* 1(\.00)?:1/.test(p.problem),
        ),
      ).toBe(true);
      // A surface Core draws in its own scheme (a lightbox, over its media
      // and a blurred page) keeps its own color under its buttons: a fresh
      // theme reports nothing there.
      const fresh = /** @type {any} */ (await themeEditShow('tb', {cwd})).data;
      expect(
        [...fresh.notes, ...texts({data: fresh}).map(p => p.problem)].filter(
          (/** @type {string} */ t) => / on lightbox /.test(t),
        ),
      ).toEqual([]);
    },
    T,
  );

  it(
    'measures a fill and its on-color as the part they are set on draws them',
    async () => {
      if (unbuilt) return;
      await themeEditNew('wa', {cwd, like: 'neutral'});
      const set = await themeEditSet('wa', '--color-accent', '#ffffff', {
        cwd,
        on: 'app-shell-header',
        mode: 'light',
      });
      const [problem, ...rest] = texts(set).filter(p =>
        /^inside app-shell-header, --color-on-accent /.test(p.problem),
      );
      expect(rest).toEqual([]);
      expect(problem.problem).toMatch(/is 1\.00:1 in light/);
      expect(problem.fix).toMatch(
        / set wa --color-on-accent '#[0-9a-f]{6}' --on app-shell-header --mode light$/,
      );
      const color = /'(#[0-9a-f]{6})'/.exec(String(problem.fix))?.[1];
      await themeEditSet('wa', '--color-on-accent', String(color), {
        cwd,
        on: 'app-shell-header',
        mode: 'light',
      });
      expect(
        texts(await themeEditShow('wa', {cwd})).filter(p =>
          /^inside app-shell-header/.test(p.problem),
        ),
      ).toEqual([]);
    },
    T,
  );

  it(
    'names an open list or menu with no edge against the page or a surface',
    async () => {
      if (unbuilt) return;
      await themeEditNew('sf', {cwd, like: 'neutral'});
      for (const tok of ['--shadow-low', '--shadow-med', '--shadow-high'])
        await themeEditSet('sf', tok, 'none', {cwd});
      const open = texts(await themeEditShow('sf', {cwd})).filter(p =>
        /with no border or shadow: a panel floating over it/.test(p.problem),
      );
      for (const part of ['popover', 'context-menu', 'multi-selector-popup'])
        expect(
          open.find(p => p.problem.startsWith(`the ${part} `)),
          part,
        ).toMatchObject({
          problem: expect.stringMatching(
            / on a surface \(#[0-9a-f]{6}\) in light/,
          ),
          fix: expect.stringMatching(
            new RegExp(
              ` set sf border '1px solid var\\(--color-border\\)' --on ${part}$`,
            ),
          ),
        });
      // A border the built theme draws on a panel is its edge, whatever
      // wrote it; one taken away again is not.
      await themeEditSet('sf', 'border', '1px solid var(--color-border)', {
        cwd,
        on: 'popover',
      });
      const edged = texts(await themeEditShow('sf', {cwd}));
      expect(edged.some(p => p.problem.startsWith('the popover '))).toBe(false);
      expect(edged.some(p => p.problem.startsWith('the context-menu '))).toBe(
        true,
      );
      await themeEditSet('sf', 'border', 'none', {cwd, on: 'popover'});
      expect(
        texts(await themeEditShow('sf', {cwd})).some(p =>
          p.problem.startsWith('the popover '),
        ),
      ).toBe(true);
    },
    T,
  );
});
