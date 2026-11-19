// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How's readers: a value question reads the part the
 * clause reads ("the card title" is its heading) and the secondary text
 * token for "secondary text"; a reference named in a look that draws none
 * of that paint (the ghost button's fill) never gives the plain look's
 * paint; a size named on the other part of a comparison is read in that
 * size or said; "N times fainter" is that share; a part that draws no
 * corners stays as it is under "everything rounder except". Every line
 * offered is run.
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
    'astryx-theme-readers-value-question-part-',
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

/** @param {string} name */
const fresh = async name => {
  await themeEditNew(name, {cwd, like: 'neutral'});
  return name;
};

describe('value questions', () => {
  it('the card title is its heading; the secondary text its own token', async () => {
    const title = await how('q0', 'what color is the card title?');
    expect(title[0].text).toMatch(/^heading has color #[0-9a-f]{6} now/);
    const sec = await how('q0', "what color is the card's secondary text?");
    expect(sec[0].text).toContain(
      '#474747 in light mode, #9e9e9e in dark mode (--color-text-secondary',
    );
    const theme = await how(
      'q0',
      'what color is the secondary text in dark mode?',
    );
    expect(theme[0].text).toContain(
      '#9e9e9e in dark mode (--color-text-secondary)',
    );
  }, 240_000);
});

describe('references and comparisons', () => {
  it('the ghost button draws no fill: never the primary fill', async () => {
    const lines = writes(
      await how('q0', 'make the card the color of the ghost button'),
    );
    expect(lines.join(' ')).not.toContain('--color-accent');
    expect(
      writes(await how('q0', 'make the card the color of the primary button')),
    ).toEqual([`set q0 background-color 'var(--color-accent)' --on card`]);
  }, 240_000);

  it('a size named on the other part is read in that size, or said', async () => {
    const t = await fresh('s1');
    const rs = await how(t, 'make the buttons as tall as the small inputs');
    expect(writes(rs)).toEqual([]);
    expect(rs.map(r => r.text).join(' ')).toMatch(
      /inputs in size sm has no height of its own/,
    );
    const lines = writes(
      await how(t, 'make the inputs as tall as the small buttons'),
    );
    expect(lines).toEqual([
      `set ${t} height 'var(--size-element-sm)' --on inputs`,
    ]);
    await follow(lines);
  }, 240_000);
});

describe('amounts and keeps', () => {
  it('N times fainter is that share', async () => {
    expect(
      (await how('q0', 'make the card text 2 times fainter'))[0].text,
    ).toContain('50% lower (× 0.5)');
  }, 240_000);

  it('everything rounder except a part that draws no corners', async () => {
    const t = await fresh('k1');
    const rs = await how(t, 'make everything rounder except the headings');
    expect(writes(rs)).toEqual([`set ${t} corners more`]);
    expect(rs[0].text).toContain('heading draws no corners');
    await follow(writes(rs));
  }, 240_000);
});
