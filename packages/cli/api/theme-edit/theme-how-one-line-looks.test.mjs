// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How's readers: one-line looks read piece by piece (a
 * lead before a colon, "lots of data", "the blue … more navy", "pastel
 * pink", "dark purple theme", "at night", "red only for alerts", "dark
 * mode first"), the words none reads named; a weight word is no size; a
 * rung set against another is one ask; a heading's size beside its
 * weight; a size after uppercase; a border in one mode on a part with a
 * shadow of its own; the system font; a fill on every button keeps the
 * status variant's color. Every line offered is run.
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
  cwd = makeLinkedFixture('astryx-theme-how-one-line-looks-', FIXTURE_PACKAGES);
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

/** @param {string} name */
const fresh = async name => {
  await themeEditNew(name, {cwd, like: 'neutral'});
  return name;
};

/** The one-step answer's commands. @param {Array<{text: string, commands: string[]}>} rs */
const top = rs => (rs[0]?.commands ?? []).filter(c => /^(set|undo) /.test(c));
/** @param {Array<{text: string}>} rs */
const texts = rs => rs.map(r => r.text).join('\n');

describe('one-line looks', () => {
  it('a bank-like look: blue, dense, the rest named', async () => {
    const rs = await how(
      'q0',
      'clean and trustworthy like a bank: blue and gray, lots of data on screen',
    );
    expect(top(rs)).toEqual([`set q0 accent '#2563eb'`, 'set q0 spacing less']);
    expect(texts(rs)).toMatch(/not taken: "clean", "trustworthy", "bank"/);
    expect(top(await how('q0', 'lots of data on screen'))).toEqual([
      'set q0 spacing less',
    ]);
  }, 240_000);

  it('a moody dark purple look at night', async () => {
    const rs = await how(
      'q0',
      'moody dark purple, big album-art feel, and easy to read at night',
    );
    expect(top(rs)).toEqual([
      'set q0 mode dark-only',
      `set q0 accent '#7c3aed'`,
    ]);
    expect(texts(rs)).toMatch(/not taken: .*"moody"/);
    expect(top(await how('q0', 'dark purple theme'))).toEqual([
      'set q0 mode dark-only',
      `set q0 accent '#7c3aed'`,
    ]);
  }, 240_000);

  it('the theme color named by its hue, a pastel, red for alerts, dark first', async () => {
    const t = await fresh('h1');
    await themeEditSet(t, 'accent', '#2563eb', {cwd});
    expect(
      writes(await how(t, 'make the blue a bit darker, more navy'))[0],
    ).toMatch(new RegExp(`^set ${t} accent '#`));
    expect(
      top(await how('q0', 'cheerful pastel pink theme, rounded and cozy')),
    ).toEqual([`set q0 accent '#f1a9c9'`, 'set q0 corners round']);
    expect(writes(await how('q0', 'red only for alerts'))[0]).toBe(
      `set q0 danger '#dc2626'`,
    );
    expect(
      top(
        await how(
          'q0',
          'urgent but calm, red only for alerts, dark mode first',
        ),
      ),
    ).toEqual([`set q0 danger '#dc2626'`, 'set q0 mode dark-only']);
  }, 240_000);
});

describe('clones', () => {
  it('a weight word is no size; semibold not bold; headings large and bold', async () => {
    expect(writes(await how('q0', 'buttons medium weight'))).toEqual([
      'set q0 font-weight 500 --on button',
    ]);
    expect(writes(await how('q0', 'headings semibold, not bold'))[0]).toBe(
      'set q0 headings semibold',
    );
    const rs = await how('q0', 'large bold headings');
    expect(writes(rs)).toContain('set q0 headings bold');
    expect(writes(rs).some(c => /--text-heading-1-size/.test(c))).toBe(true);
  }, 240_000);

  it('a size after uppercase; the system font; a one-mode border on a part with its own shadow', async () => {
    expect(top(await how('q0', 'table headers uppercase 11px'))).toEqual([
      'set q0 text-transform uppercase --on table-header-cell',
      'set q0 font-size 11px --on table-header-cell',
    ]);
    expect(writes(await how('q0', 'use the system font'))).toEqual([
      'set q0 font system',
    ]);
    const t = await fresh('b1');
    const lines = writes(
      await how(t, 'secondary buttons 1px border #ebebeb in light mode'),
    );
    expect(lines).toEqual([
      `set ${t} border '1px solid light-dark(#ebebeb, transparent)' --on button --when variant:secondary`,
    ]);
    await follow(lines);
  }, 240_000);
});

describe('fills and text', () => {
  it("every button's fill keeps the destructive red", async () => {
    const rs = await how('q0', 'navy buttons');
    expect(writes(rs).join(' ')).not.toMatch(/variant:destructive/);
    expect(texts(rs)).toMatch(/destructive keeps its status color/);
  }, 240_000);
});
