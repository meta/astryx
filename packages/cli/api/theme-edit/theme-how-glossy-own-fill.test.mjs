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
  it("a brief's glossy buttons and top bar each gloss their own fill, live over its token", async () => {
    const lines = writes(
      await how(
        'q0',
        'Surface: glossy gradient buttons and top bar, flat cards.',
      ),
    );
    expect(lines.join('\n')).not.toMatch(/#c7d2fe|#6366f1/);
    const all = glosses(lines);
    for (const on of ['button', 'app-shell-header']) {
      const mine = all.filter(g => g.on === on);
      expect(mine.length, on).toBeGreaterThan(0);
      // (Each a gloss over the look's own token: lighter at the top, darker
      // at the bottom, in every mode at once.)
      // (An opaque token fill is glossed live over its token; a see-through
      // one, a secondary button's, per mode.)
      expect(mine.some(live), on).toBe(true);
      for (const g of mine.filter(live)) {
        expect(g.stops[0], on).toMatch(
          /^color-mix\(in oklab, var\(--[a-z0-9-]+\), white/,
        );
        expect(g.stops[2], on).toMatch(
          /^color-mix\(in oklab, var\(--[a-z0-9-]+\), black/,
        );
        expect(g.rest, on).not.toMatch(/--mode/);
      }
    }
    expect(
      all.find(g => g.on === 'button' && / --when variant:primary/.test(g.rest))
        ?.stops[1],
    ).toBe('var(--color-accent)');
    // (A button keeps its hover wash, layered over the gloss.)
    expect(
      lines.some(l =>
        /^set q0 background-image 'linear-gradient\(var\(--color-overlay-hover\), var\(--color-overlay-hover\)\), linear-gradient\(.*' --on button --when variant:primary --state hover$/.test(
          l,
        ),
      ),
    ).toBe(true);
    // (The header draws no hover wash: it takes none.)
    expect(lines.some(l => / --on app-shell-header.* --state /.test(l))).toBe(
      false,
    );
    // (The top nav draws no fill of its own: the bar's gloss shows.)
    expect(lines.some(l => / --on top-nav\b/.test(l))).toBe(false);
    expect(lines).toContain('set q0 box-shadow none --on card');
  }, 240_000);

  it("a glossy ask in dark mode writes the dark fills' glosses alone", async () => {
    const lines = writes(await how('q0', 'glossy buttons in dark mode'));
    expect(lines.join('\n')).not.toMatch(/#c7d2fe|#6366f1/);
    const all = glosses(lines);
    expect(all.length).toBeGreaterThan(0);
    for (const g of all) expect(g.rest).toMatch(/ --mode dark$/);
    // (The primary button's own fill token, never the sample's indigo.)
    expect(
      all.find(g => / --when variant:primary/.test(g.rest))?.stops[1],
    ).toBe('var(--color-accent)');
  }, 240_000);

  it('a color or tone said of the text is no fill', async () => {
    for (const ask of [
      'glossy buttons with white text',
      'glossy buttons with dark text',
    ]) {
      const primary = glosses(writes(await how('q0', ask))).find(g =>
        / --when variant:primary/.test(g.rest),
      );
      // (The primary's own fill, never the text's color.)
      expect(primary?.stops[1], ask).toBe('var(--color-accent)');
    }
  }, 240_000);

  it("a variant named glosses that variant's own fill", async () => {
    const lines = writes(await how('q0', 'glossy destructive buttons'));
    // (Its light fill is opaque, its dark one see-through: each mode
    // glossed as its own colors.)
    const light = glosses(lines).find(g => / --mode light/.test(g.rest));
    expect(light?.stops[1]).toBe('#ffc4be');
  }, 240_000);

  it('a color said for a part with no fill of its own is glossed', async () => {
    const tabs = glosses(writes(await how('q0', 'glossy blue tabs')));
    expect([...new Set(tabs.map(g => g.stops[1]))]).toEqual(['#2563eb']);
  }, 240_000);

  it('a color said with it, in the same item or the ask, is the fill', async () => {
    const blue = glosses(writes(await how('q0', 'glossy blue buttons')));
    expect(blue.map(g => g.stops[1])).toEqual(['#2563eb']);
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
      on: 'button',
      when: 'variant:primary',
    });
    const primary = glosses(writes(await how('q2', 'glossy buttons'))).filter(
      g => / --when variant:primary/.test(g.rest),
    );
    expect([...new Set(primary.map(g => g.stops[1]))]).toEqual(['#2563eb']);
  }, 240_000);

  it('a theme word or a gray said is read as its color', async () => {
    for (const [ask, on, light] of [
      ['glossy accent buttons', 'button', 'var(--color-accent)'],
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

  it('a variant with a see-through fill glosses it at its own alpha', async () => {
    const g = glosses(writes(await how('q0', 'glossy secondary buttons')));
    // (Each mode's own tint, every stop at the fill's alpha.)
    expect(g.length).toBeGreaterThan(0);
    const lines = writes(await how('q0', 'glossy secondary buttons'));
    // (The look's own see-through fill under it is cleared in each mode.)
    for (const m of ['light', 'dark'])
      expect(lines).toContain(
        `set q0 background-color transparent --on button --when variant:secondary --mode ${m}`,
      );
    for (const x of g) {
      expect(x.rest).toMatch(/ --mode (?:light|dark)$/);
      const alphas = new Set(x.stops.map(s => s.slice(7)));
      expect(alphas.size, x.rest).toBe(1);
      expect([...alphas][0], x.rest).toMatch(/^[0-9a-f]{2}$/);
    }
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

  it('a named variant with no fill is named in the answer', async () => {
    const rs = await how('q0', 'glossy ghost buttons');
    expect(writes(rs)).toEqual([]);
    expect(rs.map(r => r.text).join('\n')).toMatch(/\bghost button\b/);
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
    const g = glosses(writes(await how('q0', 'glossy small buttons')));
    expect(
      g.find(x => / --when variant:primary\+size:sm/.test(x.rest))?.stops[1],
    ).toBe('var(--color-accent)');
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
      on: 'button',
    });
    const lines = writes(await how('q1', 'glossy buttons'));
    expect(glosses(lines).map(g => g.stops[1])).toEqual(['#e11d48']);
  }, 240_000);
});
