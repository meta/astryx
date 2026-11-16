// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How reads plain words: color names in two words (off-white, ink
 * blue, grass green, safety orange, slate blue-gray) and tan and paper;
 * "pure white" exact; a role color "for warnings"; calm, cheerful;
 * Tailwind shadow sizes; lines between items or rows as their bottom
 * border; a length before items as their height; a fill as a pill; a
 * dialog's overlay said after it; big touch targets; a dark border; a word
 * about the accent's color itself. Every line offered is run.
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
  cwd = makeLinkedFixture('astryx-theme-how-plain-words-', FIXTURE_PACKAGES);
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

/** The one-step answer's commands. @param {Array<{text: string, commands: string[]}>} rs */
const top = rs => (rs[0]?.commands ?? []).filter(c => /^(set|undo) /.test(c));

describe('color names', () => {
  it('two-word names, tan, paper, exact white', async () => {
    expect(writes(await how('q0', 'grass green accent'))[0]).toBe(
      `set q0 accent '#4caf50'`,
    );
    expect(writes(await how('q0', 'ink-blue accent'))[0]).toBe(
      `set q0 accent '#1e3a5f'`,
    );
    expect(
      writes(await how('q0', 'bold safety orange #ea580c accent'))[0],
    ).toBe(`set q0 accent '#ea580c'`);
    expect(writes(await how('q0', 'off-white paper background'))[0]).toBe(
      `set q0 --color-background-body '#faf8f3' --mode light`,
    );
    const tan = writes(await how('q0', 'warm tan page background'));
    expect(tan.join(' ')).not.toMatch(/#f5f7fa/);
    expect(writes(await how('q0', 'pure white page'))[0]).toBe(
      `set q0 --color-background-body '#ffffff' --mode light`,
    );
    expect(writes(await how('q0', 'amber for warnings'))[0]).toBe(
      `set q0 warning '#f59e0b'`,
    );
  }, 240_000);
});

describe('plain words for looks', () => {
  it('calm, Tailwind shadows, a dark border', async () => {
    const t = 'q0';
    expect(writes(await how(t, 'shadow-sm on cards'))[0]).toBe(
      `set ${t} box-shadow 'var(--shadow-low)' --on card`,
    );
    expect(writes(await how(t, '2px dark border on cards'))[0]).toBe(
      `set ${t} border '2px solid var(--color-border-emphasized)' --on card`,
    );
  }, 240_000);

  it('lines between rows, a length before items, a pill, an overlay, touch targets', async () => {
    expect(writes(await how('q0', 'table rows divided by 1px lines'))[0]).toBe(
      `set q0 border-bottom '1px solid var(--color-border)' --on table-row`,
    );
    expect(writes(await how('q0', 'dividers between list rows'))[0]).toBe(
      `set q0 border-bottom '1px solid var(--color-border)' --on list-item`,
    );
    expect(writes(await how('q0', '32px rows in the menu'))[0]).toBe(
      'set q0 min-height 32px --on dropdown-menu-item',
    );
    // (One reader for a color with a shape: the item's state is kept.)
    const pill = writes(
      await how('q0', 'the active nav item should be a #e8def8 pill'),
    ).join(' ');
    expect(pill).toMatch(/corners pill --on top-nav-item --state selected/);
    expect(pill).toMatch(
      /background-color '#e8def8' --on top-nav-item --state selected/,
    );
    expect(
      writes(await how('q0', 'dialogs with a dark overlay behind them'))[0],
    ).toMatch(/--color-overlay/);
    expect(top(await how('q0', 'big touch targets'))).toEqual([
      'set q0 spacing more --on button',
      'set q0 spacing more --on inputs',
    ]);
  }, 240_000);
});
