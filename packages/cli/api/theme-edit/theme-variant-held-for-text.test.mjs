// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A setting on one part that would make its text unreadable in one of its
 * variants drawn on another ground keeps that variant at Core's look: a top
 * nav link colored for a dark bar keeps Core's color in the phone menu
 * (`mode:drawer`, on the menu's own surface), named with the line that gives
 * it there anyway; one undo takes both back. Against a real bundled base
 * theme, whose census renders the shell's phone layout (playground.mobile).
 */
import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
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
/** @type {string | null} */
let unbuilt = null;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-variant-held-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {{skip: (note?: string) => void}} ctx */
const needBases = ctx => {
  if (unbuilt) ctx.skip(unbuilt);
  return Boolean(unbuilt);
};

/** @param {string} theme */
const cssOf = theme =>
  fs.readFileSync(path.join(cwd, 'themes', theme, `${theme}.css`), 'utf8');

describe('a top nav link colored for a dark bar', () => {
  it("keeps Core's color in the phone menu, named, and one undo takes it back", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('bar', {cwd, like: 'neutral'});
    await themeEditSet('bar', 'mode', 'light-only', {cwd});
    await themeEditSet('bar', 'background-color', '#222222', {
      cwd,
      on: 'app-shell-header',
    });
    // (The selected link's own block, dark in the bar and the menu alike.)
    await themeEditSet('bar', 'background-color', '#000000', {
      cwd,
      on: 'top-nav-item',
      state: 'selected',
    });
    const r = await themeEditSet('bar', 'color', '#bfbfbf', {
      cwd,
      on: 'top-nav-item',
    });
    const css = cssOf('bar');
    // In the bar: the color set.
    expect(css).toMatch(/\.astryx-top-nav-item[^{]*\{[^}]*color: #bfbfbf/);
    // In the phone menu: Core's own color again.
    expect(css).toMatch(
      /\.astryx-top-nav-item[^{]*\[data-mode="drawer"\][^{]*\{[^}]*color: revert-layer/,
    );
    expect(r.data.notes.join('\n')).toMatch(
      /top-nav-item keeps Core's color where it is drawn as mode=drawer .*set bar color '#bfbfbf' --on top-nav-item --when 'mode:drawer'( --mode light)?`/,
    );
    expect(
      (r.data.newProblems ?? [])
        .map((/** @type {any} */ p) => p.problem)
        .join('\n'),
    ).not.toMatch(/mobile-nav's/);
    await themeEditUndo('bar', {cwd});
    expect(cssOf('bar')).not.toMatch(/#bfbfbf/);
  }, 240_000);

  it('lets the color reach the phone menu when the theme darkens the menu too', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('dk', {cwd, like: 'neutral'});
    await themeEditSet('dk', 'mode', 'light-only', {cwd});
    await themeEditSet('dk', 'background-color', '#222222', {
      cwd,
      on: 'app-shell-header',
    });
    await themeEditSet('dk', 'background-color', '#000000', {
      cwd,
      on: 'top-nav-item',
      state: 'selected',
    });
    // (Held while the menu is white...)
    await themeEditSet('dk', 'color', '#bfbfbf', {cwd, on: 'top-nav-item'});
    expect(cssOf('dk')).toMatch(
      /\.astryx-top-nav-item[^{]*\[data-mode="drawer"\][^{]*\{[^}]*color: revert-layer/,
    );
    // (...and reaching it once the theme darkens the menu as well.)
    const r = await themeEditSet(
      'dk',
      '--color-background-surface',
      '#222222',
      {cwd, on: 'mobile-nav'},
    );
    expect(cssOf('dk')).not.toMatch(
      /\.astryx-top-nav-item[^{]*\[data-mode="drawer"\][^{]*\{[^}]*color: revert-layer/,
    );
    expect(
      (r.data.newProblems ?? [])
        .map((/** @type {any} */ p) => p.problem)
        .join('\n'),
    ).not.toMatch(/top-nav-item/);
    // (A menu made white again holds the links again, at build.)
    await themeEditSet('dk', '--color-background-surface', '#ffffff', {
      cwd,
      on: 'mobile-nav',
    });
    expect(cssOf('dk')).toMatch(
      /\.astryx-top-nav-item[^{]*\[data-mode="drawer"\][^{]*\{[^}]*color: revert-layer/,
    );
  }, 240_000);

  it('keeps a drawer color the theme set there itself', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('own', {cwd, like: 'neutral'});
    await themeEditSet('own', 'mode', 'light-only', {cwd});
    await themeEditSet('own', 'background-color', '#222222', {
      cwd,
      on: 'app-shell-header',
    });
    await themeEditSet('own', 'color', '#333333', {
      cwd,
      on: 'top-nav-item',
      when: 'mode:drawer',
      only: true,
    });
    const r = /** @type {any} */ (
      await themeEditSet('own', 'color', '#bfbfbf', {cwd, on: 'top-nav-item'})
    );
    // (No hold is saved or named where the theme's own color wins.)
    expect(r.data.setting.hold).toBeUndefined();
    expect(JSON.stringify(r.data.notes)).not.toMatch(/mode:drawer/);
    // (Nor is the plain color measured in the phone menu, where the theme's
    // own color shows.)
    expect(
      (r.data.newProblems ?? []).filter((/** @type {any} */ x) =>
        /drawer/.test(String(x.problem)),
      ),
    ).toEqual([]);
    const drawer =
      cssOf('own').match(
        /\.astryx-top-nav-item[^{]*\[data-mode="drawer"\][^{]*\{[^}]*\}/g,
      ) ?? [];
    expect(drawer.join('\n')).toMatch(/#333333/);
    expect(drawer.join('\n')).not.toMatch(/revert-layer/);
  }, 240_000);

  it('holds the mode the theme leaves to Core where it colors the phone menu in one mode', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('own2', {cwd, like: 'neutral'});
    await themeEditSet('own2', 'background-color', '#222222', {
      cwd,
      on: 'app-shell-header',
    });
    await themeEditSet('own2', 'color', '#333333', {
      cwd,
      on: 'top-nav-item',
      when: 'mode:drawer',
      mode: 'dark',
      only: true,
    });
    const r = /** @type {any} */ (
      await themeEditSet('own2', 'color', '#bfbfbf', {cwd, on: 'top-nav-item'})
    );
    expect(r.data.setting.hold ?? []).toContain('mode:drawer');
    const drawer = (
      cssOf('own2').match(
        /\.astryx-top-nav-item[^{]*\[data-mode="drawer"\][^{]*\{[^}]*\}/g,
      ) ?? []
    ).join('\n');
    // (Core's color in light, the theme's own in dark.)
    expect(drawer).toMatch(/revert-layer/);
    expect(drawer).toMatch(/#333333/);
  }, 240_000);

  it('keeps the color in a state the theme paints a fill for, in the phone menu too', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('sel', {cwd, like: 'neutral'});
    await themeEditSet('sel', 'mode', 'light-only', {cwd});
    await themeEditSet('sel', 'background-color', '#222222', {
      cwd,
      on: 'app-shell-header',
    });
    await themeEditSet('sel', 'background-color', '#000000', {
      cwd,
      on: 'top-nav-item',
      state: 'selected',
      only: true,
    });
    const sr = /** @type {any} */ (
      await themeEditSet('sel', 'color', '#bfbfbf', {cwd, on: 'top-nav-item'})
    );
    // (Measured on the theme's black block: no problem named for it.)
    expect(JSON.stringify(sr.data.newProblems ?? [])).not.toMatch(/selected/);
    const rules = (cssOf('sel').match(/[^{}]+\{[^}]*\}/g) ?? []).filter(
      r => /top-nav-item/.test(r) && /drawer/.test(r),
    );
    // (The selected link keeps the light color on its black block.)
    expect(
      rules.some(r => /selected|aria-current/.test(r) && /#bfbfbf/.test(r)),
    ).toBe(true);
  }, 240_000);

  it("keeps the theme's own selected color in the phone menu", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('pown', {cwd, like: 'neutral'});
    await themeEditSet('pown', 'mode', 'light-only', {cwd});
    await themeEditSet('pown', 'background-color', '#222222', {
      cwd,
      on: 'app-shell-header',
    });
    await themeEditSet('pown', 'background-color', '#000000', {
      cwd,
      on: 'top-nav-item',
      state: 'selected',
      only: true,
    });
    await themeEditSet('pown', 'color', '#ffffff', {
      cwd,
      on: 'top-nav-item',
      state: 'selected',
      only: true,
    });
    await themeEditSet('pown', 'color', '#bfbfbf', {cwd, on: 'top-nav-item'});
    const rules = (cssOf('pown').match(/[^{}]+\{[^}]*\}/g) ?? []).filter(
      r =>
        /top-nav-item/.test(r) &&
        /drawer/.test(r) &&
        /selected|aria-current/.test(r),
    );
    expect(rules.some(r => /#ffffff|#fff\b/i.test(r))).toBe(true);
    expect(rules.some(r => /#bfbfbf/.test(r))).toBe(false);
  }, 240_000);

  it('keeps a one-mode selected fill to its mode in the phone menu', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('pdk', {cwd, like: 'neutral'});
    await themeEditSet('pdk', 'background-color', '#222222', {
      cwd,
      on: 'app-shell-header',
    });
    await themeEditSet('pdk', 'background-color', '#000000', {
      cwd,
      on: 'top-nav-item',
      state: 'selected',
      mode: 'dark',
      only: true,
    });
    const r = /** @type {any} */ (
      await themeEditSet('pdk', 'color', '#bfbfbf', {cwd, on: 'top-nav-item'})
    );
    // (The light phone menu keeps Core's readable selected color: no
    // problem is named there.)
    expect(JSON.stringify(r.data.newProblems ?? [])).not.toMatch(
      /drawer|phone menu/,
    );
  }, 240_000);

  it('writes the phone-menu state copy per mode, each with its own half', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('pmm', {cwd, like: 'neutral'});
    await themeEditSet('pmm', 'background-color', '#222222', {
      cwd,
      on: 'app-shell-header',
    });
    await themeEditSet(
      'pmm',
      'background-color',
      'light-dark(#000000, #ffffff)',
      {cwd, on: 'top-nav-item', state: 'selected', only: true},
    );
    await themeEditSet('pmm', 'color', '#ffffff', {
      cwd,
      on: 'top-nav-item',
      state: 'selected',
      mode: 'light',
      only: true,
    });
    await themeEditSet('pmm', 'color', '#000000', {
      cwd,
      on: 'top-nav-item',
      state: 'selected',
      mode: 'dark',
      only: true,
    });
    const r = /** @type {any} */ (
      await themeEditSet('pmm', 'color', '#bfbfbf', {cwd, on: 'top-nav-item'})
    );
    expect(JSON.stringify(r.data.newProblems ?? [])).not.toMatch(/1\.00:1/);
  }, 240_000);

  it("keeps Core's color on a light selected block the theme sets for the phone menu", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('plb', {cwd, like: 'neutral'});
    await themeEditSet('plb', 'mode', 'light-only', {cwd});
    await themeEditSet('plb', 'background-color', '#222222', {
      cwd,
      on: 'app-shell-header',
    });
    await themeEditSet('plb', 'background-color', '#f0f0f0', {
      cwd,
      on: 'top-nav-item',
      state: 'selected',
      when: 'mode:drawer',
    });
    await themeEditSet('plb', 'color', '#bfbfbf', {cwd, on: 'top-nav-item'});
    const rules = (cssOf('plb').match(/[^{}]+\{[^}]*\}/g) ?? []).filter(
      r =>
        /top-nav-item/.test(r) &&
        /drawer/.test(r) &&
        /selected|aria-current/.test(r),
    );
    expect(rules.some(r => /#bfbfbf/.test(r))).toBe(false);
  }, 240_000);

  it('measures the selected link on the fill the build paints in the phone menu, per mode', async ctx => {
    if (needBases(ctx)) return;
    /** The phone-menu selected rules of a theme. @param {string} slug */
    const drawerSelected = slug =>
      (cssOf(slug).match(/[^{}]+\{[^}]*\}/g) ?? []).filter(
        r =>
          /top-nav-item/.test(r) &&
          /drawer/.test(r) &&
          /selected|aria-current/.test(r),
      );
    // (A light block set for the phone menu after a black one at rest:
    // the light one is painted there, so the light link is not copied.)
    await themeEditNew('pord', {cwd, like: 'neutral'});
    await themeEditSet('pord', 'mode', 'light-only', {cwd});
    await themeEditSet('pord', 'background-color', '#222222', {
      cwd,
      on: 'app-shell-header',
    });
    await themeEditSet('pord', 'background-color', '#000000', {
      cwd,
      on: 'top-nav-item',
      state: 'selected',
      only: true,
    });
    await themeEditSet('pord', 'background-color', '#f0f0f0', {
      cwd,
      on: 'top-nav-item',
      state: 'selected',
      when: 'mode:drawer',
    });
    await themeEditSet('pord', 'color', '#bfbfbf', {cwd, on: 'top-nav-item'});
    expect(drawerSelected('pord').some(r => /#bfbfbf/.test(r))).toBe(false);
    // (A dark-only block in a theme with both modes: the copy takes dark's
    // half there, and light keeps Core's color.)
    await themeEditNew('pdm', {cwd, like: 'neutral'});
    await themeEditSet('pdm', 'background-color', '#222222', {
      cwd,
      on: 'app-shell-header',
    });
    await themeEditSet('pdm', 'background-color', '#ffffff', {
      cwd,
      on: 'top-nav-item',
      state: 'selected',
      mode: 'dark',
      only: true,
    });
    await themeEditSet('pdm', 'color', 'light-dark(#bfbfbf, #333333)', {
      cwd,
      on: 'top-nav-item',
    });
    // (Light keeps Core's selected color there, never the bar's light link.)
    expect(drawerSelected('pdm').some(r => /light-dark\(#bfbfbf/.test(r))).toBe(
      false,
    );
  }, 240_000);

  it('holds nothing for a text variant or a heading level', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('tx', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('tx', 'color', '#555555', {cwd, on: 'text'})
    );
    expect(r.data.setting.hold).toBeUndefined();
    expect(r.data.notes.join('\n')).not.toMatch(/phone menu/);
    const h = /** @type {any} */ (
      await themeEditSet('tx', 'color', '#bbbbbb', {cwd, on: 'heading'})
    );
    expect(h.data.setting.hold).toBeUndefined();
  }, 240_000);

  it('holds nothing where the color reads in the menu too', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('ok', {cwd, like: 'neutral'});
    await themeEditSet('ok', 'mode', 'light-only', {cwd});
    const r = await themeEditSet('ok', 'color', '#333333', {
      cwd,
      on: 'top-nav-item',
    });
    expect(r.data.notes.join('\n')).not.toMatch(/keeps Core's color/);
    expect(cssOf('ok')).not.toMatch(/\[data-mode="drawer"\][^{]*\{[^}]*color/);
  }, 240_000);
});
