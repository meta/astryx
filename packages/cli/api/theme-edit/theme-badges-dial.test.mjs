// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The badges dial sets every Badge variant together in the theme's
 * own status and category colors: solid, soft or outline. A badge is a
 * small box, so the corners dial reaches it as it reaches a button, unless
 * the corners are pill. Against a real bundled base theme.
 */

import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditHow,
  themeEditNew,
  themeEditSet,
  themeEditShow,
} from './theme-edit.mjs';
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

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-badges-dial-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, [
    'neutral',
    'chocolate',
    'gothic',
    'y2k',
  ]);
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

/**
 * The declarations of each badge rule in the built CSS, by its selector.
 * @param {string} slug
 * @returns {Array<{selector: string, body: string}>}
 */
const badgeRules = slug =>
  [
    ...fs
      .readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8')
      .matchAll(/([^{}]+)\{([^{}]*)\}/g),
  ]
    .filter(m => /\.astryx-badge\b/.test(m[1]))
    .map(m => ({selector: m[1].trim(), body: m[2]}));

/** @param {string} slug @param {string} variant */
const ruleFor = (slug, variant) =>
  badgeRules(slug)
    .filter(r => r.selector.includes(`"${variant}"`))
    .map(r => r.body)
    .join(';');

describe('the badges dial', () => {
  it('soft draws each status badge as a tint of its color', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('soft', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('soft', 'badges', 'soft', {cwd})
    );
    expect(r.data.newProblems).toEqual([]);
    expect(ruleFor('soft', 'success')).toMatch(
      /background-color:\s*var\(--color-success-muted\)/,
    );
    expect(ruleFor('soft', 'success')).toMatch(
      /(^|;)\s*color:\s*var\(--color-on-success-muted\)/,
    );
  }, 240_000);

  it('outline draws every badge as a line in its text color', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('line', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('line', 'badges', 'outline', {cwd})
    );
    expect(r.data.newProblems).toEqual([]);
    for (const v of ['error', 'blue']) {
      const body = ruleFor('line', v);
      expect(body).toMatch(/background-color:\s*transparent/);
      expect(body).toMatch(/border-color:\s*currentColor/);
      expect(body).toMatch(
        new RegExp(`(^|;)\\s*color:\\s*var\\(--color-text-${v}\\)`),
      );
    }
  }, 240_000);

  it('solid fills each badge with its color, its text in the page color or the status text color', async ctx => {
    if (needBases(ctx)) return;
    // Chocolate's category tints are see-through: a tint is never the text.
    await themeEditNew('fill', {cwd, like: 'chocolate'});
    const r = /** @type {any} */ (
      await themeEditSet('fill', 'badges', 'solid', {cwd})
    );
    expect(r.data.newProblems).toEqual([]);
    expect(ruleFor('fill', 'teal')).toMatch(
      /background-color:\s*var\(--color-text-teal\)/,
    );
    expect(ruleFor('fill', 'teal')).toMatch(
      /(^|;)\s*color:\s*var\(--color-background-body\)/,
    );
    expect(ruleFor('fill', 'info')).toMatch(
      /background-color:\s*var\(--color-info\)/,
    );
    expect(ruleFor('fill', 'info')).toMatch(/color:\s*var\(--color-on-info\)/);
  }, 240_000);

  it("leaves the neutral badge as Core draws it, which takes a button's colors inside a button", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('plain', {cwd, like: 'neutral'});
    const before = ruleFor('plain', 'neutral');
    for (const style of ['solid', 'soft', 'outline']) {
      await themeEditSet('plain', 'badges', style, {cwd});
      expect(ruleFor('plain', 'neutral'), style).toBe(before);
    }
  }, 240_000);

  it('picks colors that read on a base whose hue text is dark in both modes', async ctx => {
    if (needBases(ctx)) return;
    // Gothic draws its hue text dark: on its page in dark mode, or as a fill
    // under the page color, that text would not read.
    await themeEditNew('dusk', {cwd, like: 'gothic'});
    for (const style of ['solid', 'outline']) {
      const r = /** @type {any} */ (
        await themeEditSet('dusk', 'badges', style, {cwd})
      );
      expect(JSON.stringify(r.data.newProblems ?? []), style).not.toMatch(
        /text in badge/,
      );
    }
  }, 240_000);

  it('keeps a fill the theme sets on the badge itself', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('ownfill', {cwd, like: 'neutral'});
    await themeEditSet('ownfill', 'background-color', '#222222', {
      cwd,
      on: 'badge',
    });
    await themeEditSet('ownfill', 'badges', 'solid', {cwd});
    expect(ruleFor('ownfill', 'teal')).not.toMatch(
      /background-color:\s*var\(--color-text-teal\)/,
    );
    expect(ruleFor('ownfill', 'teal')).toMatch(/background-color:\s*#222222/);
  }, 240_000);

  it('checks the colors that win on each badge, and a fix for one leaves the others checked', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('dark', {cwd, like: 'neutral'});
    await themeEditSet('dark', 'background-color', '#111111', {
      cwd,
      on: 'badge',
    });
    const r = /** @type {any} */ (
      await themeEditSet('dark', 'badges', 'outline', {cwd})
    );
    /** @param {any[]} list */
    const badgeLines = list =>
      list
        .map((/** @type {any} */ p) => `${p.problem ?? p.text} ${p.fix ?? ''}`)
        .filter((/** @type {string} */ p) => /text in badge/.test(p));
    const first = badgeLines(r.data.newProblems ?? []);
    expect(first.length).toBeGreaterThan(1);
    const variant = /--when variant:([a-z]+)/.exec(first[0])?.[1];
    const color = /color '([^']+)'/.exec(first[0])?.[1];
    const mode = /--mode (light|dark)/.exec(first[0])?.[1];
    const after = /** @type {any} */ (
      await themeEditSet('dark', 'color', String(color), {
        cwd,
        on: 'badge',
        when: `variant:${variant}`,
        ...(mode ? {mode} : {}),
      })
    );
    expect(after.data.setting).toBeTruthy();
    // The other badges that do not read are still named.
    const shown = JSON.stringify(
      /** @type {any} */ (await themeEditShow('dark', {cwd})).data,
    );
    const named = [...shown.matchAll(/variant ([a-z]+), badges outline/g)].map(
      m => m[1],
    );
    expect(named.length).toBeGreaterThan(0);
    expect(named).not.toContain(variant);
  }, 240_000);

  it('is whole-theme: --on is refused', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('scoped', {cwd, like: 'neutral'});
    await expect(
      themeEditSet('scoped', 'badges', 'soft', {cwd, on: 'card'}),
    ).rejects.toThrow(/drop --on/);
  }, 240_000);

  it('how answers a badge style with the dial', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('asked', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditHow('outlined badges', {cwd, theme: 'asked'})
    );
    expect(JSON.stringify(r.data)).toMatch(/set asked badges outline/);
    // An ask that says more than the style is answered for what it says.
    for (const ask of [
      'soft shadows on badges',
      'solid borders on tags',
      'filled pill badges',
      'soft pink badges',
      'solid status badges',
    ]) {
      const more = /** @type {any} */ (
        await themeEditHow(ask, {cwd, theme: 'asked'})
      );
      expect(JSON.stringify(more.data), ask).not.toMatch(/set asked badges /);
    }
  }, 240_000);

  it('corners reach badges as small boxes, and pill corners leave them pills', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('box', {cwd, like: 'neutral'});
    await themeEditSet('box', 'corners', '4px', {cwd});
    expect(
      badgeRules('box')
        .map(r => r.body)
        .join(';'),
    ).toMatch(/border-radius:\s*var\(--radius-element\)/);
    await themeEditSet('box', 'corners', 'pill', {cwd});
    expect(
      badgeRules('box')
        .map(r => r.body)
        .join(';'),
    ).not.toMatch(/border-radius:\s*var\(--radius-element\)/);
  }, 240_000);

  it('a container radius alone leaves badges round, as it leaves buttons', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('panels', {cwd, like: 'neutral'});
    await themeEditSet('panels', '--radius-container', '16px', {cwd});
    const shown = /** @type {any} */ (await themeEditShow('panels', {cwd}));
    expect(
      shown.data.missed.filter((/** @type {any} */ m) => m.part === 'badge'),
    ).toEqual([]);
  }, 240_000);

  it("a badge style said beside another part's style takes the word next to the badges", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('pair', {cwd, like: 'neutral'});
    for (const ask of [
      'solid buttons and soft badges',
      'solid cards and soft badges',
      'outline buttons and soft badges',
    ]) {
      const r = /** @type {any} */ (
        await themeEditHow(ask, {cwd, theme: 'pair'})
      );
      const text = JSON.stringify(r.data);
      expect(text, ask).toMatch(/set pair badges soft/);
      expect(text, ask).not.toMatch(/set pair badges (solid|outline)/);
    }
  }, 240_000);

  it('a badge the base theme rounds itself keeps its shape under rounder corners', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('pop', {cwd, like: 'y2k'});
    await themeEditSet('pop', 'corners', 'large', {cwd});
    expect(
      badgeRules('pop')
        .map(r => r.body)
        .join(';'),
    ).not.toMatch(/border-radius:\s*var\(--radius-element\)/);
  }, 240_000);

  it('pill corners with square element corners still list the round badge', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('sq', {cwd, like: 'neutral'});
    await themeEditSet('sq', 'corners', 'pill', {cwd});
    await themeEditSet('sq', '--radius-element', '0px', {cwd});
    const shown = /** @type {any} */ (await themeEditShow('sq', {cwd}));
    expect(
      shown.data.missed.some((/** @type {any} */ m) => m.part === 'badge'),
    ).toBe(true);
  }, 240_000);

  it('leaves out every property the theme sets on the badge itself', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('owntext', {cwd, like: 'neutral'});
    await themeEditSet('owntext', 'background-color', '#ffffff', {
      cwd,
      on: 'badge',
    });
    await themeEditSet('owntext', 'color', '#1a1a1a', {cwd, on: 'badge'});
    await themeEditSet('owntext', 'border-color', '#1a1a1a', {
      cwd,
      on: 'badge',
    });
    await themeEditSet('owntext', 'color', '#2b2b2b', {
      cwd,
      on: 'badge',
      when: 'variant:blue',
    });
    const r = /** @type {any} */ (
      await themeEditSet('owntext', 'badges', 'outline', {cwd})
    );
    for (const v of ['error', 'teal']) {
      const body = ruleFor('owntext', v);
      expect(body, v).not.toMatch(/(^|;)\s*color:\s*var\(--color-text-/);
      // (A border color brings its own border to the badge: the style's
      // line is the theme's there.)
      expect(body, v).not.toMatch(/border-(style|width):\s*(solid|1px)/);
      expect(body, v).not.toMatch(/border-color:\s*currentColor/);
      expect(body, v).not.toMatch(/background-color:\s*transparent/);
    }
    expect(ruleFor('owntext', 'blue')).toMatch(/(^|;)\s*color:\s*#2b2b2b/);
    // The colors checked are the colors drawn: the theme's own text.
    expect(JSON.stringify(r.data.newProblems ?? [])).not.toMatch(
      /text in badge/,
    );
  }, 240_000);

  it("keeps the style's fill in the mode a one-mode fill leaves", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('nightfill', {cwd, like: 'neutral'});
    await themeEditSet('nightfill', 'background-color', '#222222', {
      cwd,
      on: 'badge',
      mode: 'dark',
    });
    await themeEditSet('nightfill', 'badges', 'solid', {cwd});
    const saved = fs.readFileSync(
      path.join(cwd, 'themes', 'nightfill', 'nightfill.settings.ts'),
      'utf8',
    );
    const at = saved.indexOf('"variant:teal"');
    const teal = saved.slice(at, saved.indexOf('"variant:', at + 1));
    // The style's fill is written for light only; dark keeps the theme's.
    expect(teal).toMatch(
      /"@light":\s*\{[^}]*"backgroundColor": "var\(--color-text-teal\)"/,
    );
    expect(teal).toMatch(/"@dark":\s*\{[^}]*"backgroundColor": "#222222"/);
    expect(teal.match(/var\(--color-text-teal\)/g)?.length).toBe(1);
  }, 240_000);

  it('names the badges that take a fallback because their own colors do not read', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('night', {cwd, like: 'gothic'});
    const r = /** @type {any} */ (
      await themeEditSet('night', 'badges', 'outline', {cwd})
    );
    const note = JSON.stringify(r.data).match(
      /the ([a-z, ]+) badges draw the primary text inside a line of their color/,
    );
    expect(note).toBeTruthy();
    for (const v of String(note?.[1]).split(', '))
      expect(ruleFor('night', v), v).toMatch(
        /(^|;)\s*color:\s*var\(--color-text-primary\)/,
      );
  }, 240_000);

  it("a badge without a solid fill takes a filled button's public colors inside it, never Button's own variables", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('inbtn', {cwd, like: 'neutral'});
    await themeEditSet('inbtn', 'badges', 'outline', {cwd});
    const css = fs.readFileSync(
      path.join(cwd, 'themes', 'inbtn', 'inbtn.css'),
      'utf8',
    );
    expect(css).not.toMatch(/--_button-/);
    const inside = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m =>
      /\.astryx-badge\[data-variant="info"\]:is\(\.astryx-button\[data-variant="primary"\] \*\)/.test(
        m[1],
      ),
    );
    expect(inside.map(m => m[2]).join(';')).toMatch(
      /color:\s*var\(--color-accent\)/,
    );
    await themeEditSet('inbtn', 'badges', 'solid', {cwd});
    expect(
      fs.readFileSync(path.join(cwd, 'themes', 'inbtn', 'inbtn.css'), 'utf8'),
    ).not.toMatch(/astryx-button\[data-variant="primary"\] \*/);
  }, 240_000);

  it("a fix line for a solid badge that does not read changes that badge's text", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('fixsolid', {cwd, like: 'neutral'});
    await themeEditSet('fixsolid', 'color', '#777777', {
      cwd,
      on: 'badge',
    });
    await themeEditSet('fixsolid', 'background-color', '#808080', {
      cwd,
      on: 'badge',
    });
    const r = /** @type {any} */ (
      await themeEditSet('fixsolid', 'badges', 'solid', {cwd})
    );
    const fix = (r.data.newProblems ?? [])
      .map((/** @type {any} */ p) => String(p.fix ?? ''))
      .find((/** @type {string} */ f) => / --on badge --when variant:/.test(f));
    expect(fix).toBeTruthy();
    expect(fix).toMatch(
      / set fixsolid color '#[0-9a-f]{6}' --on badge --when variant:[a-z]+/,
    );
  }, 240_000);

  it('a badge the corners dial already squares is not listed as a pill', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('sqd', {cwd, like: 'neutral'});
    await themeEditSet('sqd', 'corners', 'small', {cwd});
    await themeEditSet('sqd', '--radius-element', '0px', {cwd});
    const shown = /** @type {any} */ (await themeEditShow('sqd', {cwd}));
    expect(
      shown.data.missed.some((/** @type {any} */ m) => m.part === 'badge'),
    ).toBe(false);
  }, 240_000);

  it("solid badges on the theme's own fill are checked on the text the style writes", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('ownbg', {cwd, like: 'neutral'});
    await themeEditSet('ownbg', 'background-color', '#222222', {
      cwd,
      on: 'badge',
    });
    const r = /** @type {any} */ (
      await themeEditSet('ownbg', 'badges', 'solid', {cwd})
    );
    const lines = (r.data.newProblems ?? [])
      .map((/** @type {any} */ p) => String(p.problem ?? p.text ?? ''))
      .filter((/** @type {string} */ t) =>
        /text in badge \(variant teal/.test(t),
      );
    expect(lines.filter(l => !/badges solid/.test(l))).toEqual([]);
  }, 240_000);

  it('a one-mode fill on the badge keeps the in-button colors in the other mode', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('onebtn', {cwd, like: 'neutral'});
    await themeEditSet('onebtn', 'background-color', '#222222', {
      cwd,
      on: 'badge',
      mode: 'dark',
    });
    await themeEditSet('onebtn', 'badges', 'outline', {cwd});
    const src = fs.readFileSync(
      path.join(cwd, 'themes', 'onebtn', 'onebtn.settings.ts'),
      'utf8',
    );
    const at = src.indexOf('"variant:info"');
    const info = src.slice(at, src.indexOf('"variant:', at + 1));
    expect(info).toMatch(
      /"@light":\s*\{[\s\S]*astryx-button\[data-variant=\\"primary\\"\][\s\S]*"backgroundColor": "var\(--color-on-accent\)"/,
    );
  }, 240_000);

  it('under soft the category badges Core draws are still checked, and so is a variant the theme colors itself', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('softcat', {cwd, like: 'neutral'});
    await themeEditSet('softcat', 'color', '#eeeeee', {
      cwd,
      on: 'badge',
      when: 'variant:blue',
    });
    await themeEditSet('softcat', 'color', '#eeeeee', {
      cwd,
      on: 'badge',
      when: 'variant:info',
    });
    const r = /** @type {any} */ (
      await themeEditSet('softcat', 'badges', 'soft', {cwd})
    );
    const text = JSON.stringify(r.data.problems ?? r.data);
    expect(text).toMatch(/badge \(variant blue/);
    expect(text).toMatch(/badge \(variant info/);
  }, 240_000);

  it("measures a variant's own text on the fill the style draws, and a variant's own setting over the badge's", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('vt', {cwd, like: 'neutral'});
    await themeEditSet('vt', 'color', '#ffffff', {
      cwd,
      on: 'badge',
      when: 'variant:blue',
    });
    const r = /** @type {any} */ (
      await themeEditSet('vt', 'badges', 'solid', {cwd})
    );
    const blue = (/** @type {any} */ data) =>
      (data.newProblems ?? data.problems ?? [])
        .map((/** @type {any} */ p) => String(p.problem ?? p.text ?? ''))
        .filter((/** @type {string} */ t) => /badge \(variant blue/.test(t));
    // White on the solid blue fill reads in light; the light line is not
    // given, and its fix is never the dark grey Core's tint would need.
    expect(blue(r.data).filter(l => / in light/.test(l))).toEqual([]);
    // A plain badge color set after does not beat the variant's own.
    const after = /** @type {any} */ (
      await themeEditSet('vt', 'color', '#111111', {cwd, on: 'badge'})
    );
    expect(blue(after.data).filter(l => / in light/.test(l))).toEqual([]);
    // And the same for the fill.
    await themeEditSet('vt', 'background-color', '#003978', {
      cwd,
      on: 'badge',
      when: 'variant:teal',
    });
    const fill = /** @type {any} */ (
      await themeEditSet('vt', 'background-color', '#ffffff', {
        cwd,
        on: 'badge',
      })
    );
    const teal = (fill.data.newProblems ?? [])
      .map((/** @type {any} */ p) => String(p.problem ?? p.text ?? ''))
      .filter(
        (/** @type {string} */ t) =>
          /badge \(variant teal/.test(t) && / in light/.test(t),
      );
    expect(teal).toEqual([]);
  }, 240_000);

  it('a pill badge is listed when the element corners change after corners pill', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('pillthen', {cwd, like: 'neutral'});
    await themeEditSet('pillthen', 'corners', 'pill', {cwd});
    const atPill = JSON.stringify(
      /** @type {any} */ (await themeEditShow('pillthen', {cwd})).data.missed ??
        [],
    );
    expect(atPill).not.toMatch(/"part":"badge"/);
    await themeEditSet('pillthen', '--radius-element', '6px', {cwd});
    const shown = JSON.stringify(
      /** @type {any} */ (await themeEditShow('pillthen', {cwd})).data.missed ??
        [],
    );
    expect(shown).toMatch(/badge[^\]]*still a full pill/);
  }, 240_000);

  it("a one-mode badge color or fill beats a variant's own in the check, as it does in the build", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('onemode', {cwd, like: 'neutral'});
    await themeEditSet('onemode', 'color', '#ffffff', {
      cwd,
      on: 'badge',
      when: 'variant:blue',
    });
    await themeEditSet('onemode', 'badges', 'solid', {cwd});
    const r = /** @type {any} */ (
      await themeEditSet('onemode', 'color', '#111111', {
        cwd,
        on: 'badge',
        mode: 'light',
      })
    );
    expect(JSON.stringify(r.data.problems ?? [])).toMatch(
      /variant blue, badges solid\) is [\d.]+:1 in light/,
    );
    await themeEditNew('onefill', {cwd, like: 'neutral'});
    await themeEditSet('onefill', 'badges', 'solid', {cwd});
    await themeEditSet('onefill', 'background-color', '#003978', {
      cwd,
      on: 'badge',
      when: 'variant:teal',
    });
    const f = /** @type {any} */ (
      await themeEditSet('onefill', 'background-color', '#ffffff', {
        cwd,
        on: 'badge',
        mode: 'light',
      })
    );
    expect(JSON.stringify(f.data.problems ?? [])).toMatch(
      /variant teal, badges solid\) is [\d.]+:1 in light/,
    );
  }, 240_000);

  it('of two one-mode badge settings, the later one is checked, as the build draws it', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('twomode', {cwd, like: 'neutral'});
    await themeEditSet('twomode', 'badges', 'solid', {cwd});
    await themeEditSet('twomode', 'color', '#ffffff', {
      cwd,
      on: 'badge',
      when: 'variant:blue',
      mode: 'light',
    });
    const r = /** @type {any} */ (
      await themeEditSet('twomode', 'color', '#111111', {
        cwd,
        on: 'badge',
        mode: 'light',
      })
    );
    expect(JSON.stringify(r.data.problems ?? [])).toMatch(
      /variant blue, badges solid\) is [\d.]+:1 in light/,
    );
    await themeEditNew('twofill', {cwd, like: 'neutral'});
    await themeEditSet('twofill', 'badges', 'solid', {cwd});
    await themeEditSet('twofill', 'background-color', '#003978', {
      cwd,
      on: 'badge',
      when: 'variant:teal',
      mode: 'light',
    });
    const f = /** @type {any} */ (
      await themeEditSet('twofill', 'background-color', '#ffffff', {
        cwd,
        on: 'badge',
        mode: 'light',
      })
    );
    expect(JSON.stringify(f.data.problems ?? [])).toMatch(
      /variant teal, badges solid\) is [\d.]+:1 in light/,
    );
  }, 240_000);

  it('a see-through badge inside a secondary button draws on the page color', async ctx => {
    if (needBases(ctx)) return;
    for (const style of ['outline', 'soft']) {
      const slug = `sec${style}`;
      await themeEditNew(slug, {cwd, like: 'neutral'});
      await themeEditSet(slug, 'badges', style, {cwd});
      const css = fs.readFileSync(
        path.join(cwd, 'themes', slug, `${slug}.css`),
        'utf8',
      );
      const rule = new RegExp(
        String.raw`\.astryx-badge\[data-variant="success"\][^{}]*\.astryx-button\[data-variant="secondary"\][^{}]*\{([^{}]*)\}`,
      ).exec(css)?.[1];
      expect(rule, style).toBeTruthy();
      expect(rule, style).toMatch(
        /background-color:\s*var\(--color-background-body\)/,
      );
      if (style === 'soft')
        expect(rule, style).toMatch(/background-image:\s*linear-gradient\(/);
    }
  }, 240_000);
});
