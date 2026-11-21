// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file "Glossy" is a gloss of the part's own fill: a lighter top and a
 * darker bottom around that fill, in each mode, never one sample gradient
 * for every part. A part that draws no fill of its own writes nothing.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
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
 * The gradients written on a part, by mode ('' for both).
 * @param {string[]} lines @param {string} on
 */
const glossesOn = (lines, on) =>
  Object.fromEntries(
    lines
      .map(l =>
        new RegExp(
          String.raw`^set q0 background '(linear-gradient\([^']*\))' --on ${on}(?: --mode (light|dark))?$`,
        ).exec(l),
      )
      .filter(m => m != null)
      .map(m => [m[2] ?? '', m[1]]),
  );

/** The three stops of a gloss. @param {string} g */
const stopsOf = g => [...g.matchAll(/#[0-9a-f]{6}/g)].map(m => m[0]);

describe("glossy is a gloss of the part's own fill", () => {
  it("a brief's glossy buttons and top bar each take their own fill in each mode", async () => {
    const lines = writes(
      await how(
        'q0',
        'Surface: glossy gradient buttons and top bar, flat cards.',
      ),
    );
    expect(lines.join('\n')).not.toMatch(/#c7d2fe|#6366f1/);
    for (const on of ['button', 'app-shell-header']) {
      const g = glossesOn(lines, on);
      expect(Object.keys(g).sort(), on).toEqual(['dark', 'light']);
      for (const value of Object.values(g)) {
        const [top, fill, bottom] = stopsOf(value);
        // (A lighter top and a darker bottom around the part's own fill.)
        expect(luma(top), on).toBeGreaterThanOrEqual(luma(fill));
        expect(luma(bottom), on).toBeLessThan(luma(fill));
      }
    }
    // (The top nav draws no fill of its own: the bar's gloss shows.)
    expect(lines.some(l => / --on top-nav\b/.test(l))).toBe(false);
    expect(lines).toContain('set q0 box-shadow none --on card');
  }, 240_000);

  it("a glossy ask in dark mode writes the dark fill's gloss alone", async () => {
    const lines = writes(await how('q0', 'glossy buttons in dark mode'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/ --on button --mode dark$/);
    const light = glossesOn(
      writes(await how('q0', 'glossy buttons')),
      'button',
    );
    expect(lines[0]).toContain(light.dark);
  }, 240_000);

  it('a color said with it is the fill the gloss is made from', async () => {
    const lines = writes(await how('q0', 'glossy blue buttons'));
    expect(lines).toHaveLength(1);
    expect(stopsOf(String(glossesOn(lines, 'button')[''] ?? ''))[1]).toBe(
      '#2563eb',
    );
  }, 240_000);
});

/** Relative lightness, enough to order shades. @param {string} h */
function luma(h) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
