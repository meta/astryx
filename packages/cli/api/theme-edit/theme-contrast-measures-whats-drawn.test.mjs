// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contrast is measured on the color drawn under the text: text in a
 * see-through region (a top nav item in a translucent top bar) over the
 * region blended onto the page, never over the region's color taken as
 * solid; and a fill color and its on-color set inside a part are measured as
 * that part draws them.
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
    'measures text in a see-through region over the region blended onto the page',
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
      // (Over a dark bar the item's text reads: the bar shows through.)
      expect(
        texts(white).filter(p =>
          /^text in top-nav-item in the app-shell-header /.test(p.problem),
        ),
      ).toEqual([]);
      // A faint bar shows mostly the page: white text on it is a problem,
      // though on the bar's color taken as solid it would read.
      const faint = await themeEditSet(
        'tb',
        'background-color',
        'rgba(15,23,42,0.3)',
        {cwd, on: 'app-shell-header'},
      );
      expect(
        texts(faint).some(p =>
          /^text in top-nav-item in the app-shell-header \("[^"]*"\) is 2\.\d+:1/.test(
            p.problem,
          ),
        ),
      ).toBe(true);
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
    'keeps measuring a part drawn on the page too over the page',
    async () => {
      if (unbuilt) return;
      // (A button sits in the top bar and on the page: its page text is
      // measured on the page whatever the bar is filled with.)
      await themeEditNew('tp', {cwd, like: 'neutral'});
      await themeEditSet('tp', 'background-color', 'rgba(15,23,42,0.85)', {
        cwd,
        on: 'app-shell-header',
      });
      const white = await themeEditSet('tp', 'color', '#ffffff', {
        cwd,
        on: 'button',
        when: 'variant:secondary',
      });
      expect(texts(white).some(p => /^text in button\b/.test(p.problem))).toBe(
        true,
      );
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
      // A part that reads the on-color itself (a button: the text pairs
      // measure it), or holds no part that reads it (a link), is left out.
      for (const on of ['button', 'link', 'top-nav-item']) {
        const r = await themeEditSet('wa', '--color-accent', '#ffffff', {
          cwd,
          on,
          mode: 'light',
        });
        expect(
          texts(r).filter(p => p.problem.startsWith(`inside ${on},`)),
        ).toEqual([]);
      }
      // An on-color the theme sets on a part around it is what its readers
      // draw: the pair in this part's scope alone says nothing.
      await themeEditNew('wb', {cwd, like: 'neutral'});
      await themeEditSet('wb', '--color-on-accent', '#000000', {
        cwd,
        on: 'app-shell',
      });
      const around = await themeEditSet('wb', '--color-accent', '#ffffff', {
        cwd,
        on: 'app-shell-header',
        mode: 'light',
      });
      expect(
        texts(around).filter(p => /^inside app-shell-header/.test(p.problem)),
      ).toEqual([]);
      // A see-through fill shows the part under it, not one known color.
      const glass = await themeEditSet(
        'wa',
        '--color-accent',
        'rgba(255,255,255,0.2)',
        {cwd, on: 'app-shell-header', mode: 'light'},
      );
      expect(
        texts(glass).filter(p => /^inside app-shell-header/.test(p.problem)),
      ).toEqual([]);
    },
    T,
  );
});
