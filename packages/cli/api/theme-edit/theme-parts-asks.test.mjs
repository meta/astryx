// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` and `set` on the parts a theme names: modes, states,
 * part text and fills, tables, titles and dividers, on themes made like the
 * built-in neutral theme. Each block below covers one kind of ask and makes
 * its own themes; all of them share one project fixture, put back as the
 * fixture made it before each block.
 *
 * @position api/theme-edit — tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditHow,
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {modeValue, refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {createRequire} from 'node:module';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';
/** The project's package.json as the fixture made it. */
let fixturePackageJson = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-parts-asks-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  fixturePackageJson = fs.readFileSync(path.join(cwd, 'package.json'), 'utf8');
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * Put the project back as the fixture made it, for a block that makes its
 * own themes: earlier blocks' themes, app copies and files go.
 */
function resetProject() {
  for (const entry of fs.readdirSync(cwd))
    if (entry !== 'node_modules' && entry !== 'package.json')
      fs.rmSync(path.join(cwd, entry), {recursive: true, force: true});
  fs.writeFileSync(path.join(cwd, 'package.json'), fixturePackageJson);
}

// One-mode gradients and tokens keep what the other mode shows, the page
// background shows in every AppShell, heading colors and types, against a real
// bundled base theme. Each check reads the built stylesheet for what each mode
// resolves to.
describe('mode gradients tokens page', () => {
  beforeAll(resetProject);

  /** @param {string} slug */
  const cssOf = slug =>
    fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

  /** @param {string} slug @param {string} selector */
  const ruleOf = (slug, selector) => {
    const css = cssOf(slug);
    const i = css.indexOf(`${selector} {`);
    return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
  };

  /** @param {string} slug */
  const settingsOf = slug =>
    JSON.parse(
      fs.readFileSync(
        path.join(cwd, 'themes', slug, `${slug}.settings.json`),
        'utf8',
      ),
    ).settings;

  /** @param {import('vitest').TestContext} ctx */
  const needBases = ctx => {
    if (!unbuilt) return false;
    console.warn(`skipped: ${unbuilt}`);
    ctx.skip();
    return true;
  };

  describe('one-mode gradients', () => {
    it('writes a one-mode gradient as background images, so the other mode keeps its color', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('g1', {cwd, like: 'neutral'});
      await themeEditSet('g1', 'background', 'linear-gradient(red, blue)', {
        cwd,
        on: 'card',
        mode: 'light',
      });
      const css = cssOf('g1');
      expect(modeValue(css, '.astryx-card', 'background-image', 'light')).toBe(
        'linear-gradient(red, blue)',
      );
      expect(modeValue(css, '.astryx-card', 'background-image', 'dark')).toBe(
        undefined,
      );
      // No shorthand resets the card's color in either mode.
      const card = ruleOf('g1', '.astryx-card');
      expect(card).not.toMatch(/\bbackground:/);
      expect(card).not.toMatch(/background-color/);
    }, 240_000);

    it('keeps a light gradient with a transparent stop beside a later dark one', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('g2', {cwd, like: 'neutral'});
      await themeEditSet(
        'g2',
        'background',
        'linear-gradient(transparent, red)',
        {
          cwd,
          on: 'card',
          mode: 'light',
        },
      );
      await themeEditSet('g2', 'background', 'linear-gradient(blue, green)', {
        cwd,
        on: 'card',
        mode: 'dark',
      });
      const css = cssOf('g2');
      expect(modeValue(css, '.astryx-card', 'background-image', 'light')).toBe(
        'linear-gradient(transparent, red)',
      );
      expect(modeValue(css, '.astryx-card', 'background-image', 'dark')).toBe(
        'linear-gradient(blue, green)',
      );
    }, 240_000);

    it('refuses a light-dark() stop in a one-mode gradient', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('g3', {cwd, like: 'neutral'});
      const r = await refusal(() =>
        themeEditSet(
          'g3',
          'background-image',
          'linear-gradient(light-dark(red, blue), white)',
          {cwd, on: 'card', mode: 'light'},
        ),
      );
      expect(r.code).toBe('ERR_THEME_NO_MODE');
    }, 240_000);

    it('offers a gradient for one mode in how, as a background image', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('g4', {cwd, like: 'neutral'});
      const r = await themeEditHow(
        'make the card a red to blue gradient in dark mode only',
        {cwd, theme: 'g4'},
      );
      const text = JSON.stringify(r.data);
      expect(text).toMatch(
        /background-image '[^']*gradient[^']*' --on card[^"]*--mode dark/,
      );
      expect(text).not.toMatch(/cannot be dark mode only/);
    }, 240_000);
  });

  describe('one-mode tokens and the background family', () => {
    it("gives a one-mode token on a part the token's own value in the other mode", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('t1', {cwd, like: 'neutral'});
      await themeEditSet('t1', '--color-background-card', '#ff0000', {
        cwd,
        on: 'card',
        mode: 'light',
      });
      await themeEditSet('t1', 'color', '#ff0000', {
        cwd,
        on: 'heading',
        mode: 'light',
      });
      expect(cssOf('t1')).not.toMatch(/currentcolor\)/);
      // Light takes the token; dark writes nothing, so the token keeps the
      // theme's own value there.
      expect(
        modeValue(
          cssOf('t1'),
          '.astryx-card',
          '--color-background-card',
          'light',
        ),
      ).toBe('#ff0000');
      expect(
        modeValue(
          cssOf('t1'),
          '.astryx-card',
          '--color-background-card',
          'dark',
        ),
      ).toBe(undefined);
    }, 240_000);

    it("keeps the other mode's background-color when a one-mode background follows", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('t2', {cwd, like: 'neutral'});
      await themeEditSet('t2', 'background-color', '#ff0000', {
        cwd,
        on: 'card',
        mode: 'light',
      });
      await themeEditSet('t2', 'background', '#0000ff', {
        cwd,
        on: 'card',
        mode: 'dark',
      });
      expect(settingsOf('t2').map((/** @type {any} */ x) => x.mode)).toEqual([
        'light',
        'dark',
      ]);
      const card = '.astryx-card[data-variant="muted"]';
      expect(modeValue(cssOf('t2'), card, 'background-color', 'light')).toBe(
        '#ff0000',
      );
      expect(
        modeValue(cssOf('t2'), card, 'background-color', 'dark') ??
          modeValue(cssOf('t2'), card, 'background', 'dark'),
      ).toBe('#0000ff');
    }, 240_000);

    it("says a one-mode color under the part's own gradient does not show", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('t3', {cwd, like: 'neutral'});
      await themeEditSet('t3', 'background', 'linear-gradient(red, blue)', {
        cwd,
        on: 'card',
      });
      const r = await themeEditSet('t3', 'background', '#eeeeee', {
        cwd,
        on: 'card',
        mode: 'light',
      });
      expect(r.data.notes.join(' ')).toMatch(/does not show/);
    }, 240_000);
  });

  describe('headings', () => {
    it('takes the secondary text color without a loop', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('h1', {cwd, like: 'neutral'});
      await themeEditSet('h1', 'color', 'var(--color-text-secondary)', {
        cwd,
        on: 'heading',
      });
      const rule = ruleOf('h1', '.astryx-heading');
      expect(rule).toMatch(
        /--color-text-primary: var\(--color-text-secondary\)/,
      );
      expect(rule).not.toMatch(
        /--color-text-secondary: var\(--color-text-secondary\)/,
      );
    }, 240_000);

    it("lists Heading's own types and refuses Text's", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('h2', {cwd, like: 'neutral'});
      const r = await refusal(() =>
        themeEditSet('h2', 'color', '#2563eb', {
          cwd,
          on: 'heading',
          when: 'type:body',
        }),
      );
      expect(r.message).toMatch(/display-1, display-2, display-3/);
      const how = await themeEditHow('make headings blue in dark mode', {
        cwd,
        theme: 'h2',
      });
      expect(JSON.stringify(how.data)).not.toMatch(/type:body/);
    }, 240_000);
  });

  describe('the page background', () => {
    it('writes the fixed attachment after the page gradient and paints both modes on the shell regions', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('p2', {cwd, like: 'neutral'});
      await themeEditSet(
        'p2',
        'background',
        'linear-gradient(180deg, #ff0000, #0000ff)',
        {cwd, on: 'app-shell'},
      );
      // The attachment comes after the shorthand, so the shorthand does not
      // reset it.
      for (const sel of ['.astryx-app-shell', '.astryx-app-shell-header']) {
        const rule = ruleOf('p2', sel);
        expect(rule, sel).toMatch(
          /background: linear-gradient[^;]*;[\s\S]*background-attachment: fixed/,
        );
      }
      // The two per-mode commands how suggests reach the header and side nav
      // in both modes.
      await themeEditNew('p3', {cwd, like: 'neutral'});
      const how = await themeEditHow('a gradient on the page background', {
        cwd,
        theme: 'p3',
      });
      const lines = JSON.stringify(how.data).match(
        /set p3 background-image '[^']+' --on app-shell --mode (light|dark)/g,
      );
      expect(lines?.length).toBe(2);
      for (const mode of /** @type {const} */ (['light', 'dark'])) {
        const value = /** @type {string} */ (
          /** @type {string[]} */ (lines)
            .find(l => l.endsWith(mode))
            ?.match(/'([^']+)'/)?.[1]
        );
        await themeEditSet('p3', 'background-image', value, {
          cwd,
          on: 'app-shell',
          mode,
        });
      }
      for (const sel of [
        '.astryx-app-shell-header',
        '.astryx-app-shell-sidenav',
      ]) {
        const css = cssOf('p3');
        expect(modeValue(css, sel, 'background-image', 'light'), sel).toMatch(
          /#f5f7fa/,
        );
        expect(modeValue(css, sel, 'background-image', 'dark'), sel).toMatch(
          /#14171c/,
        );
      }
    }, 240_000);

    it('shows a background on app-shell in every AppShell variant', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('p1', {cwd, like: 'neutral'});
      const r = await themeEditSet('p1', 'background', '#ff0000', {
        cwd,
        on: 'app-shell',
      });
      const shell = ruleOf('p1', '.astryx-app-shell');
      expect(shell).toMatch(/background: #ff0000/);
      // The tokens stay defined for what is drawn inside the shell.
      expect(cssOf('p1')).not.toMatch(
        /--color-background-(body|surface): transparent/,
      );
      // The header and side nav take the page background: in an auto-height
      // shell they are sticky, so they stay opaque over scrolled content.
      for (const sel of [
        '.astryx-app-shell-header',
        '.astryx-app-shell-sidenav',
      ])
        expect(ruleOf('p1', sel), sel).toMatch(/background: #ff0000/);
      // The main content area is see-through.
      expect(
        ruleOf(
          'p1',
          '.astryx-layout-content:where(.astryx-app-shell [role="main"])',
        ),
      ).toMatch(/background-color: transparent/);
      expect(r.data.notes.join(' ')).toMatch(/header and side nav/);
      expect(r.data.notes.join(' ')).toMatch(/elevated layout/);
      // A page gradient is fixed to the viewport on the shell and its sticky
      // regions, so they line up when content scrolls.
      await themeEditSet(
        'p1',
        'background',
        'linear-gradient(180deg, #ff0000, #0000ff)',
        {cwd, on: 'app-shell'},
      );
      for (const sel of ['.astryx-app-shell', '.astryx-app-shell-header'])
        expect(ruleOf('p1', sel), sel).toMatch(/background-attachment: fixed/);
      // The page gradient how offers reads no token the shell would lose, and
      // gives each mode its own value so text stays readable in dark mode.
      const how = await themeEditHow('a gradient on the page background', {
        cwd,
        theme: 'p1',
      });
      const text = JSON.stringify(how.data);
      expect(text).toMatch(/--on app-shell/);
      expect(text).not.toMatch(/gradient\([^']*var\(--color-background/);
      expect(text).toMatch(
        /background-image 'linear-gradient\(180deg, #f5f7fa, #e4ebf5\)' --on app-shell --mode light/,
      );
      expect(text).toMatch(
        /background-image 'linear-gradient\(180deg, #14171c, #1c222b\)' --on app-shell --mode dark/,
      );
      const solid = JSON.stringify(
        (await themeEditHow('change the page background', {cwd, theme: 'p1'}))
          .data,
      );
      expect(solid).toMatch(/--color-background-body '#f5f7fa' --mode light/);
      expect(solid).toMatch(/--color-background-body '#14171c' --mode dark/);
    }, 240_000);
  });
});

// One-mode borders on a part with no line take no room; a divider's line is
// reached per variant (color, thickness by an amount, removal) and a setting on
// the divider's own element is refused; a token family follows a light-dark()
// source; a variant's contrast problem is listed once, scoped; a status keeps
// its own ring under a state shadow; pieces named after a part's catalog name.
// Against real bundled base themes.
describe('mode borders part room', () => {
  beforeAll(resetProject);

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

  describe('a one-mode border on a part that draws none', () => {
    it('is a ring that takes no room, never a border in the other mode', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('b', {cwd, like: 'neutral'});
      expect(
        (await top('make the button border red in dark mode', 'b')).commands,
      ).toEqual([
        "set b box-shadow 'inset 0 0 0 1px light-dark(transparent, #dc2626)' --on button --when elevation:none",
      ]);
    }, 240_000);

    it('keeps the outline dial beside the one-mode colors of outlined buttons', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('o', {cwd, like: 'neutral'});
      const r = await top('make outline buttons red in dark mode', 'o');
      expect(r.commands[0]).toBe('set o buttons outline');
      expect(r.commands.slice(1).every(x => / --mode dark$/.test(x))).toBe(
        true,
      );
      expect(r.text).toMatch(/the buttons dial is the same in light and dark/);
    }, 240_000);
  });

  describe("a divider's line", () => {
    it('takes its color per variant, its thickness by the amount said, and goes away transparent', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('d', {cwd, like: 'neutral'});
      expect(
        (await top('make strong dividers blue in light mode', 'd')).commands,
      ).toEqual([
        "set d --color-border-emphasized '#2563eb' --on divider --when variant:strong --mode light",
      ]);
      expect((await top('make the dividers blue', 'd')).commands).toEqual([
        "set d --color-border '#2563eb' --on divider",
        "set d --color-border-emphasized '#2563eb' --on divider",
      ]);
      expect(
        (await top('make dividers three times as thick', 'd')).commands,
      ).toEqual(['set d --border-width 3px --on divider']);
      expect((await top('make the divider 50% thicker', 'd')).commands).toEqual(
        ['set d --border-width 1.5px --on divider'],
      );
      expect((await top('remove the dividers', 'd')).commands).toEqual([
        'set d --color-border transparent --on divider',
        'set d --color-border-emphasized transparent --on divider',
      ]);
    }, 240_000);

    it("refuses a fill on the divider's own element and a token its variant does not read", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('r', {cwd, like: 'neutral'});
      const fill = await refusal(() =>
        themeEditSet('r', 'background-color', '#ff0000', {cwd, on: 'divider'}),
      );
      expect(fill.code).toBe('ERR_THEME_NO_EFFECT');
      expect(fill.run.join(' ')).toMatch(
        /--color-border '#ff0000' --on divider/,
      );
      const strong = await refusal(() =>
        themeEditSet('r', '--color-border', '#ff0000', {
          cwd,
          on: 'divider',
          when: 'variant:strong',
        }),
      );
      expect(strong.code).toBe('ERR_THEME_NO_EFFECT');
      expect(strong.run.join(' ')).toMatch(
        /--color-border-emphasized '#ff0000' --on divider --when variant:strong/,
      );
    }, 240_000);
  });

  describe('a token family', () => {
    it('follows a source written as one light-dark() value', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('f', {cwd, like: 'neutral'});
      await themeEditSet(
        'f',
        '--color-border',
        'light-dark(#000000, #ffffff)',
        {
          cwd,
        },
      );
      expect(cssOf('f')).toMatch(
        /--color-border-emphasized: light-dark\(#000000, #ffffff\)/,
      );
    }, 240_000);
  });

  describe("a variant's low-contrast text", () => {
    it('is listed once per variant, with a fix for that variant', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('c', {cwd, like: 'neutral'});
      const r = await themeEditSet('c', 'color', '#f0f0f0', {
        cwd,
        on: 'badge',
        mode: 'light',
      });
      const listed = /** @type {Array<{problem: string, fix: string}>} */ (
        r.data.newProblems
      );
      const variants = listed.map(x => /variant (\w+)/.exec(x.problem)?.[1]);
      expect(variants.length).toBeGreaterThan(1);
      expect(new Set(variants).size).toBe(variants.length);
      for (const x of listed)
        expect(x.fix).toContain(
          `--when variant:${/variant (\w+)/.exec(x.problem)?.[1]}`,
        );
    }, 240_000);
  });

  describe('borders and thickness on parts with no line', () => {
    it("never colors a toast's border through a ghost button that draws none", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('t', {cwd, like: 'neutral'});
      const r = await top('make the toast border red', 't');
      expect(r.commands.join(' ')).not.toMatch(/--color-border/);
    }, 240_000);

    it("makes a slider's track thicker by its own height", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('s', {cwd, like: 'neutral'});
      expect(
        (await top('make the slider track thicker', 's')).commands,
      ).toEqual([
        'set s height 6px --on slider-track --when orientation:horizontal',
      ]);
    }, 240_000);
  });

  describe('a status ring under a state shadow', () => {
    it("keeps each status's own hover ring where the plain one is kept", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('h', {cwd, like: 'neutral'});
      const {commands} = await top(
        'make hovered inputs have a blue shadow in dark mode',
        'h',
      );
      const m = /^set h box-shadow '(.*)' --on inputs --state hover$/.exec(
        commands[0],
      );
      expect(m).toBeTruthy();
      await themeEditSet('h', 'box-shadow', /** @type {string[]} */ (m)[1], {
        cwd,
        on: 'inputs',
        state: 'hover',
      });
      expect(cssOf('h')).toMatch(
        /\.astryx-text-input\[data-status="error"\]:hover[^{]*\{\s*box-shadow: var\(--shadow-inset-error\), /,
      );
    }, 240_000);
  });

  describe("pieces named after a part's catalog name", () => {
    it("reads a select's arrow and a checkbox's check as those parts", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('p', {cwd, like: 'neutral'});
      expect((await top('make the select arrow blue', 'p')).commands).toEqual([
        "set p color '#2563eb' --on selector-indicator-icon",
      ]);
      expect((await top('make the checkbox check red', 'p')).commands).toEqual([
        "set p color '#dc2626' --on checkbox-indicator-check",
      ]);
    }, 240_000);
  });
});

// A kept state where another of the part's own states was changed keeps only
// where both hold; a long answer is cut only between whole asks, the rest given
// as the next sequences; a tab's underline removed is its indicator's fill; an
// input's focus ring is its box-shadow ring, and a resting shadow on inputs
// keeps each render's own focus look; a part's piece Core has no part for is
// named, never the whole part. Against real bundled base themes; the browser
// case renders Core's inputs with Core's built stylesheet in the Chromium the
// repository pins.
describe('state part states changed', () => {
  beforeAll(resetProject);

  const require = createRequire(import.meta.url);

  // The browser case runs only in the step that installs the pinned Chromium.
  const BROWSER_STEP = process.env.ASTRYX_THEME_EDITOR_BROWSER === '1';

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

  /** Every answer's commands, bare. @param {string} q @param {string} theme */
  const all = async (q, theme) => {
    const {data} = await themeEditHow(q, {cwd, theme});
    return (data.results ?? []).map(x => ({
      text: x.text,
      commands: x.commands.map(c => c.replace(/^.*? editor /, '')),
    }));
  };

  describe('a kept state', () => {
    it('keeps a checked, disabled box as Core draws it, and leaves an unchecked one alone', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('c', {cwd, like: 'neutral'});
      const r = await top(
        'make the checkbox green when checked but not when disabled',
        'c',
      );
      expect(r.commands).toContain(
        "set c background-color 'var(--color-accent)' --on checkbox-indicator --when checked:checked --state disabled --only",
      );
      // Never the unchecked resting fill under disabled alone.
      expect(
        r.commands.some(x =>
          /--color-background-surface.*--state disabled --only$/.test(x),
        ),
      ).toBe(false);
    }, 240_000);
  });

  describe('a long answer', () => {
    it('is cut only between whole asks, the rest as the next sequence', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('s', {cwd, like: 'neutral'});
      const r = await all(
        'make the input border red in light mode and pink in dark mode',
        's',
      );
      const seqs = r.filter(x => /changes, in order/.test(x.text));
      expect(seqs).toHaveLength(2);
      // The light ask and every one of its status keeps in the first; the
      // dark one and its keeps in the second.
      expect(seqs[0].commands.every(x => /--mode light$/.test(x))).toBe(true);
      expect(seqs[1].commands.every(x => /--mode dark$/.test(x))).toBe(true);
      expect(
        seqs[1].commands.filter(x => /--when status:(warning|success)/.test(x)),
      ).toHaveLength(4);
    }, 240_000);
  });

  describe("a tab's underline", () => {
    it('removed is its indicator made transparent where it paints', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('u', {cwd, like: 'neutral'});
      for (const q of [
        'remove the underline from tabs',
        'make the tabs underline-less',
      ])
        expect((await top(q, 'u')).commands, q).toEqual([
          'set u background-color transparent --on tab-indicator --state selected',
        ]);
    }, 240_000);
  });

  describe("an input's focus ring", () => {
    it('is its box-shadow ring for a color, a width or a removal, and status fields keep none', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('f', {cwd, like: 'neutral'});
      const dark = await top(
        'make the focus ring on inputs red in dark mode',
        'f',
      );
      expect(dark.commands).toEqual([
        "set f box-shadow 'inset 0 0 0 2px light-dark(var(--color-accent-muted), #dc2626)' --on inputs --state focus-within",
        'set f box-shadow none --on inputs --when status:error --state focus-within',
        'set f box-shadow none --on inputs --when status:warning --state focus-within',
        'set f box-shadow none --on inputs --when status:success --state focus-within',
      ]);
      expect(
        (await top('make the input focus ring thicker', 'f')).commands[0],
      ).toBe(
        "set f box-shadow 'inset 0 0 0 3px var(--color-accent-muted)' --on inputs --state focus-within",
      );
      expect((await top('remove the input focus ring', 'f')).commands).toEqual([
        'set f box-shadow none --on inputs --state focus-within',
      ]);
    }, 240_000);
  });

  describe('a resting shadow on inputs', () => {
    it('keeps every status selector at none while focused, and composes a status-scoped write for that status only', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('n', {cwd, like: 'neutral'});
      await themeEditSet('n', 'box-shadow', 'none', {cwd, on: 'inputs'});
      expect(cssOf('n')).toMatch(
        /\.astryx-selector\[data-size="md"\]\[data-status="error"\]\[data-variant="input"\]:focus-within \{\s*box-shadow: none;/,
      );
      await themeEditNew('e', {cwd, like: 'neutral'});
      await themeEditSet('e', 'box-shadow', '0 2px 6px #0000004d', {
        cwd,
        on: 'inputs',
        when: 'status:error',
      });
      const css = cssOf('e');
      expect(css).toMatch(
        /\.astryx-text-input\[data-status="error"\]:focus-within \{\s*box-shadow: 0 2px 6px #0000004d;/,
      );
      // The plain field is not written at all.
      expect(css).not.toMatch(/\.astryx-text-input:focus-within/);
    }, 240_000);

    it.runIf(BROWSER_STEP)(
      'draws, while focused, the ring a plain field shows and none on status fields, in every case',
      async () => {
        if (unbuilt)
          throw new Error(`the base themes could not be built: ${unbuilt}`);
        const React = require('react');
        const {renderToStaticMarkup} = require('react-dom/server');
        const {Selector, TextInput} = await import('@astryxdesign/core');
        const {Theme, defineTheme} = await import('@astryxdesign/core/theme');
        const {chromium} = require('playwright');
        const coreCss = fs.readFileSync(
          require.resolve('@astryxdesign/core/astryx.css'),
          'utf8',
        );
        const resetCss = fs.readFileSync(
          require.resolve('@astryxdesign/core/reset.css'),
          'utf8',
        );
        await themeEditNew('b0', {cwd, like: 'neutral'});
        await themeEditNew('b1', {cwd, like: 'neutral'});
        await themeEditSet('b1', 'box-shadow', 'none', {cwd, on: 'inputs'});
        await themeEditNew('b2', {cwd, like: 'neutral'});
        await themeEditSet('b2', 'box-shadow', 'none', {
          cwd,
          on: 'inputs',
          when: 'status:error',
        });
        await themeEditNew('b3', {cwd, like: 'neutral'});
        for (const cmd of (
          await top('make the focus ring on inputs red in dark mode', 'b3')
        ).commands) {
          const m =
            /^set b3 box-shadow (?:'([^']*)'|(none)) --on inputs(?: --when (\S+))? --state focus-within$/.exec(
              cmd,
            );
          if (!m) throw new Error(`unexpected step: ${cmd}`);
          await themeEditSet('b3', 'box-shadow', m[1] ?? m[2], {
            cwd,
            on: 'inputs',
            state: 'focus-within',
            ...(m[3] ? {when: m[3]} : {}),
          });
        }
        const layered = (/** @type {string} */ slug) => {
          const built = cssOf(slug);
          return built.includes('@layer astryx-theme')
            ? built
            : `@layer astryx-theme {\n${built}\n}`;
        };
        const h = React.createElement;
        const error = {type: 'error', message: 'Required'};
        const markup = (
          /** @type {string} */ name,
          /** @type {string} */ mode,
        ) =>
          renderToStaticMarkup(
            h(
              Theme,
              {theme: defineTheme({name}), mode},
              h(
                'div',
                {'data-probe': 'plain'},
                h(TextInput, {label: 'Name', value: '', onChange() {}}),
              ),
              h(
                'div',
                {'data-probe': 'error'},
                h(TextInput, {
                  label: 'Email',
                  value: '',
                  onChange() {},
                  status: error,
                }),
              ),
              h(
                'div',
                {'data-probe': 'select'},
                h(Selector, {
                  label: 'Size',
                  options: [{value: 'a', label: 'A'}],
                  value: 'a',
                  onChange() {},
                  status: error,
                }),
              ),
            ),
          );
        const browser = await chromium.launch({args: ['--no-sandbox']});
        try {
          const page = await browser.newPage();
          /** The box-shadow of each probe's field while it holds focus. */
          const focused = async (
            /** @type {string} */ name,
            /** @type {string} */ mode,
          ) => {
            await page.setContent(
              // (No transitions: a ring is read where it ends, not midway.)
              `<!doctype html><html><head><style>${resetCss}\n${coreCss}\n${layered(name)}\n*{transition:none!important}</style></head><body>${markup(name, mode)}</body></html>`,
            );
            /** @type {Record<string, string>} */
            const out = {};
            for (const [probe, box] of [
              ['plain', '.astryx-text-input'],
              ['error', '.astryx-text-input'],
              ['select', '.astryx-selector'],
            ]) {
              await page.focus(
                `[data-probe=${probe}] input, [data-probe=${probe}] button, [data-probe=${probe}] [tabindex="0"]`,
              );
              out[probe] = await page.$eval(
                `[data-probe=${probe}] ${box}`,
                el =>
                  /** @type {any} */ (
                    el.ownerDocument.defaultView
                  ).getComputedStyle(el).boxShadow,
              );
            }
            return out;
          };
          for (const mode of ['light', 'dark']) {
            const core = await focused('b0', mode);
            expect(core.error, mode).toBe('none');
            expect(core.select, mode).toBe('none');
            // No shadow: the plain ring stays, status fields keep none.
            expect(await focused('b1', mode), mode).toEqual(core);
            // No shadow on error fields: they stay none while focused.
            expect(await focused('b2', mode), mode).toEqual(core);
          }
          // The dark-mode ring: light is as Core draws it, every field.
          expect(await focused('b3', 'light')).toEqual(
            await focused('b0', 'light'),
          );
          const dark = await focused('b3', 'dark');
          expect(dark.plain).toMatch(/rgb\(220, 38, 38\)/);
          expect(dark.error).toBe('none');
          expect(dark.select).toBe('none');
        } finally {
          await browser.close();
        }
      },
      240_000,
    );
  });

  describe("a part's piece Core has no part for", () => {
    it("is named, never the whole part; a title drawn as the part's own text is the part, said so", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('p', {cwd, like: 'neutral'});
      for (const q of [
        'make the empty state icon bigger',
        'make the popover arrow red',
      ]) {
        const {data} = await themeEditHow(q, {cwd, theme: 'p'});
        const writes = (data.results ?? []).flatMap(x =>
          x.commands.filter(c => / editor set /.test(c)),
        );
        expect(writes, q).toEqual([]);
        expect(JSON.stringify(data), q).toMatch(
          /Core has no [a-z ]+ part of its own/,
        );
      }
      const alert = await top('make the alert title larger', 'p');
      expect(alert.commands).toEqual([
        expect.stringMatching(
          /^set p --text-label-size [\d.]+rem --on banner$/,
        ),
      ]);
      expect(alert.text).toMatch(
        // (Named by Core's part: an alert is the banner.)
        /Core has no banner title part of its own, so this is for the whole banner/,
      );
    }, 240_000);
  });

  describe("a toast's text token refused in one mode", () => {
    it('keeps the mode on the line it offers', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('t', {cwd, like: 'neutral'});
      const r = await refusal(() =>
        themeEditSet('t', '--color-text-primary', 'red', {
          cwd,
          on: 'toast',
          mode: 'dark',
        }),
      );
      expect(r.run.map(x => x.replace(/^.*? editor /, ''))).toEqual([
        'set t color red --on toast --mode dark',
      ]);
    }, 240_000);
  });
});

// States Core paints from ARIA attributes, several states at once, a group
// spreading only where its members are alike, scoped tokens on the parts a list
// or a menu holds, and a fill drawn inside a part. Against real bundled base
// themes.
describe('states core paints aria', () => {
  beforeAll(resetProject);

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
    it("names a pagination's current page and an open menu button as states, and builds them", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('a', {cwd, like: 'neutral'});
      const {data} = await themeEditHow('button', {cwd, theme: 'a'});
      expect(data.states).toEqual(
        expect.arrayContaining(['current', 'pressed', 'expanded']),
      );
      const when = Object.values(
        /** @type {Record<string, Array<{when: string[]}>>} */ (data.reads),
      )
        .flat()
        .flatMap(r => r.when)
        .join(' ');
      expect(when).toMatch(/--when variant:ghost --state current/);
      expect(when).not.toMatch(/aria-current=page \(not settable/);
      await themeEditSet('a', 'background-color', '#ff0000', {
        cwd,
        on: 'button',
        state: 'current',
      });
      await themeEditSet('a', 'background-color', '#0000ff', {
        cwd,
        on: 'button',
        state: 'expanded',
      });
      const css = cssOf('a');
      expect(css).toMatch(
        /\.astryx-button:is\(\[aria-current\]:not\(\[aria-current="false"\]\)\)\s*\{\s*background-color: #ff0000/,
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
          state: 'current+pressed',
        }),
      );
      expect(r.code).toBe('ERR_THEME_UNKNOWN_STATE');
      expect(r.message).toMatch(/never paints button current and pressed/);
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
      const radio =
        /\.astryx-radio-indicator\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
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
      const icon = await themeEditSet(
        's',
        '--color-icon-secondary',
        '#ff0000',
        {
          cwd,
          on: 'dropdown-menu-item',
        },
      );
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
});

// A part's text made transparent by an amount is its text color's alpha; states
// typed by their prop or ARIA name; several states at once where the element
// takes them, in one order; a one-mode border on a part that draws one in that
// state; a divider's line per variant, fainter, hidden, thicker. Against real
// bundled base themes.
describe('part text transparent amount', () => {
  beforeAll(resetProject);

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

  describe("a part's text made transparent by an amount", () => {
    it('is its text colors at that alpha, never the whole part faded', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('x', {cwd, like: 'neutral'});
      const r = await top('make the button text 50% transparent', 'x');
      expect(r.commands.length).toBeGreaterThan(0);
      expect(r.commands.join(' ')).not.toMatch(/\bopacity\b/);
      for (const c of r.commands)
        expect(c).toMatch(/^set x color '#[0-9a-f]{6}80' --on button /);
      const card = await top(
        'make the fainter text in cards 50% transparent',
        'x',
      );
      expect(card.commands.join(' ')).not.toMatch(/\bopacity\b/);
      // (The fainter text is the secondary text, as "the muted text in
      // cards" reads it.)
      expect(card.commands[0]).toMatch(
        /^set x --color-text-secondary '#[0-9a-f]{6}80' --on card --mode light$/,
      );
    }, 240_000);
  });

  describe('a state typed by its prop or ARIA name', () => {
    it('is the state of that name', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('n', {cwd, like: 'neutral'});
      for (const [on, state, saved] of [
        ['button', 'isPressed', 'pressed'],
        ['button', 'aria-expanded', 'expanded'],
        ['tab', 'isSelected', 'selected'],
      ]) {
        const r = await themeEditSet('n', 'background-color', '#ff0000', {
          cwd,
          on,
          state,
        });
        expect(r.data.setting).toMatchObject({on, state: saved});
      }
    }, 240_000);
  });

  describe('several states at once', () => {
    it('takes a hovered selected tab, in one order, and undoes it in either', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('t', {cwd, like: 'neutral'});
      expect(
        (await top('make hovered selected tabs blue', 't')).commands,
      ).toEqual([
        // (In the tab's own order, as set saves it.)
        "set t background-color '#2563eb' --on tab --state selected+hover",
      ]);
      await themeEditSet('t', 'background-color', '#ff0000', {
        cwd,
        on: 'tab',
        state: 'hover+selected',
      });
      await themeEditSet('t', 'background-color', '#0000ff', {
        cwd,
        on: 'tab',
        state: 'selected+hover',
      });
      const saved = (await themeEditShow('t', {cwd})).data.settings.filter(
        (/** @type {any} */ x) => x.on === 'tab',
      );
      expect(saved).toEqual([
        expect.objectContaining({state: 'selected+hover', value: '#0000ff'}),
      ]);
      await themeEditUndo('t', {
        cwd,
        thing: 'background-color',
        on: 'tab',
        state: 'hover+selected',
      });
      expect(
        (await themeEditShow('t', {cwd})).data.settings.some(
          (/** @type {any} */ x) => x.on === 'tab',
        ),
      ).toBe(false);
      const r = await refusal(() =>
        themeEditSet('t', 'background-color', '#ff0000', {
          cwd,
          on: 'checkbox-indicator',
          state: 'checked+hover',
        }),
      );
      expect(r.code).toBe('ERR_THEME_UNKNOWN_STATE');
    }, 240_000);
  });

  describe('a one-mode border on a part that draws one in that state', () => {
    it("is that state's border color alone, the other mode's focus ring kept", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('f', {cwd, like: 'neutral'});
      expect(
        (await top('make the focused border of inputs blue in dark mode', 'f'))
          .commands,
      ).toEqual([
        "set f border-color '#2563eb' --on inputs --state focus-within --mode dark",
      ]);
    }, 240_000);
  });

  describe("a divider's line", () => {
    it('fades and hides every variant, and thickens the variant said', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('d', {cwd, like: 'neutral'});
      const faint = await top('make dividers fainter', 'd');
      expect(faint.commands.join(' ')).toMatch(/--color-border-emphasized/);
      expect((await top('hide the dividers', 'd')).commands).toEqual([
        'set d --color-border transparent --on divider',
        'set d --color-border-emphasized transparent --on divider',
      ]);
      expect((await top('make subtle dividers thicker', 'd')).commands).toEqual(
        ['set d --border-width 2px --on divider --when variant:subtle'],
      );
    }, 240_000);
  });
});

// The part data draws every prop that changes a part's look (a toast's type, an
// avatar's shape), and reads a prop as a condition where it changes a color the
// part paints; pieces of a part (a select's chevron, a field's segments) and a
// selection said in another word (a toggle button's pressed state) are read as
// the part has them; an indeterminate ask reaches indeterminate boxes only.
// Against real bundled base themes.
describe('part data draws prop', () => {
  beforeAll(resetProject);

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

  describe("an error toast's background", () => {
    it('is read from what Core paints an error toast, so darker steps from its red', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('e', {cwd, like: 'neutral'});
      const r = await top('make the error toast background darker', 'e');
      expect(r.text).toMatch(/from --color-background-error-inverted/);
      expect(r.commands).toEqual([
        expect.stringMatching(
          /^set e background-color '#[0-9a-f]{6}' --on toast --when type:error --mode light$/,
        ),
        expect.stringMatching(
          /^set e background-color '#[0-9a-f]{6}' --on toast --when type:error --mode dark$/,
        ),
      ]);
    }, 240_000);
  });

  describe('a kept avatar', () => {
    it('pins every corner token its shapes read', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('a', {cwd, like: 'neutral'});
      const r = await top('square corners on everything but avatars', 'a');
      expect(r.commands[0]).toBe('set a corners square');
      expect(
        r.commands.filter(x => / --on avatar$/.test(x)).length,
      ).toBeGreaterThan(1);
    }, 240_000);
  });

  describe('pieces and words', () => {
    it("reads a select's chevron or caret as its indicator icon, never the select or the text cursor", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('p', {cwd, like: 'neutral'});
      for (const q of [
        'make the select chevron blue',
        'make the dropdown caret blue',
      ])
        expect((await top(q, 'p')).commands, q).toEqual([
          "set p color '#2563eb' --on selector-indicator-icon",
        ]);
    }, 240_000);

    it('reaches indeterminate boxes only for an indeterminate ask', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('i', {cwd, like: 'neutral'});
      expect(
        (await top('make indeterminate checkboxes red', 'i')).commands,
      ).toEqual([
        "set i background-color '#dc2626' --on checkbox-indicator --when checked:indeterminate --only",
      ]);
    }, 240_000);

    it("reads selected as a toggle button's pressed state", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('t', {cwd, like: 'neutral'});
      expect(
        (await top('make toggle buttons red when selected', 't')).commands,
      ).toEqual([
        "set t background-color '#dc2626' --on toggle-button --state isPressed",
      ]);
    }, 240_000);

    it('names segments a date picker does not have, never bordering the whole field', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('d', {cwd, like: 'neutral'});
      const {data} = await themeEditHow('make date picker segments bordered', {
        cwd,
        theme: 'd',
      });
      expect(
        (data.results ?? []).flatMap(x =>
          x.commands.filter(c => / editor set /.test(c)),
        ),
      ).toEqual([]);
      expect(JSON.stringify(data)).toMatch(
        // (Named by Core's part: a date picker is the date input.)
        /Core has no date input segment part of its own/,
      );
    }, 240_000);
  });

  describe('rings, borders and dots in one mode or for all', () => {
    it('keeps the hover ring beside a one-mode hover shadow on inputs', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('h', {cwd, like: 'neutral'});
      const r = await top(
        'make hovered inputs have a blue shadow in dark mode',
        'h',
      );
      expect(r.commands[0]).toMatch(
        /^set h box-shadow 'inset 0 0 0 2px color-mix\(.*\), .*light-dark\(transparent, #2563eb\).*' --on inputs --state hover$/,
      );
    }, 240_000);

    it('reads "half as visible" as the input ring at half its alpha', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('v', {cwd, like: 'neutral'});
      expect(
        (await top('make the input focus ring half as visible', 'v'))
          .commands[0],
      ).toBe(
        "set v box-shadow 'inset 0 0 0 2px color-mix(in srgb, var(--color-accent-muted) 50%, transparent)' --on inputs --state focus-within",
      );
    }, 240_000);

    it('draws a one-mode border on a part with no line, see-through in the other mode', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('b', {cwd, like: 'neutral'});
      expect(
        (await top('make the button border red in dark mode', 'b')).commands,
      ).toEqual([
        // (A ring at its edge, which takes no room: a border would take its
        // width in the other mode too.)
        "set b box-shadow 'inset 0 0 0 1px light-dark(transparent, #dc2626)' --on button --when elevation:none",
      ]);
    }, 240_000);

    it("reads a radio's dot as its dot part", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('r', {cwd, like: 'neutral'});
      expect((await top('make the radio dot red', 'r')).commands).toEqual([
        "set r background-color '#dc2626' --on radio-indicator-dot",
      ]);
    }, 240_000);

    it("colors every focus ring, the inputs' box-shadow rings included", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('fr', {cwd, like: 'neutral'});
      const r = await top('make all focus rings red', 'fr');
      expect(r.commands.slice(0, 2)).toEqual([
        "set fr --focus-outline-color '#dc2626'",
        "set fr box-shadow 'inset 0 0 0 2px #dc2626' --on inputs --state focus-within",
      ]);
    }, 240_000);
  });

  describe('a state a part does not draw apart', () => {
    it('names it for a progress bar, and never adds the checkboxes', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('pg', {cwd, like: 'neutral'});
      const {data} = await themeEditHow(
        'make the progress indicator red when indeterminate',
        {cwd, theme: 'pg'},
      );
      const all = (data.results ?? []).flatMap(x => x.commands);
      expect(all.filter(c => / editor set /.test(c))).toEqual([]);
      expect(JSON.stringify(data)).toMatch(
        /progress-bar-fill has no indeterminate state/,
      );
    }, 240_000);
  });
});

// A part whose text sits on Core's media surface inside it (a toast's inverted
// surface) takes its text color through the on-dark and on-light colors, which
// its color writes; resting shadows on ringed parts keep each render's own
// rings (no shadow too) and give way to a state's own shadow; an input's focus
// ring is its box-shadow ring; thumb words; covers notes keep their mode; the
// corners help names the step between round and pill. Against real bundled base
// themes.
describe('part text sits core', () => {
  beforeAll(resetProject);

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

  describe("a toast's text color", () => {
    it('is its color on the toast, and a text token there is refused with that line', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('t', {cwd, like: 'neutral'});
      const r = await refusal(() =>
        themeEditSet('t', '--color-text-primary', '#2a2a2a', {
          cwd,
          on: 'toast',
        }),
      );
      expect(r.code).toBe('ERR_THEME_NO_EFFECT');
      expect(r.message).toMatch(/media surface/);
      const answer = await top('make the toast text #2a2a2a', 't');
      expect(answer.commands).toEqual(["set t color '#2a2a2a' --on toast"]);
      await themeEditSet('t', 'color', '#2a2a2a', {cwd, on: 'toast'});
      // The color goes into the two colors the surface gives its text, on
      // the toast alone.
      const css = fs.readFileSync(path.join(cwd, 'themes/t/t.css'), 'utf8');
      const toast = css.slice(css.indexOf('.astryx-toast'));
      expect(toast).toMatch(/--color-on-dark:\s*#2a2a2a/i);
      expect(toast).toMatch(/--color-on-light:\s*#2a2a2a/i);
    }, 240_000);
  });

  describe('the corners help', () => {
    it('names the step between round and pill', async ctx => {
      if (needBases(ctx)) return;
      const {data} = await themeEditHow('corners', {cwd});
      expect(JSON.stringify(data)).toMatch(
        /24px \(the step between round and pill\), pill/,
      );
    }, 240_000);
  });

  /** The box-shadow of the first rule for a selector. @param {string} css @param {string} sel */
  const shadowOf = (css, sel) =>
    new RegExp(
      `${sel.replace(/[.[\]="()]/g, m => `\\${m}`)}[^{]*\\{\\s*box-shadow: ([^;]*);`,
    ).exec(css)?.[1];

  describe('a resting shadow on a ringed part', () => {
    it("keeps each render's own rings: none leaves them, a status draws the shadow alone while focused", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('r', {cwd, like: 'neutral'});
      await themeEditSet('r', 'box-shadow', 'none', {cwd, on: 'inputs'});
      let css = cssOf('r');
      expect(shadowOf(css, '.astryx-text-input:focus-within')).toBe(
        'inset 0 0 0 2px var(--color-accent-muted)',
      );
      expect(
        shadowOf(css, '.astryx-text-input[data-status="error"]:focus-within'),
      ).toBe('none');
      await themeEditNew('r2', {cwd, like: 'neutral'});
      await themeEditSet('r2', 'box-shadow', '0 2px 6px #0000004d', {
        cwd,
        on: 'inputs',
      });
      css = cssOf('r2');
      expect(
        shadowOf(css, '.astryx-text-input[data-status="error"]:focus-within'),
      ).toBe('0 2px 6px #0000004d');
      // A later hover shadow for the part wins on every render.
      await themeEditSet('r2', 'box-shadow', '0 0 0 1px red', {
        cwd,
        on: 'inputs',
        state: 'hover',
      });
      css = cssOf('r2');
      expect(css).not.toMatch(
        /\[data-status="error"\]:hover[^{]*\{\s*box-shadow: 0 2px 6px/,
      );
    }, 240_000);
  });

  describe("an input's focus ring", () => {
    it('is its box-shadow ring, and an outline color on it is refused', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('f', {cwd, like: 'neutral'});
      const r = await top('red focus ring on text inputs', 'f');
      expect(r.commands[0]).toBe(
        "set f box-shadow 'inset 0 0 0 2px #dc2626' --on text-input --state focus-within --only",
      );
      const no = await refusal(() =>
        themeEditSet('f', 'outline-color', 'red', {
          cwd,
          on: 'text-input',
          state: 'focus-within',
          only: true,
        }),
      );
      expect(no.code).toBe('ERR_THEME_NO_EFFECT');
    }, 240_000);
  });

  describe('words and notes', () => {
    it('reads a toggle thumb or switch knob as the thumb', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('w', {cwd, like: 'neutral'});
      expect(
        (await top('make the toggle thumb blue', 'w')).commands[0],
      ).toMatch(/--on switch-thumb$/);
      expect(
        (await top('make the switch knob black in dark mode', 'w')).commands[0],
      ).toMatch(/--on switch-thumb --mode dark$/);
    }, 240_000);

    it('keeps the mode of a one-mode fill in its covers notes', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('m', {cwd, like: 'neutral'});
      const r = await themeEditSet('m', 'background-color', '#16a34a', {
        cwd,
        on: 'button',
        mode: 'light',
      });
      const note = r.data.notes.find(n =>
        /covers the fill Core gives it/.test(n),
      );
      expect(note).toMatch(/^in light mode, /);
      expect(note).toMatch(/--when variant:primary --mode light/);
    }, 240_000);
  });
});

// A theme made in a design session: heading colors, the page background and its
// gradients per mode, background values with many variables, and what the page
// background token reaches, against a real bundled base.
describe('design session heading colors', () => {
  beforeAll(resetProject);

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
      expect(cssOf('h1')).not.toMatch(
        /:root[^}]*--color-text-primary: #aa3355/,
      );
      const how = await themeEditHow('headings in the accent color', {
        cwd,
        theme: 'h1',
      });
      expect(JSON.stringify(how.data)).toMatch(
        /set h1 color [^"]*--on heading/,
      );
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
      const css = cssOf('p3');
      expect(
        modeValue(css, '.astryx-app-shell', 'background-image', 'light'),
      ).toBe('linear-gradient(#ffffff, #ddeeff)');
      expect(
        modeValue(css, '.astryx-app-shell', 'background-image', 'dark'),
      ).toBe('linear-gradient(#000000, #112233)');
    }, 240_000);

    it('keeps an earlier both-mode gradient in the other mode', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('p4', {cwd, like: 'neutral'});
      await themeEditSet('p4', 'background', 'linear-gradient(red, #000)', {
        cwd,
        on: 'card',
      });
      await themeEditSet(
        'p4',
        'background',
        'linear-gradient(#fff, #eee) 0 0 / 4px 4px, #fff',
        {cwd, on: 'card', mode: 'dark'},
      );
      const css = cssOf('p4');
      expect(modeValue(css, '.astryx-card', 'background', 'light')).toBe(
        'linear-gradient(red, #000)',
      );
      expect(modeValue(css, '.astryx-card', 'background-image', 'dark')).toBe(
        'linear-gradient(#fff, #eee)',
      );
      expect(modeValue(css, '.astryx-card', 'background-size', 'dark')).toBe(
        '4px 4px',
      );
      expect(modeValue(css, '.astryx-card', 'background-color', 'dark')).toBe(
        '#fff',
      );
    }, 240_000);
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
      const dot =
        'color-mix(in srgb, var(--color-background-body) 35%, #ffffff)';
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
});

// A resting shadow on a part that rings itself in its box-shadow keeps the
// rings: each state Core rings is written with the shadow and that ring. how
// answers a sunken bevel there. Against real bundled base themes.
describe('resting shadow part rings', () => {
  beforeAll(resetProject);

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
});

// A table's row lines are its cells' borders, colored through the token they
// read on the row; outlined buttons are the outline look (the dial, or a
// variant's own color as its border and text), never a border over the fill; a
// keep that needs two states at once says so. Against real bundled base themes.
describe('table cells borders colored', () => {
  beforeAll(resetProject);

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

  describe("a table's row lines", () => {
    it('are colored through the token the cells draw them with, on the row', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('t', {cwd, like: 'neutral'});
      for (const q of [
        'make the table row dividers red',
        'make table borders red',
      ])
        expect((await top(q, 't')).commands, q).toEqual([
          "set t --color-border '#dc2626' --on table-row",
        ]);
    }, 240_000);
  });

  describe('outlined buttons', () => {
    it("are the buttons dial for all of them, and a variant's own color as its border and text for one", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('b', {cwd, like: 'neutral'});
      for (const q of ['make buttons outline', 'make buttons outlined'])
        expect((await top(q, 'b')).commands, q).toEqual([
          'set b buttons outline',
        ]);
      expect(
        (await top('make the danger buttons outline only', 'b')).commands,
      ).toEqual([
        'set b background-color transparent --on button --when variant:destructive',
        "set b border 'var(--border-width) solid var(--color-error)' --on button --when variant:destructive",
        "set b color 'var(--color-error)' --on button --when variant:destructive",
      ]);
    }, 240_000);
  });

  describe('a keep that needs two states at once', () => {
    it('names that reason, never a missing prop', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('s', {cwd, like: 'neutral'});
      const {data} = await themeEditHow(
        'make the switch red when on except when disabled',
        {cwd, theme: 's'},
      );
      const text = (data.results ?? []).map(x => x.text).join('\n');
      expect(text).toMatch(/checked and disabled at once/);
      expect(text).not.toMatch(/has no prop/);
      expect(text).not.toMatch(/has nothing this change sets to keep/);
    }, 240_000);
  });

  describe("an input's focus ring, asked per mode, per status, as a question", () => {
    it('is one ring for a mode pair, a layer per mode for a width in one mode, and the status named', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('f', {cwd, like: 'neutral'});
      const pair = await top(
        'make the input focus ring blue in light mode and red in dark mode',
        'f',
      );
      expect(pair.commands[0]).toBe(
        "set f box-shadow 'inset 0 0 0 2px light-dark(#2563eb, #dc2626)' --on inputs --state focus-within",
      );
      expect(pair.commands.some(x => /border-color/.test(x))).toBe(false);
      expect(
        (await top('make the input focus ring thinner in dark mode', 'f'))
          .commands[0],
      ).toBe(
        "set f box-shadow 'inset 0 0 0 2px light-dark(var(--color-accent-muted), transparent), inset 0 0 0 1px light-dark(transparent, var(--color-accent-muted))' --on inputs --state focus-within",
      );
      expect(
        (await top("make error inputs' focus ring red", 'f')).commands,
      ).toEqual([
        "set f box-shadow 'inset 0 0 0 2px #dc2626' --on inputs --when status:error --state focus-within",
      ]);
      const none = await themeEditHow(
        'remove the focus ring from error inputs',
        {
          cwd,
          theme: 'f',
        },
      );
      expect(
        (none.data.results ?? []).flatMap(x =>
          x.commands.filter(c => / editor set /.test(c)),
        ),
      ).toEqual([]);
      expect(
        (await top('make the focus ring on inputs 50% more transparent', 'f'))
          .commands[0],
      ).toBe(
        "set f box-shadow 'inset 0 0 0 2px color-mix(in srgb, var(--color-accent-muted) 50%, transparent)' --on inputs --state focus-within",
      );
      const asked = await themeEditHow(
        'how is the focus ring on inputs drawn',
        {
          cwd,
          theme: 'f',
        },
      );
      expect(
        (asked.data.results ?? []).flatMap(x =>
          x.commands.filter(c => / editor set /.test(c)),
        ),
      ).toEqual([]);
    }, 240_000);
  });

  describe('a hover shadow on inputs', () => {
    it('keeps the focus ring while focused, written after the hover rule', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('h', {cwd, like: 'neutral'});
      await themeEditSet('h', 'box-shadow', 'none', {
        cwd,
        on: 'inputs',
        state: 'hover',
      });
      const css = fs.readFileSync(
        path.join(cwd, 'themes', 'h', 'h.css'),
        'utf8',
      );
      const hover = css.indexOf('.astryx-text-input:hover');
      const focus = css.indexOf('.astryx-text-input:focus-within');
      expect(hover).toBeGreaterThan(-1);
      expect(focus).toBeGreaterThan(hover);
      expect(css.slice(focus, focus + 200)).toMatch(
        /box-shadow: inset 0 0 0 2px var\(--color-accent-muted\)/,
      );
      expect(css).toMatch(
        /\.astryx-text-input\[data-status="error"\]:focus-within \{\s*box-shadow: none;/,
      );
    }, 240_000);
  });
});

// A panel's text is the text color tokens its heading and text read (a
// drawer's, a bottom sheet's), and an inputs fill lands where each member
// paints its box (a date and time field's two boxes). Against real bundled base
// themes.
describe('panel text color tokens', () => {
  beforeAll(resetProject);

  /** @param {import('vitest').TestContext} ctx */
  const needBases = ctx => {
    if (!unbuilt) return false;
    console.warn(`skipped: ${unbuilt}`);
    ctx.skip();
    return true;
  };

  /** @param {string} q @param {string} theme */
  const answer = async (q, theme) => {
    const {data} = await themeEditHow(q, {cwd, theme});
    return {
      parts: data.understood?.parts ?? [],
      writes: (data.results ?? [])
        .flatMap((/** @type {any} */ r) => r.commands)
        .filter((/** @type {string} */ c) => / editor set /.test(c))
        .map((/** @type {string} */ c) => c.replace(/^.*? editor /, '')),
      text: (data.results ?? [])
        .map((/** @type {any} */ r) => r.text)
        .join('\n'),
    };
  };

  describe('panel text color tokens', () => {
    it("a panel's text color is its heading and text's tokens", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('d', {cwd, like: 'neutral'});
      for (const part of [
        'drawer',
        'bottom sheet',
        'alert dialog',
        'hover card',
      ]) {
        const r = await answer(`make the ${part} text #b91c1c`, 'd');
        expect(r.writes.join('\n'), part).toMatch(
          /--color-text-primary '#b91c1c'/,
        );
        expect(r.writes.join('\n'), part).not.toMatch(/ color '#b91c1c'/);
      }
    }, 240_000);

    it("an inputs fill paints a date and time field's boxes", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('f', {cwd, like: 'neutral'});
      await themeEditSet('f', 'background-color', '#e6e0e9', {
        cwd,
        on: 'inputs',
      });
      const css = fs.readFileSync(
        path.join(cwd, 'themes', 'f', 'f.css'),
        'utf8',
      );
      expect(css).toMatch(
        /astryx-date-time-input-date-segment[^{]*\{[^}]*#e6e0e9/i,
      );
    }, 240_000);
  });
});

// element and state reads: a part's own fill, the text beside a part, a
// possessive's two-word element, an unknown word before a piece, a second state
// a part lacks. Against real bundled base themes.
describe('state part fill text', () => {
  beforeAll(resetProject);

  /** @param {import('vitest').TestContext} ctx */
  const needBases = ctx => {
    if (!unbuilt) return false;
    console.warn(`skipped: ${unbuilt}`);
    ctx.skip();
    return true;
  };

  /** @param {string} q @param {string} theme */
  const answer = async (q, theme) => {
    const {data} = await themeEditHow(q, {cwd, theme});
    return {
      parts: data.understood?.parts ?? [],
      writes: (data.results ?? [])
        .flatMap((/** @type {any} */ r) => r.commands)
        .filter((/** @type {string} */ c) => / editor set /.test(c))
        .map((/** @type {string} */ c) => c.replace(/^.*? editor /, '')),
      text: (data.results ?? [])
        .map((/** @type {any} */ r) => r.text)
        .join('\n'),
    };
  };

  describe('reads', () => {
    it('reads each element where the words put it', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('f', {cwd, like: 'neutral'});
      // A card paints its own fill: never a part inside it.
      const fill = await answer('make the badge text match the card fill', 'f');
      expect(fill.parts).not.toContain('checkbox-input');
      // The text after a checkbox is its label.
      expect(
        (await answer('make the text after the checkbox bold', 'f')).writes,
      ).toEqual(['set f font-weight 700 --on checkbox-label']);
      // A possessive's two-word element.
      expect(
        (await answer("make the table's header cells bold", 'f')).writes,
      ).toEqual(['set f font-weight 700 --on table-header-cell']);
      // An unknown word before a piece is said, nothing written.
      const zorp = await answer('make the card zorp title bigger', 'f');
      expect(zorp.writes).toEqual([]);
      expect(zorp.text).toMatch(/zorp/);
      // The inputs in a dialog are the inputs, never a command palette's.
      const inputs = await answer('make the inputs in dialogs taller', 'f');
      expect(inputs.parts).not.toContain('command-palette-input');
      // The separators of menus are the menu's own divider.
      expect(
        (await answer('make the separators of menus red', 'f')).writes,
      ).toEqual(["set f --color-border '#dc2626' --on dropdown-menu-divider"]);
      // A card's headings are its title: kept to the card.
      for (const c of (await answer('make the card headings bigger', 'f'))
        .writes)
        expect(c).toMatch(/ --on card$/);
      // A second state the part lacks is said.
      const two = await answer(
        'make the selected and hovered menu items blue',
        'f',
      );
      expect(two.writes).toEqual([]);
      expect(two.text).toMatch(/has no selected state/);
    }, 240_000);
  });
});

// Elements named beside or before a part: an icon in a place takes its color, a
// part said before its separators owns them, an icon after a part's text is
// that part's icon. Against real bundled base themes.
describe('elements named beside part', () => {
  beforeAll(resetProject);

  /** @param {import('vitest').TestContext} ctx */
  const needBases = ctx => {
    if (!unbuilt) return false;
    console.warn(`skipped: ${unbuilt}`);
    ctx.skip();
    return true;
  };

  /** @param {string} q @param {string} theme */
  const answer = async (q, theme) => {
    const {data} = await themeEditHow(q, {cwd, theme});
    return {
      parts: data.understood?.parts ?? [],
      writes: (data.results ?? [])
        .flatMap((/** @type {any} */ r) => r.commands)
        .filter((/** @type {string} */ c) => / editor set /.test(c))
        .map((/** @type {string} */ c) => c.replace(/^.*? editor /, '')),
      text: (data.results ?? [])
        .map((/** @type {any} */ r) => r.text)
        .join('\n'),
    };
  };

  describe('elements beside a part', () => {
    it('reads each where the words put it', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('c', {cwd, like: 'neutral'});
      // An icon read in a place takes its color, never a box behind it.
      for (const q of [
        'make the chevron in selects blue',
        'make the close icon in dialogs red',
      ])
        for (const w of (await answer(q, 'c')).writes)
          expect(w, q).not.toMatch(/ background-color /);
      // A part said before its separators owns them.
      const dd = await answer('make the dropdown separators gray', 'c');
      expect(dd.writes.join('\n')).not.toMatch(/--on (?:selector|divider)\b/);
      expect(dd.writes.join('\n')).toMatch(/--on dropdown-menu-divider$/m);
      const cm = await answer('make the context menu separators gray', 'c');
      expect(cm.writes.join('\n')).not.toMatch(
        /background-color .* --on context-menu|--on divider\b/,
      );
      // An icon after a part's text is that part's icon.
      const icon = await answer('make the icon after the button text red', 'c');
      expect(icon.writes.length).toBeGreaterThan(0);
      for (const w of icon.writes) expect(w).toMatch(/ --on button$/);
    }, 240_000);
  });
});

// Words a clone ask uses: table headers are the header cells, menus said
// plainly are every menu, a tab's underline asked for a color and a thickness
// is its indicator's fill and height. Against real bundled base themes.
describe('words uses table headers', () => {
  beforeAll(resetProject);

  /** @param {import('vitest').TestContext} ctx */
  const needBases = ctx => {
    if (!unbuilt) return false;
    console.warn(`skipped: ${unbuilt}`);
    ctx.skip();
    return true;
  };

  /** @param {string} q @param {string} theme */
  const answer = async (q, theme) => {
    const {data} = await themeEditHow(q, {cwd, theme});
    return {
      parts: data.understood?.parts ?? [],
      writes: (data.results ?? [])
        .flatMap((/** @type {any} */ r) => r.commands)
        .filter((/** @type {string} */ c) => / editor set /.test(c))
        .map((/** @type {string} */ c) => c.replace(/^.*? editor /, '')),
      text: (data.results ?? [])
        .map((/** @type {any} */ r) => r.text)
        .join('\n'),
    };
  };

  describe('clone words', () => {
    it('reads each as the part Core draws', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('k', {cwd, like: 'neutral'});
      // Table headers (plural) are the header cells, never every row.
      for (const w of (await answer('table headers uppercase', 'k')).writes)
        expect(w).toMatch(/ --on table-header-cell$/);
      // Menus said plainly are the menus group.
      const menus = await answer('make the menus red', 'k');
      expect(menus.parts).toContain('menus');
      // A tab's 2px black underline is its indicator's fill and height.
      const tab = await answer(
        'tabs with a 2px black underline when selected',
        'k',
      );
      expect(tab.writes.join('\n')).not.toMatch(/text-decoration/);
      expect(tab.writes.join('\n')).toMatch(
        /background-color '#000000' --on tab-indicator/,
      );
      expect(tab.writes.join('\n')).toMatch(
        /(?:min-)?height 2px --on tab-indicator/,
      );
    }, 240_000);
  });
});

// A title said of a part the census knows ("the empty state title") is that
// part's own title part: its size and color go to the text, never to the whole
// part or every heading. Against real bundled base themes.
describe('title part census size', () => {
  beforeAll(resetProject);

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

  describe('a component title', () => {
    it('is the title part: its size and color, never the whole part or a background', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('e', {cwd, like: 'neutral'});
      const bigger = await top('make the empty state title bigger', 'e');
      expect(bigger.commands).toEqual([
        expect.stringMatching(
          /^set e font-size [\d.]+rem --on empty-state-title$/,
        ),
      ]);
      const both = await top('make the empty state title red and bigger', 'e');
      expect(both.commands).toEqual([
        "set e color '#dc2626' --on empty-state-title",
        expect.stringMatching(
          /^set e font-size [\d.]+rem --on empty-state-title$/,
        ),
      ]);
      expect(both.commands.join(' ')).not.toMatch(/background|--on heading\b/);
      // Headings said alone keep reading as headings.
      expect((await top('make headers bolder', 'e')).commands[0]).toMatch(
        /^set e headings bold$/,
      );
    }, 240_000);
  });
});

// A divider's line is an inner element with no theming target: the part data
// records what it paints as the divider's own (its color per variant and its
// thickness), and how answers a divider fainter, thinner or darker through the
// readers every part uses. Against real bundled base themes.
describe('divider inner theming target', () => {
  beforeAll(resetProject);

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

  describe("a divider's line", () => {
    it("is recorded as the divider's own paint, per variant", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('d', {cwd, like: 'neutral'});
      const {data} = await themeEditHow('divider', {cwd, theme: 'd'});
      const tokens = (data.reads?.background ?? []).map(
        (/** @type {any} */ r) => r.token,
      );
      expect(tokens).toEqual(
        expect.arrayContaining(['--color-border', '--color-border-emphasized']),
      );
    }, 240_000);

    it('less visible: the color its line reads, fainter, per variant', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('f', {cwd, like: 'neutral'});
      const plain = await top('make the divider less visible', 'f');
      expect(plain.commands.length).toBeGreaterThan(0);
      // (Every variant's line: the strong divider's is its own token.)
      for (const x of plain.commands)
        expect(x).toMatch(
          /^set f --color-border(-emphasized)? '#[0-9a-f]{8}' --on divider --mode (light|dark)$/,
        );
      const strong = await top('make strong dividers less visible', 'f');
      for (const x of strong.commands)
        expect(x).toMatch(
          /^set f --color-border-emphasized '#[0-9a-f]{8}' --on divider --when variant:strong --mode (light|dark)$/,
        );
    }, 240_000);

    it('thinner and thicker: from the thickness it shows now', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('t', {cwd, like: 'neutral'});
      expect((await top('make dividers thinner', 't')).commands).toEqual([
        'set t --border-width 0.5px --on divider',
      ]);
      expect((await top('make dividers thicker', 't')).commands).toEqual([
        'set t --border-width 2px --on divider',
      ]);
    }, 240_000);

    it('darker: the color its line reads, on the divider', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('k', {cwd, like: 'neutral'});
      const r = await top('make dividers darker', 'k');
      expect(r.commands.length).toBeGreaterThan(0);
      for (const x of r.commands)
        expect(x).toMatch(
          // (Each variant's line token: the strong divider's is its own.)
          /^set k --color-border(-emphasized)? '#[0-9a-f]{6,8}' --on divider --mode (light|dark)$/,
        );
    }, 240_000);
  });
});

// An element of a part named before "in" or "of" that part (the selected option
// row in the selector): that part's own element, never another component the
// words seem to name, and the place is where, not what. Against real bundled
// base themes.
describe('part named component words', () => {
  beforeAll(resetProject);

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

  describe('an element of a part named in that part', () => {
    it("is the part's own element by the rest of its catalog name, in the state said", async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('e', {cwd, like: 'neutral'});
      expect(
        (await top('make the selected option row in the selector bold', 'e'))
          .commands,
      ).toEqual([
        'set e font-weight 700 --on selector-option-row --state selected',
      ]);
      expect(
        (await top('make the hovered option in the selector red', 'e'))
          .commands,
      ).toEqual([
        "set e background-color '#dc2626' --on selector-option --state hover",
      ]);
    }, 240_000);

    it('takes the element of that name that has the state said', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('k', {cwd, like: 'neutral'});
      expect(
        (await top('make the checked item in the dropdown menu bold', 'k'))
          .commands,
      ).toEqual([
        'set k font-weight 700 --on dropdown-menu-radio --state checked',
      ]);
    }, 240_000);

    it('never writes the place after "of" as a part of its own', async ctx => {
      if (needBases(ctx)) return;
      await themeEditNew('o', {cwd, like: 'neutral'});
      expect(
        (
          await top(
            'make the text in the hovered menu item of the dropdown red',
            'o',
          )
        ).commands,
      ).toEqual([
        "set o color '#dc2626' --on dropdown-menu-item --state hover",
      ]);
    }, 240_000);
  });
});
