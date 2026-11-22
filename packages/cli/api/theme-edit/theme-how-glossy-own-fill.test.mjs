// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file "Glossy" is a gloss of the part's own fill: a lighter top and a
 * darker bottom around that fill, in each mode, never one sample gradient
 * for every part: a color said with it, else the fill the theme sets on the
 * part, else each variant's own fill. A part that draws no fill of its own
 * writes nothing.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
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

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-how-glossy-own-fill-',
    FIXTURE_PACKAGES,
  );
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('q0', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} theme @param {string} ask */
const how = async (theme, ask) => {
  const {data} = /** @type {any} */ (await themeEditHow(ask, {cwd, theme}));
  return /** @type {Array<{text: string, commands: string[]}>} */ (
    data.results ?? []
  ).map(r => ({
    text: r.text,
    commands: r.commands.map(c => c.replace(/^.*? editor /, '')),
  }));
};

/** @param {Array<{commands: string[]}>} rs */
// (The readable-text line set's own check adds beside a fill is measured
// on its own: these asks read the rest.)
const writes = rs =>
  rs
    .filter(r => !/^readable text on that fill/.test(r.text))
    .flatMap(r => r.commands)
    .filter(c => /^(set|undo) /.test(c));

/**
 * The glosses written: the part, the rest of the line (variant, mode) and
 * the three stops.
 * @param {string[]} lines
 */
const glosses = lines =>
  lines
    .filter(l => !/ --state /.test(l))
    .map(l =>
      /^set q\d? (?:background|background-image) 'linear-gradient\((.+) 0%, (#[0-9a-f]{6,8}|var\(--[a-z0-9-]+\)) 45%, (.+) 100%\)' --on (\S+)(.*)$/.exec(
        l,
      ),
    )
    .filter(m => m != null)
    .map(m => ({on: m[4], rest: m[5], stops: [m[1], m[2], m[3]]}));

/** A live gloss over a token: its middle stop is the token. @param {{stops: string[]}} g */
const live = g => /^var\(--/.test(g.stops[1]);

describe("glossy is a gloss of the part's own fill", () => {
  it("a brief's glossy top bar glosses its own fill live; its buttons, which draw a wash, keep their look", async () => {
    const rs = await how(
      'q0',
      'Surface: glossy gradient buttons and top bar, flat cards.',
    );
    const lines = writes(rs);
    expect(lines.join('\n')).not.toMatch(/#c7d2fe|#6366f1/);
    const bar = glosses(lines).filter(g => g.on === 'app-shell-header');
    expect(bar.length).toBeGreaterThan(0);
    // (Each header look glossed live over its own surface token.)
    for (const g of bar) {
      expect(live(g)).toBe(true);
      expect(g.stops[0]).toMatch(
        /^color-mix\(in oklab, var\(--[a-z0-9-]+\), white 20%\)$/,
      );
      expect(g.stops[2]).toMatch(
        /^color-mix\(in oklab, var\(--[a-z0-9-]+\), black 20%\)$/,
      );
    }
    // (A button's hover and press wash would sit under a gloss image: it
    // keeps its look and the answer says why.)
    expect(
      lines.some(l => / --on button\b/.test(l) && /background/.test(l)),
    ).toBe(false);
    expect(rs.map(r => r.text).join('\n')).toMatch(
      /shows its hover and press with a wash over its fill/,
    );
    expect(lines.some(l => / --on top-nav\b/.test(l))).toBe(false);
    expect(lines).toContain('set q0 box-shadow none --on card');
  }, 240_000);

  it("a glossy ask in dark mode writes the dark fills' glosses alone", async () => {
    const g = glosses(writes(await how('q0', 'glossy top bar in dark mode')));
    expect(g.length).toBeGreaterThan(0);
    for (const x of g) expect(x.rest).toMatch(/ --mode dark$/);
  }, 240_000);

  it('a color or tone said of the text is no fill', async () => {
    for (const ask of [
      'glossy badges with white text',
      'glossy badges, dark labels',
    ]) {
      const info = glosses(writes(await how('q0', ask))).find(g =>
        / --when variant:info/.test(g.rest),
      );
      // (The badge's own fill, never the text's color.)
      expect(info?.stops[1], ask).toBe('var(--color-info)');
    }
  }, 240_000);

  it("a variant named glosses that variant's own fill", async () => {
    const g = glosses(writes(await how('q0', 'glossy info badges')));
    expect([...new Set(g.map(x => x.stops[1]))]).toEqual(['var(--color-info)']);
  }, 240_000);

  it('a color said never goes on a part with no resting fill or a state fill', async () => {
    for (const ask of [
      'glossy blue tabs',
      'glossy blue table rows',
      'glossy blue list items',
    ]) {
      const rs = await how('q0', ask);
      expect(writes(rs), ask).toEqual([]);
      expect(rs.map(r => r.text).join('\n'), ask).toMatch(
        /draws no fill of its own|has no plain fill|paints another fill|wash over its fill/,
      );
    }
  }, 240_000);

  it('a fill the theme set on a part whose states paint their own fill is not glossed', async () => {
    await themeEditNew('q6', {cwd, like: 'neutral'});
    await themeEditSet('q6', 'background-color', '#ffffff', {
      cwd,
      on: 'table-row',
    });
    for (const ask of ['glossy table rows', 'glossy blue table rows'])
      expect(writes(await how('q6', ask)), ask).toEqual([]);
  }, 240_000);

  it("a fill said in another clause holds only in that clause's mode", async () => {
    const lines = writes(
      await how('q0', 'glossy top bar, blue top bar in dark mode'),
    );
    const bar = glosses(lines).filter(g => g.on === 'app-shell-header');
    expect(bar.find(g => / --mode dark/.test(g.rest))?.stops[1]).toBe(
      '#2563eb',
    );
    expect(bar.find(g => !/ --mode dark/.test(g.rest))?.stops[1]).not.toBe(
      '#2563eb',
    );
    // (Light mode keeps its own fill and its own text.)
    expect(lines.filter(l => /^set q0 color .* --mode light$/.test(l))).toEqual(
      [],
    );
  }, 240_000);

  it("a fill said for one look is that look's own gloss, and only its", async () => {
    const g = glosses(
      writes(await how('q0', 'info badges red, glossy badges')),
    );
    expect(g.find(x => / --when variant:info/.test(x.rest))?.stops[1]).toBe(
      '#dc2626',
    );
    expect(g.find(x => / --when variant:error/.test(x.rest))?.stops[1]).toBe(
      'var(--color-error)',
    );
  }, 240_000);

  it('a text color the ask says is kept on a gloss of a color said', async () => {
    const lines = (
      await how('q0', 'white text on the top bar, glossy yellow top bar')
    ).flatMap(r => r.commands);
    expect(
      lines.filter(l =>
        /^set q0 color .*#000000.* --on app-shell-header/.test(l),
      ),
    ).toEqual([]);
  }, 240_000);

  it('a color said on a part that draws a wash writes nothing and says why', async () => {
    const rs = await how('q0', 'glossy blue buttons');
    expect(writes(rs)).toEqual([]);
    expect(rs.map(r => r.text).join('\n')).toMatch(
      /shows its hover and press with a wash over its fill/,
    );
  }, 240_000);

  it('a color said with it, in the same item or the ask, is the fill', async () => {
    const blue = glosses(writes(await how('q0', 'glossy blue top bar')));
    expect([...new Set(blue.map(g => g.stops[1]))]).toEqual(['#2563eb']);
    const bar = glosses(
      writes(await how('q0', 'Top bar: dark (#222), glossy, white links')),
    );
    // (The whole ask's answer and the item's own both carry it.)
    expect([...new Set(bar.map(g => g.stops[1]))]).toEqual(['#222222']);
  }, 240_000);

  it("the fill the theme sets for one variant is that variant's fill", async () => {
    await themeEditNew('q2', {cwd, like: 'neutral'});
    await themeEditSet('q2', 'background-color', '#2563eb', {
      cwd,
      on: 'badge',
      when: 'variant:info',
    });
    const info = glosses(writes(await how('q2', 'glossy badges'))).filter(g =>
      / --when variant:info/.test(g.rest),
    );
    expect([...new Set(info.map(g => g.stops[1]))]).toEqual(['#2563eb']);
  }, 240_000);

  it('a theme word or a gray said is read as its color', async () => {
    for (const [ask, on, light] of [
      ['glossy accent top bar', 'app-shell-header', 'var(--color-accent)'],
      ['glossy grey top bar', 'app-shell-header', '#9e9e9e'],
    ]) {
      const rs = await how('q0', ask);
      const mine = glosses(writes(rs)).filter(
        g => g.on === on && !/ --mode dark/.test(g.rest),
      );
      // (The color the word names in light mode, never the sample.)
      expect([...new Set(mine.map(g => g.stops[1]))], ask).toEqual([light]);
      expect(rs.map(r => r.text).join('\n'), ask).not.toMatch(/name one/);
    }
  }, 240_000);

  it('a token or a light-dark() pair the theme set on the part is read in each mode', async () => {
    await themeEditNew('q4', {cwd, like: 'neutral'});
    await themeEditSet(
      'q4',
      'background-color',
      'light-dark(#ffffff, #111111)',
      {
        cwd,
        on: 'app-shell-header',
      },
    );
    const g = glosses(writes(await how('q4', 'glossy top bar'))).filter(
      x => x.on === 'app-shell-header',
    );
    expect(
      Object.fromEntries(
        g.map(x => [/--mode (\w+)/.exec(x.rest)?.[1] ?? '', x.stops[1]]),
      ),
    ).toEqual({light: '#ffffff', dark: '#111111'});
  }, 240_000);

  it('a see-through fill glosses at its own alpha, with the fill under it cleared', async () => {
    await themeEditNew('q7', {cwd, like: 'neutral'});
    await themeEditSet('q7', 'background-color', '#0000001a', {
      cwd,
      on: 'app-shell-header',
    });
    const lines = writes(await how('q7', 'glossy top bar'));
    const g = glosses(lines).filter(x => x.on === 'app-shell-header');
    expect(g.length).toBeGreaterThan(0);
    for (const x of g) {
      expect(x.rest).toMatch(/ --mode (?:light|dark)$/);
      const alphas = new Set(x.stops.map(s => s.slice(7)));
      expect([...alphas], x.rest).toEqual(['1a']);
    }
    expect(lines).toContainEqual(
      expect.stringMatching(
        /^set q7 background-color transparent --on app-shell-header.* --mode light$/,
      ),
    );
  }, 240_000);

  it('a banner, whose statuses draw colors the editor does not read, writes nothing and says why', async () => {
    const rs = await how('q0', 'glossy banners');
    expect(writes(rs)).toEqual([]);
    expect(rs.map(r => r.text).join('\n')).toMatch(
      /each status of banner draws a color of its own/,
    );
  }, 240_000);

  it('toasts take a gloss per type, each of its own color', async () => {
    for (const [ask, on] of [['glossy toasts', 'toast']]) {
      const mine = glosses(writes(await how('q0', ask))).filter(
        g => g.on === on,
      );
      // (More than one look, each glossed from its own fill.)
      expect(
        new Set(mine.map(g => /--when (\S+)/.exec(g.rest)?.[1])).size,
        ask,
      ).toBeGreaterThan(1);
      expect(new Set(mine.map(g => g.stops[1])).size, ask).toBeGreaterThan(1);
    }
  }, 240_000);

  it('a part that draws a wash, named by its look, says why it keeps its look', async () => {
    const rs = await how('q0', 'glossy ghost buttons');
    expect(writes(rs)).toEqual([]);
    expect(rs.map(r => r.text).join('\n')).toMatch(
      /shows its hover and press with a wash over its fill/,
    );
  }, 240_000);

  it('a gradient the theme set stays, and the answer says so', async () => {
    await themeEditNew('q5', {cwd, like: 'neutral'});
    await themeEditSet(
      'q5',
      'background',
      'linear-gradient(#ffffff, #000000)',
      {
        cwd,
        on: 'app-shell-header',
      },
    );
    const rs = await how('q5', 'glossy top bar');
    expect(writes(rs)).toEqual([]);
    expect(rs.map(r => r.text).join('\n')).toMatch(
      /has a gradient fill the theme sets, which stays/,
    );
  }, 240_000);

  it('a switch, whose hover and press tint its own fill, writes nothing and says why', async () => {
    const rs = await how('q0', 'glossy toggles');
    expect(writes(rs)).toEqual([]);
    expect(rs.map(r => r.text).join('\n')).toMatch(
      /switch shows its hover and press by tinting its own fill/,
    );
  }, 240_000);

  it('a part with a fill of its own for a state writes nothing and says why', async () => {
    for (const ask of [
      'glossy pagination dots',
      'glossy table rows',
      'glossy list items',
      'glossy pagination items',
      'glossy blue toggle buttons',
    ]) {
      const rs = await how('q0', ask);
      expect(writes(rs), ask).toEqual([]);
      expect(rs.map(r => r.text).join('\n'), ask).toMatch(
        /paints another fill for some of its states|draws no fill of its own|has no plain fill|wash over its fill/,
      );
    }
  }, 240_000);

  it('a state that keeps the look own fill, a disabled input, is glossed', async () => {
    const g = glosses(writes(await how('q0', 'glossy text inputs')));
    expect(g.length).toBeGreaterThan(0);
  }, 240_000);

  it('a group with a member look that draws no fill, a ghost selector, writes nothing and names it', async () => {
    const rs = await how('q0', 'glossy inputs');
    expect(writes(rs)).toEqual([]);
    expect(rs.map(r => r.text).join('\n')).toMatch(
      /\bghost selector\b.*\bdraws? no fill of (?:its|their) own/,
    );
  }, 240_000);

  it('a clickable card, which draws a press wash, keeps its look', async () => {
    const rs = await how('q0', 'glossy clickable cards');
    expect(writes(rs)).toEqual([]);
    expect(rs.map(r => r.text).join('\n')).toMatch(
      /shows its hover and press with a wash over its fill/,
    );
  }, 240_000);

  it('a switch writes nothing with a color said too', async () => {
    const rs = await how('q0', 'glossy blue toggles');
    expect(writes(rs).filter(l => / --on switch\b/.test(l))).toEqual([]);
  }, 240_000);

  it('a named banner status says its color is not read here', async () => {
    const rs = await how('q0', 'glossy error banner');
    expect(writes(rs)).toEqual([]);
    expect(rs.map(r => r.text).join('\n')).toMatch(
      /each status of banner draws a color of its own/,
    );
  }, 240_000);

  it('a size named glosses each variant at that size', async () => {
    const g = glosses(writes(await how('q0', 'glossy small badges')));
    expect(
      g.find(x => / --when variant:info(?:\+size:sm)?\b/.test(x.rest))
        ?.stops[1],
    ).toBe('var(--color-info)');
  }, 240_000);

  it('a color said for a part whose fills are its looks writes nothing and says why', async () => {
    const rs = await how('q0', 'glossy blue badges');
    expect(writes(rs)).toEqual([]);
    const text = rs.map(r => r.text).join('\n');
    expect(text).not.toMatch(/draws no fill of its own/);
    expect(text).toMatch(/is not split into them here/);
  }, 240_000);

  it('a tinted color writes no gloss and says why', async () => {
    const rs = await how('q0', 'glossy tooltips tinted blue');
    expect(writes(rs).filter(l => / --on tooltip\b/.test(l))).toEqual([]);
    expect(rs.map(r => r.text).join('\n')).toMatch(
      /a gloss of a tinted color on tooltip is not worked out here/,
    );
  }, 240_000);

  it('a fill the theme cleared keeps its look', async () => {
    await themeEditNew('q3', {cwd, like: 'neutral'});
    await themeEditSet('q3', 'background-color', 'transparent', {
      cwd,
      on: 'app-shell-header',
    });
    const lines = writes(await how('q3', 'glossy top bar'));
    expect(glosses(lines).filter(g => g.on === 'app-shell-header')).toEqual([]);
  }, 240_000);

  it('the fill the theme sets on the part is the fill', async () => {
    await themeEditNew('q1', {cwd, like: 'neutral'});
    await themeEditSet('q1', 'background-color', '#e11d48', {
      cwd,
      on: 'app-shell-header',
    });
    const lines = writes(await how('q1', 'glossy top bar'));
    expect([
      ...new Set(
        glosses(lines)
          .filter(g => g.on === 'app-shell-header')
          .map(g => g.stops[1]),
      ),
    ]).toEqual(['#e11d48']);
  }, 240_000);
});
