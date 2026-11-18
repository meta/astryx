// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How keeps a bound on every color a step writes (a color dial's
 * seed too, and a see-through tint by its own ink, its alpha kept); a
 * token for a part named "on", "inside" or "in" a container is set on that
 * container; outline buttons in a color are the outline look in it; the
 * theme's text takes an opacity; and a part's padding is read on its own
 * pieces only (a table's cells, never a command palette inside a dialog),
 * the same for the value question and a comparison.
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
  cwd = makeLinkedFixture('astryx-theme-hunt209-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral', 'butter']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('ne', {cwd, like: 'neutral'});
  await themeEditNew('bu', {cwd, like: 'butter'});
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
const writes = rs =>
  rs.flatMap(r => r.commands).filter(c => /^(set|undo) /.test(c));

describe('a color bound holds every color a step writes', () => {
  it('the accent dial: a seed past the bound is not written, and says why', async () => {
    const rs = await how(
      'ne',
      'make the accent darker but never darker than #1e40af',
    );
    expect(rs[0].text).toContain(
      'already darker than #1e40af in light mode (#1b1b1b), so it cannot get darker there and keep "never darker than #1e40af"',
    );
    expect(writes(rs).some(c => /^set ne accent /.test(c))).toBe(false);
  }, 120_000);

  it('a see-through tint keeps its alpha and hue, never the opaque bound', async () => {
    const w = writes(
      await how('bu', 'make the accent lighter but never lighter than #ffe08a'),
    );
    const muted = w.filter(c => c.includes('--color-accent-muted'));
    for (const c of muted) {
      expect(c).not.toContain("'#ffe08a'");
      expect(c).toMatch(/'#[0-9a-f]{8}'/);
    }
  }, 120_000);
});

describe('a part in a container', () => {
  it.each([['make the links on cards red'], ['make links inside cards red']])(
    '%s: the token on the container, no theme-wide write',
    async ask => {
      const rs = await how('ne', ask);
      expect(writes(rs)).toEqual([
        "set ne --color-text-accent '#dc2626' --on card",
      ]);
      expect(rs.some(r => r.text.includes('cannot keep card apart'))).toBe(
        false,
      );
    },
    120_000,
  );

  it('a container that does not hold the token is said, never a theme-wide write', async () => {
    const rs = await how('ne', 'make links in the sidebar green');
    expect(writes(rs)).toEqual([]);
  }, 120_000);
});

describe('outline buttons in a color', () => {
  it('the outline look, the main button in that color; never a border on every button', async () => {
    const w = writes(await how('ne', 'make the outline buttons red'));
    expect(w).toEqual([
      'set ne buttons outline',
      "set ne border-color '#dc2626' --on button --when variant:primary",
      "set ne color '#dc2626' --on button --when variant:primary",
    ]);
  }, 120_000);

  it('one variant outlined in a color', async () => {
    expect(
      writes(await how('ne', 'make the danger buttons outlined in red')),
    ).toEqual([
      'set ne background-color transparent --on button --when variant:destructive',
      "set ne border 'var(--border-width) solid #dc2626' --on button --when variant:destructive",
      "set ne color '#dc2626' --on button --when variant:destructive",
    ]);
  }, 120_000);
});

describe("the theme's text at an opacity", () => {
  it.each([
    ['make all text 50% transparent', '80'],
    ['make the text half transparent', '80'],
  ])(
    '%s',
    async (ask, alpha) => {
      const w = writes(await how('ne', ask));
      expect(w).toContain(
        `set ne --color-text-primary '#000000${alpha}' --mode light`,
      );
      expect(w.some(c => c.includes('--color-text-secondary'))).toBe(true);
    },
    120_000,
  );
});

describe("padding read on a part's own pieces", () => {
  it("a dialog's padding is never a command palette's; the value and the comparison agree", async () => {
    const value = await how('ne', 'how much padding does the dialog have');
    expect(value[0].text).not.toContain('command-palette');
    expect(value[0].text).toContain('dialog has no padding of its own');
    const cmp = await how(
      'ne',
      'make the card padding equal to the dialog padding',
    );
    expect(writes(cmp)).toEqual([]);
  }, 120_000);

  it("a table's padding, on its cells, is read by the comparison too", async () => {
    expect(
      writes(
        await how('ne', 'make the card padding equal to the table padding'),
      ),
    ).toEqual(['set ne padding 0.5rem --on card']);
  }, 120_000);
});
