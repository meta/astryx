// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Long one-line looks drop nothing silently: a color for what a status
 * role names in its own words is that status, any other is named;
 * tabular numbers; a word about a color before it; a highlight color no
 * part draws is named, never carried onto the part before; every list of
 * three pieces names what it did not take. Also near-black and tinted
 * grays. Every line offered is run.
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
  cwd = makeLinkedFixture('astryx-theme-how-long-looks-', FIXTURE_PACKAGES);
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
/** @param {Array<{text: string}>} rs */
const texts = rs => rs.map(r => r.text).join('\n');

describe('long looks', () => {
  it('a budgeting look: navy, a status by its own words, tabular numbers, roomy cards', async () => {
    const rs = await how(
      'q0',
      'Give our fintech budgeting app a confident, modern look: deep navy, mint green for positive numbers, coral for overspending, tabular numbers, roomy cards, works in light and dark.',
    );
    // (A color beside pieces that name parts, said as no look of its own,
    // is named as not used.)
    expect(top(rs)).toEqual([
      `set q0 success '#34d399'`,
      'set q0 font-variant-numeric tabular-nums --on app-shell',
      'set q0 spacing more --on card',
    ]);
    // (A color for a thing no status role names in its own words is named,
    // never guessed.)
    expect(texts(rs)).toMatch(
      /not taken: [^:]*"confident"[^:]*"coral for overspending"/,
    );
  }, 240_000);

  it('a school look: a highlight color named, never on buttons', async () => {
    const rs = await how(
      'q0',
      'friendly and dead simple: big buttons, a cheerful sky blue, sunny yellow highlights, high contrast for older parents, light mode only',
    );
    const lines = top(rs);
    expect(lines.join(' ')).not.toMatch(/#eab308/);
    expect(texts(rs)).toMatch(/not taken: [^:]*"highlights"/);
  }, 240_000);

  it('near-black text and tinted grays', async () => {
    expect(writes(await how('q0', 'near-black text'))[0]).toMatch(
      /--color-text-primary '#111111'/,
    );
    expect(writes(await how('q0', 'navy tinted grays'))[0]).toBe(
      `set q0 neutral '#1e3a8a'`,
    );
    expect(writes(await how('q0', 'tabular numbers'))).toEqual([
      'set q0 font-variant-numeric tabular-nums --on app-shell',
    ]);
  }, 240_000);
});
