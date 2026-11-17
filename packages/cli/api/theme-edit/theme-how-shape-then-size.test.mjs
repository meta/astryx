// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A length said after a shape that takes none ("avatars: round,
 * 32px") is the part's size, never its corners; the error text with a
 * color given is its own token, as success and warning text are. Every
 * line offered is run. A status text made darker "for contrast" moves
 * away from each mode's page; a color and a size said for one text are
 * two asks of it; a menu's text size moves only its type size tokens.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-how-shape-then-size-',
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

/** Run each line as offered. @param {string[]} lines */
const follow = async lines => {
  for (const line of lines) {
    const args =
      line.match(/'[^']*'|\S+/g)?.map(w => w.replace(/^'|'$/g, '')) ?? [];
    const r = await runCli(['experimental', 'theme', 'editor', ...args], cwd);
    expect(r.status, line).toBe(0);
  }
};

describe('a shape, then a length', () => {
  it('avatars: round, 32px is round corners and a 32px size', async () => {
    const lines = writes(await how('q0', 'avatars circular, 32px'));
    // (The all-of-it line leads.)
    expect(lines.slice(0, 3)).toEqual([
      'set q0 corners pill --on avatar',
      'set q0 width 32px --on avatar',
      'set q0 height 32px --on avatar',
    ]);
    await follow(lines);
  }, 240_000);

  it('a length after corners said with one stays the corners', async () => {
    expect(writes(await how('q0', 'buttons square, 8px corners'))).toContain(
      'set q0 border-radius 8px --on button',
    );
  }, 240_000);
});

describe('the error text', () => {
  it('a color for it sets its own token', async () => {
    expect(writes(await how('q0', 'error text #b91c1c'))[0]).toMatch(
      /^set q0 --color-text-error '#b91c1c'/,
    );
  }, 240_000);
});

/** @param {string} hex */
const lum = hex => {
  const h = hex.replace('#', '');
  return (
    [0, 2, 4]
      .map(i => parseInt(h.slice(i, i + 2), 16))
      .reduce((a, b) => a + b) / 3
  );
};

describe('status text for contrast', () => {
  for (const [ask, tok] of [
    ['error text should be darker red for contrast', '--color-text-error'],
    ['warning text darker for contrast', '--color-text-warning'],
    ['danger text darker for contrast', '--color-text-error'],
  ])
    it(
      ask,
      async () => {
        const lines = writes(await how('q0', ask));
        const light = lines.find(
          l => l.includes(tok) && / --mode light$/.test(l),
        );
        const dark = lines.find(
          l => l.includes(tok) && / --mode dark$/.test(l),
        );
        expect(light && dark).toBeTruthy();
        // (Darker on the light page, lighter on the dark one.)
        expect(
          lum(/'(#[0-9a-f]{6})'/.exec(String(light))?.[1] ?? '#ffffff'),
        ).toBeLessThan(110);
        expect(
          lum(/'(#[0-9a-f]{6})'/.exec(String(dark))?.[1] ?? '#000000'),
        ).toBeGreaterThan(150);
      },
      240_000,
    );
});

describe('one text, two asks', () => {
  it('a tooltip text color and size are both written', async () => {
    const lines = writes(
      await how(
        'q0',
        'tooltips: dark background, #f5eff7 12px text, 6px corners',
      ),
    );
    expect(lines).toContain("set q0 color '#f5eff7' --on tooltip");
    expect(lines).toContain('set q0 font-size 12px --on tooltip');
  }, 240_000);

  it('menus 14px text moves the type size tokens only', async () => {
    const lines = writes(await how('q0', 'menus 14px text'));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join(' ')).not.toMatch(/--spacing-/);
  }, 240_000);
});
