// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contrast is measured on the color drawn under the text: text in a
 * see-through region (a top nav item in a translucent top bar) over the
 * region blended onto the page, never over the region's color taken as
 * solid; a fill color and its on-color set inside a part are measured as
 * that part draws them; a floating panel drawn with the popover's fill needs
 * an edge against the page and what sits on it; and a one-mode theme lists
 * other-mode changes only where Core draws that mode.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
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
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'gothic']);
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
      // The surfaces dial draws its edge on the surface parts only: a
      // context menu under it keeps Core's edge, here none.
      await themeEditSet('sf', 'surfaces', 'outlined', {cwd});
      expect(
        texts(await themeEditShow('sf', {cwd})).some(p =>
          p.problem.startsWith('the context-menu '),
        ),
      ).toBe(true);
      // Raised, the dial's shadow on a banner (the part inside its frame
      // that paints the fill) is the banner's edge.
      await themeEditSet('sf', 'surfaces', 'raised', {cwd});
      await themeEditSet('sf', 'background-color', '#fdfdfd', {
        cwd,
        on: 'banner',
      });
      const raised = /** @type {any} */ (await themeEditShow('sf', {cwd}));
      expect(
        [
          ...texts(raised).map(p => p.problem),
          ...(raised.data.notes ?? []),
        ].some((/** @type {string} */ t) => /^the banner /.test(t)),
      ).toBe(false);
    },
    T,
  );

  it(
    'lists a dark-only theme light changes only where Core draws light',
    async () => {
      if (unbuilt) return;
      await themeEditNew('dk', {cwd, like: 'neutral'});
      await themeEditSet('dk', 'mode', 'dark-only', {cwd});
      const r = /** @type {any} */ (
        await themeEditSet('dk', 'neutral', '#78716c', {cwd})
      ).data;
      const light = [...r.changedTokens, ...r.changedPartTokens].filter(
        (/** @type {string} */ l) => / \(light\):/.test(l),
      );
      // (A toast is drawn light: its text tokens are named.)
      expect(
        light.some((/** @type {string} */ l) =>
          /^--color-text-secondary \(light\)/.test(l),
        ),
      ).toBe(true);
      // (Core's media surface draws the accent and the main text from its
      // on-color: an accent change is never drawn light there.)
      const accent = /** @type {any} */ (
        await themeEditSet('dk', 'accent', '#7c3aed', {cwd})
      ).data;
      expect(
        [...accent.changedTokens, ...(accent.changedPartTokens ?? [])].filter(
          (/** @type {string} */ l) => /^--color-accent \(light\)/.test(l),
        ),
      ).toEqual([]);
      // (The tokens are the base's own media rule: a gothic light-only
      // theme's accent change lists nothing the dark rule replaces.)
      await themeEditNew('gl', {cwd, like: 'gothic'});
      await themeEditSet('gl', 'mode', 'light-only', {cwd});
      const gothic = /** @type {any} */ (
        await themeEditSet('gl', 'accent', '#7c3aed', {cwd})
      ).data;
      expect(
        [...gothic.changedTokens, ...(gothic.changedPartTokens ?? [])].filter(
          (/** @type {string} */ l) => /^--color-text-accent \(dark\)/.test(l),
        ),
      ).toEqual([]);
      // (An undo that takes away a light setting lists the value removed.)
      await themeEditSet('dk', '--color-text-disabled', '#5f6368', {
        cwd,
        mode: 'light',
      });
      const undone = /** @type {any} */ (await themeEditUndo('dk', {cwd})).data;
      expect(
        undone.changedTokens.some((/** @type {string} */ l) =>
          /^--color-text-disabled \(light\)/.test(l),
        ),
      ).toBe(true);
      // (The page and a selected row are never drawn light here, nor the
      // lightbox, dark on every theme, nor a toast's own card, drawn on the
      // dark page.)
      expect(
        light.filter((/** @type {string} */ l) =>
          /^(--color-background-body|--color-text-disabled|--color-background-inverted) \(light\)| on item\[/.test(
            l,
          ),
        ),
      ).toEqual([]);
    },
    T,
  );
});
