// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Padding, modes and colors against real bundled base themes (parts43): a
 * one-mode background on parts whose variants each have their own color, a
 * whole-part hover on a base whose variants have their own hover, a
 * longhand after a shorthand the base holds, nested cards, the spacing dial
 * around kept sizes, and the notes and runs that go with them.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {controlSizes, sizePx} from './_settings.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-parts43-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['butter', 'neutral']);
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

/** @param {string} slug @param {string} mine one components entry */
const ownSource = (slug, mine) => {
  const ts = path.join(cwd, `themes/${slug}/${slug}.theme.ts`);
  const src = fs.readFileSync(ts, 'utf8');
  const own = src.replace(/ {2}name: '[^']+',/, m => `${m}\n  ${mine}`);
  expect(own).not.toBe(src);
  fs.writeFileSync(ts, own);
};

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

describe('one-mode backgrounds on parts whose variants have their own', () => {
  /** @param {string} slug @param {string} sel */
  const bgOf = (slug, sel) =>
    /background-color: ([^;]+);/.exec(ruleOf(slug, sel))?.[1];
  /** Every hover rule of the button and badge, as written. @param {string} slug */
  const hoverRules = slug =>
    (
      cssOf(slug).match(/\.astryx-(button|badge)[^{]*:hover[^{]*\{[^}]*\}/g) ??
      []
    ).join('\n');

  it('keeps every variant exactly as it was in dark for a light-only background, and leaves hover as it was (neutral)', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('m5n', {cwd, like: 'neutral'});
    await themeEditSet('m5n', 'background', '#eeeeee', {
      cwd,
      on: 'button',
      mode: 'light',
    });
    // The base theme's own value (destructive), Core's (primary), and a
    // variant Core paints nothing on (ghost) stays transparent.
    expect(bgOf('m5n', '.astryx-button[data-variant="destructive"]')).toBe(
      'light-dark(#eeeeee, var(--color-error-muted))',
    );
    expect(bgOf('m5n', '.astryx-button[data-variant="primary"]')).toBe(
      'light-dark(#eeeeee, var(--color-accent))',
    );
    expect(bgOf('m5n', '.astryx-button[data-variant="ghost"]')).toBe(
      'light-dark(#eeeeee, transparent)',
    );
    // The part's own rule carries no variant's color.
    expect(ruleOf('m5n', '.astryx-button')).not.toMatch(/#eeeeee/);
    // No hover rule takes the resting color.
    expect(hoverRules('m5n')).not.toMatch(/#eeeeee/);
  }, 240_000);

  it('takes the base dark half of a light-dark() and keeps the base hover (butter)', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('m5b', {cwd, like: 'butter'});
    await themeEditSet('m5b', 'background', '#eeeeee', {
      cwd,
      on: 'button',
      mode: 'light',
    });
    expect(bgOf('m5b', '.astryx-button[data-variant="destructive"]')).toBe(
      'light-dark(#eeeeee, #ffb09b)',
    );
    expect(bgOf('m5b', '.astryx-button[data-variant="secondary"]')).toBe(
      'light-dark(#eeeeee, transparent)',
    );
    // Butter's own secondary hover still shows, in both modes.
    expect(
      bgOf(
        'm5b',
        '.astryx-button[data-variant="secondary"]:hover:where(:not(:disabled,[aria-disabled="true"]))',
      ),
    ).toBe('light-dark(#225bff14, #fdee8c14)');
    // A hover setting for one mode does the same in the hover rule.
    await themeEditSet('m5b', 'background', '#dddddd', {
      cwd,
      on: 'button',
      state: 'hover',
      mode: 'light',
    });
    expect(
      bgOf(
        'm5b',
        '.astryx-button[data-variant="secondary"]:hover:where(:not(:disabled,[aria-disabled="true"]))',
      ),
    ).toBe('light-dark(#dddddd, #fdee8c14)');
  }, 240_000);

  for (const [first, second] of [
    ['light', 'dark'],
    ['dark', 'light'],
  ])
    it(`keeps a ${first}-mode background when a ${second}-mode one follows, on every variant`, async ctx => {
      if (needBases(ctx)) return;
      const slug = `m5${first[0]}${second[0]}`;
      await themeEditNew(slug, {cwd, like: 'neutral'});
      const color = {light: '#eeeeee', dark: '#222222'};
      for (const mode of [first, second])
        await themeEditSet(slug, 'background', color[mode], {
          cwd,
          on: 'button',
          mode,
        });
      for (const name of ['primary', 'secondary', 'ghost', 'destructive'])
        expect(bgOf(slug, `.astryx-button[data-variant="${name}"]`)).toBe(
          'light-dark(#eeeeee, #222222)',
        );
    }, 240_000);

  it("keeps a variant's own background as the other half of a later one-mode background", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('m5v', {cwd, like: 'neutral'});
    await themeEditSet('m5v', 'background', '#ff0000', {
      cwd,
      on: 'button',
      when: 'variant:primary',
    });
    await themeEditSet('m5v', 'background', '#eeeeee', {
      cwd,
      on: 'button',
      mode: 'light',
    });
    const rule = ruleOf('m5v', '.astryx-button[data-variant="primary"]');
    expect(rule).toMatch(/background-color: light-dark\(#eeeeee, #ff0000\)/);
    expect(rule).not.toMatch(/background:/);
  }, 240_000);

  it("keeps the part's earlier color for both modes as each variant's other half", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('m5p', {cwd, like: 'neutral'});
    await themeEditSet('m5p', 'background', '#123456', {cwd, on: 'button'});
    await themeEditSet('m5p', 'background', '#eeeeee', {
      cwd,
      on: 'button',
      mode: 'light',
    });
    for (const name of ['primary', 'secondary', 'ghost', 'destructive'])
      expect(
        ruleOf('m5p', `.astryx-button[data-variant="${name}"]`),
        name,
      ).toMatch(/background-color: light-dark\(#eeeeee, #123456\)/);
  }, 240_000);

  for (const [like, names] of /** @type {Array<[string, string[]]>} */ ([
    ['neutral', ['destructive', 'primary']],
    ['butter', ['secondary', 'destructive', 'primary']],
  ]))
    it(`puts no plain background after a variant's one-mode color (${like})`, async ctx => {
      if (needBases(ctx)) return;
      const slug = `m5l${like[0]}`;
      await themeEditNew(slug, {cwd, like});
      await themeEditSet(slug, 'background', '#123456', {cwd, on: 'button'});
      await themeEditSet(slug, 'background', '#eeeeee', {
        cwd,
        on: 'button',
        mode: 'light',
      });
      for (const name of names) {
        const rule = ruleOf(slug, `.astryx-button[data-variant="${name}"]`);
        const at = rule.indexOf(
          'background-color: light-dark(#eeeeee, #123456)',
        );
        expect(at, name).toBeGreaterThan(-1);
        expect(rule.slice(at), name).not.toMatch(/background:/);
      }
    }, 240_000);

  it("keeps a whole-part border's width and style on a variant that sets only its color (butter)", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('b5', {cwd, like: 'butter'});
    await themeEditSet('b5', 'border', '3px dashed #ff0000', {
      cwd,
      on: 'button',
    });
    await themeEditSet('b5', 'border-color', '#0000ff', {
      cwd,
      on: 'button',
      when: 'variant:secondary',
    });
    const rule = ruleOf('b5', '.astryx-button[data-variant="secondary"]');
    const at = rule.indexOf('border: 3px dashed #ff0000');
    expect(at).toBeGreaterThan(-1);
    const after = rule.slice(at);
    expect(after).toMatch(/border-top-color: #0000ff/);
    expect(after).toMatch(/border-left-color: #0000ff/);
    expect(after).not.toMatch(/border-(width|style):/);
  }, 240_000);

  for (const [
    like,
    plain,
    plainValue,
    name,
    prop,
    value,
    wholeAfter,
  ] of /** @type {Array<[string, string, string, string, string, string, string]>} */ ([
    [
      'butter',
      'border-width',
      '2px',
      'secondary',
      'border-bottom-width',
      '12px',
      'border-width: 2px',
    ],
    [
      'butter',
      'border-color',
      '#ff0000',
      'secondary',
      'border-bottom-color',
      '#ff000080',
      'border-color: #ff0000',
    ],
    [
      'butter',
      'border-style',
      'dashed',
      'secondary',
      'border-bottom-style',
      'dashed',
      'border-style: dashed',
    ],
    [
      'butter',
      'background',
      '#123456',
      'secondary',
      'background-color',
      '#00ff00',
      '',
    ],
    [
      'neutral',
      'background',
      '#123456',
      'destructive',
      'background-color',
      '#00ff00',
      '',
    ],
    [
      'neutral',
      'border-width',
      '2px',
      'destructive',
      'border-bottom-width',
      '12px',
      'border-width: 2px',
    ],
  ]))
    it(`writes a variant's later ${prop} after the part's ${plain} (${like})`, async ctx => {
      if (needBases(ctx)) return;
      const slug =
        `o6${like[0]}${plain.replace(/\W/g, '')}${prop.replace(/\W/g, '')}`.slice(
          0,
          40,
        );
      await themeEditNew(slug, {cwd, like});
      await themeEditSet(slug, plain, plainValue, {cwd, on: 'button'});
      await themeEditSet(slug, prop, value, {
        cwd,
        on: 'button',
        when: `variant:${name}`,
      });
      const rule = ruleOf(slug, `.astryx-button[data-variant="${name}"]`);
      const own = rule.lastIndexOf(`${prop}: ${value}`);
      expect(own, rule).toBeGreaterThan(-1);
      // No shorthand covering it comes after the variant's own value.
      const short = plain === 'background' ? 'background:' : `${plain}:`;
      expect(rule.slice(own), rule).not.toContain(short);
      // The part's value still reaches the variant's other sides.
      if (wholeAfter) expect(rule, rule).toContain(wholeAfter);
    }, 240_000);

  it("says once that a variant keeps its own gradient, and that a part's own gradient covers the color", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('m5n1', {cwd, like: 'neutral'});
    await themeEditSet(
      'm5n1',
      'background',
      'linear-gradient(#ff0000, #0000ff)',
      {cwd, on: 'button', when: 'variant:primary'},
    );
    await themeEditSet('m5n1', 'background', '#eeeeee', {
      cwd,
      on: 'button',
      mode: 'light',
    });
    const later = await themeEditSet('m5n1', 'padding', '9px', {
      cwd,
      on: 'card',
    });
    expect(later.data.notes.join(' ')).not.toMatch(/background image/);
    await themeEditNew('m5n2', {cwd, like: 'neutral'});
    await themeEditSet(
      'm5n2',
      'background',
      'linear-gradient(#ff0000, #0000ff)',
      {cwd, on: 'button'},
    );
    const r = await themeEditSet('m5n2', 'background', '#eeeeee', {
      cwd,
      on: 'button',
      mode: 'light',
    });
    expect(r.data.notes.join(' ')).toMatch(
      /button's own background is an image .* which covers the light color/,
    );
  }, 240_000);

  it("leaves a variant's own gradient as it is, and says so", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('m5g', {cwd, like: 'neutral'});
    await themeEditSet(
      'm5g',
      'background',
      'linear-gradient(#ff0000, #0000ff)',
      {cwd, on: 'button', when: 'variant:primary'},
    );
    const r = await themeEditSet('m5g', 'background', '#eeeeee', {
      cwd,
      on: 'button',
      mode: 'light',
    });
    const primary = ruleOf('m5g', '.astryx-button[data-variant="primary"]');
    expect(primary).toMatch(/linear-gradient\(#ff0000, #0000ff\)/);
    expect(primary).not.toMatch(/#eeeeee/);
    expect(ruleOf('m5g', '.astryx-button[data-variant="destructive"]')).toMatch(
      /light-dark\(#eeeeee, /,
    );
    expect(r.data.notes.join(' ')).toMatch(
      /button variant:primary keeps its own background image/,
    );
  }, 240_000);

  it('does the same in a light-only theme, with no --mode', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('m5o', {cwd, like: 'neutral'});
    await themeEditSet('m5o', 'mode', 'light-only', {cwd});
    await themeEditSet('m5o', 'background', '#eeeeee', {cwd, on: 'button'});
    expect(bgOf('m5o', '.astryx-button[data-variant="destructive"]')).toBe(
      'light-dark(#eeeeee, var(--color-error-muted))',
    );
    expect(ruleOf('m5o', '.astryx-button')).not.toMatch(/#eeeeee/);
    // A badge's text: each variant keeps its own dark text.
    await themeEditSet('m5o', 'color', '#222222', {cwd, on: 'badge'});
    expect(
      /[\s;{]color: ([^;]+);/.exec(
        ruleOf('m5o', '.astryx-badge[data-variant="red"]'),
      )?.[1],
    ).toBe('light-dark(#222222, var(--color-text-red))');
  }, 240_000);
});

describe('a whole-button hover on butter', () => {
  it('reaches every variant, the ones with their own hover or resting color included', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('h6', {cwd, like: 'butter'});
    await themeEditSet('h6', 'background', '#ee0000', {
      cwd,
      on: 'button',
      state: 'hover',
    });
    for (const v of ['secondary', 'destructive'])
      expect(
        ruleOf(
          'h6',
          `.astryx-button[data-variant="${v}"]:hover:where(:not(:disabled,[aria-disabled="true"]))`,
        ),
      ).toMatch(/background: #ee0000/);
  }, 240_000);
});

describe('a longhand after a shorthand the base holds', () => {
  it('wins on butter: padding-inline after padding, border-color after border', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('l10', {cwd, like: 'butter'});
    await themeEditSet('l10', 'padding', '4px 6px', {cwd, on: 'button'});
    await themeEditSet('l10', 'padding-inline', '2px', {cwd, on: 'button'});
    const button = ruleOf('l10', '.astryx-button');
    const at = (/** @type {string} */ x) => button.indexOf(x);
    expect(at('padding: 4px 6px')).toBeGreaterThan(-1);
    expect(at('padding-inline-start: 2px')).toBeGreaterThan(
      at('padding: 4px 6px'),
    );
    expect(at('padding-inline-end: 2px')).toBeGreaterThan(
      at('padding: 4px 6px'),
    );
    await themeEditSet('l10', 'border', '2px solid #ff0000', {
      cwd,
      on: 'button',
      when: 'variant:secondary',
    });
    await themeEditSet('l10', 'border-color', '#00aa00', {
      cwd,
      on: 'button',
      when: 'variant:secondary',
    });
    const sec = ruleOf('l10', '.astryx-button[data-variant="secondary"]');
    expect(sec.indexOf('border-top-color: #00aa00')).toBeGreaterThan(
      sec.indexOf('border: 2px solid #ff0000'),
    );
  }, 240_000);
});

describe('cards inside variant cards', () => {
  it("keeps the plain card's side inside a variant card: the reset comes before its direction rules", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('c4', {cwd, like: 'neutral'});
    await themeEditSet('c4', 'padding-right', '9px', {cwd, on: 'card'});
    await themeEditSet('c4', 'padding', '10px', {
      cwd,
      on: 'card',
      when: 'variant:muted',
    });
    const css = cssOf('c4');
    const reset = css.indexOf(
      '.astryx-card:where(.astryx-card[data-variant="muted"] *) {',
    );
    const dir = css.indexOf('.astryx-card:where(:dir(ltr)) {');
    expect(reset).toBeGreaterThan(-1);
    expect(dir).toBeGreaterThan(reset);
  }, 240_000);

  it("resets the own source's variant sides inside it, and the pair variable on the variant", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('c4o', {cwd, like: 'neutral'});
    ownSource(
      'c4o',
      "components: {card: {'variant:muted': {paddingTop: '30px', paddingInlineStart: '40px'}}},",
    );
    await themeEditShow('c4o', {cwd});
    await themeEditSet('c4o', 'padding', '20px', {cwd, on: 'card'});
    const nested = ruleOf(
      'c4o',
      '.astryx-card:where(.astryx-card[data-variant="muted"] *)',
    );
    expect(nested).toMatch(/--astryx-card-padding-block-start:\s*initial/);
    expect(nested).toMatch(/--astryx-card-padding-inline-start:\s*initial/);

    await themeEditNew('n2b', {cwd, like: 'neutral'});
    ownSource(
      'n2b',
      "components: {card: {'variant:muted': {padding: '30px'}}},",
    );
    await themeEditShow('n2b', {cwd});
    await themeEditSet('n2b', 'padding', '4px 8px', {cwd, on: 'card'});
    await themeEditSet('n2b', 'padding-left', '5px', {cwd, on: 'card'});
    const muted = ruleOf('n2b', '.astryx-card[data-variant="muted"]');
    expect(muted).toMatch(/--astryx-card-padding-inline:\s*initial/);
    expect(muted).toMatch(/--astryx-card-padding-block:\s*initial/);
  }, 240_000);
});

describe('the spacing dial around kept sizes', () => {
  it('reads a kept size in rem or calc as px', () => {
    expect(sizePx('34px')).toBe(34);
    expect(sizePx('2.125rem')).toBe(34);
    expect(sizePx('calc(30px + 4px)')).toBe(34);
    expect(sizePx('calc(2rem - 2px)')).toBe(30);
    expect(sizePx('var(--x)')).toBeNull();
    expect(sizePx('1px 2px')).toBeNull();
  });

  it('keeps a size between two close kept ones in order, and says when there is no room', () => {
    const sizes = /** @type {Array<[string, string]>} */ ([
      ['--size-element-sm', '28px'],
      ['--size-element-md', '32px'],
      ['--size-element-lg', '40px'],
    ]);
    for (const f of [0.85, 1, 1.25]) {
      /** @type {string[]} */
      const noRoom = [];
      const md = controlSizes(
        sizes,
        f,
        {'--size-element-sm': 30, '--size-element-lg': 31},
        noRoom,
      );
      expect(md).toEqual([['--size-element-md', '30.5px']]);
      expect(noRoom).toEqual([]);
    }
    /** @type {string[]} */
    const noRoom = [];
    const md = controlSizes(
      sizes,
      1,
      {'--size-element-sm': 30, '--size-element-lg': 30},
      noRoom,
    );
    expect(md).toEqual([['--size-element-md', '30px']]);
    expect(noRoom).toEqual(['--size-element-md']);
  });

  it('keeps a rem, calc or own-source size and the part sizes in order (real neutral)', async ctx => {
    if (needBases(ctx)) return;
    const lgOf = (/** @type {string} */ slug, sel = ':root') => {
      const css = cssOf(slug);
      const i = css.indexOf(`${sel} {`);
      const rule = i < 0 ? css : css.slice(i, css.indexOf('}', i));
      return parseFloat(
        /--size-element-lg:\s*([\d.]+)px/.exec(rule)?.[1] ?? '0',
      );
    };
    for (const v of ['2.125rem', 'calc(30px + 4px)']) {
      const slug = v.startsWith('calc') ? 'd1c' : 'd1r';
      await themeEditNew(slug, {cwd, like: 'neutral'});
      await themeEditSet(slug, '--size-element-md', v, {cwd});
      await themeEditSet(slug, 'spacing', 'tight', {cwd});
      expect(cssOf(slug)).toMatch(/--size-element-lg:\s*3[5-9]px/);
    }
    await themeEditNew('d1o', {cwd, like: 'neutral'});
    ownSource('d1o', "tokens: {'--size-element-md': '34px'},");
    await themeEditShow('d1o', {cwd});
    await themeEditSet('d1o', 'spacing', 'tight', {cwd});
    expect(cssOf('d1o')).toMatch(/--size-element-lg:\s*3[5-9]px/);

    await themeEditNew('d2', {cwd, like: 'neutral'});
    await themeEditSet('d2', '--size-element-md', '34px', {cwd, on: 'card'});
    const r = await themeEditSet('d2', 'spacing', 'tight', {cwd, on: 'card'});
    const card = ruleOf('d2', '.astryx-card');
    expect(card).toMatch(/--size-element-md:\s*34px/);
    expect(lgOf('d2', '.astryx-card')).toBeGreaterThan(34);
    expect(r.data.notes.join(' ')).toMatch(
      /keeps your exact --size-element-md/,
    );

    await themeEditNew('d2b', {cwd, like: 'neutral'});
    await themeEditSet('d2b', '--size-element-md', '34px', {cwd});
    await themeEditSet('d2b', '--spacing-4', '13px', {cwd});
    await themeEditSet('d2b', 'spacing', 'tight', {cwd, on: 'card'});
    const inCard = ruleOf('d2b', '.astryx-card');
    expect(inCard).not.toMatch(/--size-element-md:/);
    expect(inCard).not.toMatch(/--spacing-4:/);
    expect(lgOf('d2b', '.astryx-card')).toBeGreaterThan(34);
  }, 240_000);
});

describe('runs and notes', () => {
  it('offers the per-mode color step that works, and never a currentcolor gradient', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('r3', {cwd, like: 'neutral'});
    const border = await refusal(() =>
      themeEditSet('r3', 'border', '2px solid #ff0000', {
        cwd,
        on: 'card',
        mode: 'dark',
      }),
    );
    expect(border.code).toBe('ERR_THEME_NO_MODE');
    expect(border.run).toContainEqual(
      expect.stringMatching(
        /border-color '#ff0000' --on card --when variant:[\w-]+ --mode dark/,
      ),
    );
    const grad = await refusal(() =>
      themeEditSet('r3', 'background', 'linear-gradient(#ff0000, #0000ff)', {
        cwd,
        on: 'card',
        mode: 'dark',
      }),
    );
    expect(grad.run.join('\n')).not.toMatch(/currentcolor/);
    expect(grad.run.join('\n')).toMatch(/linear-gradient\(#ff0000, #0000ff\)/);
  }, 240_000);

  it('says the corners show on the other corners when the own source sets one', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('r8', {cwd, like: 'butter'});
    ownSource(
      'r8',
      "components: {button: {base: {borderStartEndRadius: '2px'}}},",
    );
    await themeEditShow('r8', {cwd});
    await themeEditSet('r8', 'border-radius', '9px', {cwd, on: 'button'});
    const r = await themeEditSet('r8', 'corners', 'pill', {cwd, on: 'button'});
    const notes = r.data.notes.join(' ');
    expect(notes).not.toMatch(/does not make corners show/);
    expect(notes).toMatch(
      /shows only after `[^`]*undo r8 border-radius --on button`, and then not on the border-start-end-radius/,
    );
  }, 240_000);

  it("tells a one-mode theme's wiring to give <Theme> its mode", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('r23', {cwd, like: 'neutral'});
    await themeEditSet('r23', 'mode', 'light-only', {cwd});
    const r = await themeEditShow('r23', {cwd});
    expect(/** @type {any} */ (r.data).wiring.join('\n')).toMatch(
      /mode="light"/,
    );
  }, 240_000);
});
