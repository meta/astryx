// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * How reads which corners an ask names: a side ("the top corners", "rounded
 * on top", "on the right side"), one corner ("the top-left corner"), "only"
 * and "except", with the part's own words naming no corner ("bottom sheet").
 * Against real bundled base themes; each answer's command is run by set.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {cornersNamed} from './_how-question.mjs';
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
  cwd = makeLinkedFixture(
    'astryx-theme-how-corner-positions-',
    FIXTURE_PACKAGES,
  );
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (!unbuilt) await themeEditNew('k', {cwd, like: 'neutral'});
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

/** The set commands of the first answer. @param {string} q */
const writes = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'k'});
  return (data.results?.[0]?.commands ?? [])
    .filter((/** @type {string} */ c) => / editor set /.test(c))
    .map((/** @type {string} */ c) => c.replace(/^.*? editor set k /, ''));
};

describe('the corners an ask names', () => {
  it('reads sides, single corners, only and except', () => {
    expect(cornersNamed('4px top corners')).toEqual({
      corners: ['start-start', 'start-end'],
      only: false,
      except: false,
    });
    expect(cornersNamed('card top-left corner 12px')?.corners).toEqual([
      'start-start',
    ]);
    expect(cornersNamed('rounded on top')?.corners).toEqual([
      'start-start',
      'start-end',
    ]);
    expect(cornersNamed('square on the right side')?.corners).toEqual([
      'start-end',
      'end-end',
    ]);
    expect(cornersNamed('round only the bottom corners 6px')?.only).toBe(true);
    expect(cornersNamed('corners 4px except the bottom')).toEqual({
      corners: ['start-start', 'start-end'],
      only: true,
      except: true,
    });
    expect(cornersNamed('4px corners except the top left')?.corners).toEqual([
      'start-end',
      'end-start',
      'end-end',
    ]);
    // A part's own words name no corner.
    expect(cornersNamed('bottom sheet corners 16px', 'bottom-sheet')).toBe(
      null,
    );
    expect(
      cornersNamed('top nav items rounded on the bottom', 'top-nav-item')
        ?.corners,
    ).toEqual(['end-start', 'end-end']);
    expect(cornersNamed('rounder corners')).toBe(null);
  });

  it('writes the corners named, and squares the rest when the ask says only those', async ctx => {
    if (needBases(ctx)) return;
    // The part's own words are no side.
    expect(await writes('bottom sheet top corners 16px')).toEqual([
      'border-start-start-radius 16px --on bottom-sheet',
      'border-start-end-radius 16px --on bottom-sheet',
    ]);
    // One corner is one corner.
    expect(await writes('card top-left corner 12px')).toEqual([
      'border-start-start-radius 12px --on card',
    ]);
    // A size on some corners leaves the others as they are.
    expect(await writes('4px top corners on cards')).toEqual([
      'border-start-start-radius 4px --on card',
      'border-start-end-radius 4px --on card',
    ]);
    // Only, except, and rounded on a side: every corner settled, one radius.
    expect(await writes('tab corners 4px except the bottom')).toEqual([
      "border-radius '4px 4px 0 0' --on tab",
    ]);
    expect(await writes('round only the bottom corners of menus 6px')).toEqual([
      "border-radius '0 0 6px 6px' --on menus",
    ]);
    // (Three corners named: logical longhands, as a right-to-left page
    // mirrors them.)
    expect(await writes('tooltips 4px corners except the top left')).toEqual([
      'border-start-start-radius 0 --on tooltip',
      'border-start-end-radius 4px --on tooltip',
      'border-end-start-radius 4px --on tooltip',
      'border-end-end-radius 4px --on tooltip',
    ]);
    // Rounded with no size names only the corners it rounds: tabs already
    // rounded there need nothing, and the other corners are never
    // rewritten. "Only" said of rounding squares the rest, keeping the
    // radius the part reads (the corners dial still moves it).
    // (It writes nothing and offers the line that squares the bottom, as
    // "only" says.)
    {
      const {data} = await themeEditHow('tabs rounded on top', {
        cwd,
        theme: 'k',
      });
      const rs = /** @type {Array<{text: string, commands: string[]}>} */ (
        data.results ?? []
      );
      expect(rs[0]?.commands).toEqual([]);
      expect(rs[0]?.text).toMatch(
        /the top corners on tab: already rounded .*the bottom corners stay as they are/,
      );
      expect(
        rs
          .flatMap(r => r.commands)
          .map(c => c.replace(/^.*? editor set k /, '')),
      ).toEqual([
        "border-radius 'var(--radius-element) var(--radius-element) 0 0' --on tab",
      ]);
    }
    expect(await writes('rounded top corners only on tabs')).toEqual([
      "border-radius 'var(--radius-element) var(--radius-element) 0 0' --on tab",
    ]);
    // A part that is square and reads no corner token takes the round rung
    // there (a heading with a fill of its own, as a title bar).
    await themeEditSet('k', 'background-color', '#eeeeee', {
      cwd,
      on: 'heading',
    });
    expect(await writes('heading rounded top corners')).toEqual([
      'border-start-start-radius 16px --on heading',
      'border-start-end-radius 16px --on heading',
    ]);
    // Square on a side squares those corners only.
    expect(await writes('inputs square on the right side')).toEqual([
      'border-start-end-radius 0 --on inputs',
      'border-end-end-radius 0 --on inputs',
    ]);
  }, 240_000);

  it('rounds a corner whose token is 0 with the round corners, never with that token', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('z', {cwd, like: 'neutral'});
    await themeEditSet('z', '--radius-element', '0px', {cwd});
    const {data} = await themeEditHow('tabs rounded on top', {cwd, theme: 'z'});
    expect(
      (data.results?.[0]?.commands ?? []).map((/** @type {string} */ c) =>
        c.replace(/^.*? editor set z /, ''),
      ),
    ).toEqual([
      'border-start-start-radius 16px --on tab',
      'border-start-end-radius 16px --on tab',
    ]);
  }, 240_000);

  it('squares the corners a negative corner ask names', async ctx => {
    if (needBases(ctx)) return;
    expect(await writes('no rounding on the bottom corners of tabs')).toEqual([
      'border-end-start-radius 0 --on tab',
      'border-end-end-radius 0 --on tab',
    ]);
  }, 240_000);

  it('rounds only the named corners of a radius of several, leaving the rest as the theme has them', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('m', {cwd, like: 'neutral'});
    await themeEditSet('m', 'border-radius', '4px 8px 0 0', {cwd, on: 'card'});
    const {data} = await themeEditHow('cards rounded on the bottom', {
      cwd,
      theme: 'm',
    });
    expect(
      (data.results?.[0]?.commands ?? []).map((/** @type {string} */ c) =>
        c.replace(/^.*? editor set m /, ''),
      ),
    ).toEqual([
      'border-end-start-radius 4px --on card',
      'border-end-end-radius 4px --on card',
    ]);
  }, 240_000);

  it('never rewrites the corners an ask does not name', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('n', {cwd, like: 'neutral'});
    const ask = async (/** @type {string} */ q) =>
      (
        (await themeEditHow(q, {cwd, theme: 'n'})).data.results?.[0]
          ?.commands ?? []
      ).map((/** @type {string} */ c) => c.replace(/^.*? editor set n /, ''));
    // (An elliptical radius already rounded on top: nothing is written;
    // the line that squares the bottom, as "only" says, is offered.)
    await themeEditSet('n', 'border-radius', '12px / 6px', {cwd, on: 'card'});
    {
      const rs = /** @type {Array<{text: string, commands: string[]}>} */ (
        (await themeEditHow('cards rounded on top', {cwd, theme: 'n'})).data
          .results ?? []
      );
      expect(rs.map(r => r.text).join('\n')).toMatch(
        /the top corners on card: already rounded .*the bottom corners stay as they are/,
      );
      expect(
        rs
          .flatMap(r => r.commands)
          .filter(c => / editor set /.test(c))
          .map(c => c.replace(/^.*? editor set n /, '')),
      ).toEqual(["border-radius '12px 12px 0 0 / 6px 6px 0 0' --on card"]);
    }
    // (Elliptical corners square at the bottom: each one rounded as an
    // elliptical longhand, the top untouched.)
    await themeEditSet('n', 'border-radius', '12px 12px 0 0 / 6px 6px 0 0', {
      cwd,
      on: 'card',
    });
    const w = await ask('cards rounded on the bottom');
    expect(w).toEqual([
      "border-end-start-radius '12px 6px' --on card",
      "border-end-end-radius '12px 6px' --on card",
    ]);
    for (const line of w) {
      const m = /^(\S+) '([^']+)' --on (\S+)$/.exec(line);
      await themeEditSet('n', String(m?.[1]), String(m?.[2]), {
        cwd,
        on: String(m?.[3]),
      });
    }
  }, 240_000);

  it('reads a corner written as calc() as one corner', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('e', {cwd, like: 'neutral'});
    const calc = 'max(0px, calc(var(--radius-container) + 4px))';
    await themeEditSet('e', 'border-radius', calc, {cwd, on: 'card'});
    const {data} = await themeEditHow('cards rounded on top only', {
      cwd,
      theme: 'e',
    });
    const [w] = (data.results?.[0]?.commands ?? []).map(
      (/** @type {string} */ c) => c.replace(/^.*? editor set e /, ''),
    );
    expect(w).toBe(`border-radius '${calc} ${calc} 0 0' --on card`);
    await themeEditSet(
      'e',
      'border-radius',
      String(/'([^']+)'/.exec(String(w))?.[1]),
      {cwd, on: 'card'},
    );
  }, 240_000);

  it('reads a negative, a bare 0, two sides with "and", and an except after the part', async ctx => {
    if (needBases(ctx)) return;
    expect(await writes('cards not rounded at the bottom')).toEqual([
      'border-end-start-radius 0 --on card',
      'border-end-end-radius 0 --on card',
    ]);
    expect(await writes('tooltips top-left corner 0')).toEqual([
      'border-start-start-radius 0 --on tooltip',
    ]);
    // (Two sides said with "and" name both: tabs rounded all round now need
    // nothing, and the bottom or right is never squared.)
    expect(
      cornersNamed('tabs rounded on top and bottom', 'tab')?.corners,
    ).toEqual(['start-start', 'start-end', 'end-start', 'end-end']);
    expect(await writes('tabs rounded on top and bottom')).toEqual([]);
    expect(await writes('tabs rounded on the left and right')).toEqual([]);
    // (A part name that starts with a side word is a part, never a side:
    // "top nav darker" is its own ask.)
    expect(
      cornersNamed('tabs rounded on top and top nav darker', 'tab')?.corners,
    ).toEqual(['start-start', 'start-end']);
    {
      const {data} = await themeEditHow(
        'tabs rounded on top and top nav darker',
        {
          cwd,
          theme: 'k',
        },
      );
      const all = /** @type {Array<{commands: string[]}>} */ (
        data.results ?? []
      )
        .flatMap(r => r.commands)
        .filter(c => / editor set /.test(c))
        .map(c => c.replace(/^.*? editor set k /, ''));
      expect(all.some(c => / --on top-nav\b/.test(c))).toBe(true);
      expect(all).toContain(
        "border-radius 'var(--radius-element) var(--radius-element) 0 0' --on tab",
      );
    }
    expect(await writes('4px corners on top and bottom of cards')).toEqual([
      'border-radius 4px --on card',
    ]);
    // (An except after "on <part>" is the corners' except, never a part.)
    expect(await writes('4px corners on tabs except the bottom')).toEqual([
      "border-radius '4px 4px 0 0' --on tab",
    ]);
    expect(await writes('rounded corners on cards except the bottom')).toEqual([
      "border-radius 'var(--radius-container) var(--radius-container) 0 0' --on card",
    ]);
    expect(await writes('square corners on inputs except the top')).toEqual([
      'border-end-start-radius 0 --on inputs',
      'border-end-end-radius 0 --on inputs',
    ]);
  }, 240_000);

  it('writes a radius of four only for the top, the bottom or every corner', async ctx => {
    if (needBases(ctx)) return;
    // (Left and right corners swap in a right-to-left page: their logical
    // longhands, never a physical radius of four.)
    expect(await writes('round only the left corners of tabs 6px')).toEqual([
      'border-start-start-radius 6px --on tab',
      'border-start-end-radius 0 --on tab',
      'border-end-start-radius 6px --on tab',
      'border-end-end-radius 0 --on tab',
    ]);
    expect(await writes('4px left corners on tabs')).toEqual([
      'border-start-start-radius 4px --on tab',
      'border-end-start-radius 4px --on tab',
    ]);
  }, 240_000);

  it('keeps a radius the theme sets as a token, and rounds the square corners of a radius of several', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('v', {cwd, like: 'neutral'});
    await themeEditSet('v', 'border-radius', 'var(--radius-container)', {
      cwd,
      on: 'tab',
    });
    await themeEditSet('v', 'border-radius', '4px 4px 0 0', {cwd, on: 'card'});
    const all = async (/** @type {string} */ q) =>
      /** @type {Array<{commands: string[]}>} */ (
        (await themeEditHow(q, {cwd, theme: 'v'})).data.results ?? []
      )
        .flatMap(r => r.commands)
        .filter(c => / editor set /.test(c))
        .map(c => c.replace(/^.*? editor set v /, ''));
    // (Rounded now with the theme's token: nothing written; the offered
    // line keeps that token.)
    expect(await all('tabs rounded on top')).toEqual([
      "border-radius 'var(--radius-container) var(--radius-container) 0 0' --on tab",
    ]);
    expect(await all('cards rounded on the bottom')).toEqual([
      'border-end-start-radius 4px --on card',
      'border-end-end-radius 4px --on card',
    ]);
  }, 240_000);

  it('set takes each answer, a menu included', async ctx => {
    if (needBases(ctx)) return;
    for (const q of [
      'menus only rounded at the bottom',
      'rounded top corners only on tabs',
    ]) {
      const [w] = await writes(q);
      const m = /^border-radius '([^']+)' --on (\S+)$/.exec(String(w));
      expect(m, q).not.toBeNull();
      await themeEditSet('k', 'border-radius', String(m?.[1]), {
        cwd,
        on: String(m?.[2]),
      });
    }
  }, 240_000);

  it('reads a sizeless squaring or pill ask by its words, and a new look after "side"', async ctx => {
    if (needBases(ctx)) return;
    for (const q of [
      'top corners of tabs to 0',
      'take the rounding off the top corners of tabs',
    ])
      expect(await writes(q), q).toEqual([
        'border-start-start-radius 0 --on tab',
        'border-start-end-radius 0 --on tab',
      ]);
    expect(await writes('pill top corners on tabs')).toEqual([
      "border-start-start-radius 'var(--radius-full)' --on tab",
      "border-start-end-radius 'var(--radius-full)' --on tab",
    ]);
    const all = async (/** @type {string} */ q) =>
      /** @type {Array<{commands: string[]}>} */ (
        (await themeEditHow(q, {cwd, theme: 'k'})).data.results ?? []
      )
        .flatMap(r => r.commands)
        .filter(c => / editor set /.test(c))
        .map(c => c.replace(/^.*? editor set k /, ''));
    // (After "side", a new look is its own ask, never the corner clause's.)
    const pad = await all(
      'cards rounded at the bottom and right side padding 12px',
    );
    expect(pad).toContain('padding-right 12px --on card');
    expect(pad.some(c => /^padding-bottom\b/.test(c))).toBe(false);
    const border = await all('tabs rounded on top and left side border blue');
    expect(border.some(c => /^border-left\b/.test(c))).toBe(true);
    expect(border.some(c => /^border-top\b/.test(c))).toBe(false);
    // (A scope word after the second side keeps both sides.)
    for (const q of [
      'tabs square on top and bottom in dark mode',
      'cards rounded on top and bottom too',
      'tabs square on the left and right too',
    ])
      expect(cornersNamed(q, q.split(' ')[0])?.corners, q).toEqual([
        'start-start',
        'start-end',
        'end-start',
        'end-end',
      ]);
  }, 240_000);

  it('reads "round off" as rounding, a length before a look as that look\'s, and a part by any of its names', async ctx => {
    if (needBases(ctx)) return;
    expect(await writes('round off the top corners of tabs 6px')).toEqual([
      'border-start-start-radius 6px --on tab',
      'border-start-end-radius 6px --on tab',
    ]);
    const all = async (/** @type {string} */ q) =>
      /** @type {Array<{commands: string[]}>} */ (
        (await themeEditHow(q, {cwd, theme: 'k'})).data.results ?? []
      )
        .flatMap(r => r.commands)
        .filter(c => / editor set /.test(c))
        .map(c => c.replace(/^.*? editor set k /, ''));
    // (The 2px is the whole border's, never the corners' radius nor one
    // side's border: the corner ask ends at its second side.)
    const border = await all('cards rounded on top and bottom 2px border');
    expect(border.some(c => /radius 2px/.test(c))).toBe(false);
    expect(border).toContain('border-width 2px --on card');
    // ("right-click menus" is the context menu: "right" names no corner.)
    expect(
      cornersNamed('square corners on right-click menus', 'context-menu', [
        /\bright[- ]click menus?\b/,
      ]),
    ).toBeNull();
    expect(await all('square corners on right-click menus')).toEqual([
      'corners square --on context-menu',
    ]);
  }, 240_000);

  it('ends the corner ask before a length of another look said with words between, and reads a part named with a side word whole', async ctx => {
    if (needBases(ctx)) return;
    const all = async (/** @type {string} */ q) =>
      /** @type {Array<{commands: string[]}>} */ (
        (await themeEditHow(q, {cwd, theme: 'k'})).data.results ?? []
      )
        .flatMap(r => r.commands)
        .filter(c => / editor set /.test(c))
        .map(c => c.replace(/^.*? editor set k /, ''));
    // (The length is the border's, the spacing's or the underline's, never
    // a radius on every corner.)
    for (const [q, length] of [
      ['tabs rounded on top and bottom 8px blue border', '8px'],
      ['tabs rounded on top and bottom 1px solid border', '1px'],
      ['tabs rounded on top and bottom 2px dashed border', '2px'],
      ['tabs rounded on top and bottom 12px spacing', '12px'],
      ['tabs rounded on top and bottom 2px underline', '2px'],
    ])
      expect(
        (await all(q)).some(c => new RegExp(`radius '?${length}\\b`).test(c)),
        q,
      ).toBe(false);
    expect(
      await all('tabs rounded on top and bottom 8px blue border'),
    ).toContain("border '8px solid #2563eb' --on tab");
    // ("top nav" is a part: "top" names no corner, so every corner is
    // squared.)
    const nav = await all('square corners on the top nav');
    expect(nav.length).toBeGreaterThan(0);
    expect(nav.some(c => /border-(?:start|end)-/.test(c))).toBe(false);
    // ("roundness", like "rounding", taken off squares.)
    expect(
      await writes('take the roundness off the top corners of tabs'),
    ).toEqual([
      'border-start-start-radius 0 --on tab',
      'border-start-end-radius 0 --on tab',
    ]);
  }, 240_000);

  it('squares on a negation of the rounding only, never on a negation of another look', async ctx => {
    if (needBases(ctx)) return;
    const all = async (/** @type {string} */ q) =>
      /** @type {Array<{commands: string[]}>} */ (
        (await themeEditHow(q, {cwd, theme: 'k'})).data.results ?? []
      )
        .flatMap(r => r.commands)
        .filter(c => / editor set /.test(c))
        .map(c => c.replace(/^.*? editor set k /, ''));
    // ("without a border" is about the border: the top corners stay
    // rounded, never squared.)
    expect(
      (await all('cards rounded on top without a border')).some(c =>
        /radius 0\b|radius '0 0/.test(c),
      ),
    ).toBe(false);
    // (The 8px is the top corners'; the negation is the border's.)
    // (A look noun between the negation and the round word: the negation
    // is the border's.)
    const before = await all('cards with no border rounded top corners 8px');
    expect(before).toContain('border-start-start-radius 8px --on card');
    expect(before.some(c => /radius 0\b/.test(c))).toBe(false);
    const sized = await all('cards top corners 8px without a border');
    expect(sized).toContain('border-start-start-radius 8px --on card');
    expect(sized).toContain('border-start-end-radius 8px --on card');
    // (A negation of the rounding itself still squares, "no rounding" and
    // "don't round", asked on a theme of its own whose tabs are rounded:
    // the shared theme's tab bottoms may be square by now.)
    await themeEditNew('neg', {cwd, like: 'neutral'});
    for (const q of [
      'no rounding on the bottom corners of tabs',
      "don't round the bottom corners of tabs",
    ]) {
      const {data} = await themeEditHow(q, {cwd, theme: 'neg'});
      expect(
        (data.results?.[0]?.commands ?? []).map((/** @type {string} */ c) =>
          c.replace(/^.*? editor set neg /, ''),
        ),
        q,
      ).toEqual([
        'border-end-start-radius 0 --on tab',
        'border-end-end-radius 0 --on tab',
      ]);
    }
  }, 240_000);
});
