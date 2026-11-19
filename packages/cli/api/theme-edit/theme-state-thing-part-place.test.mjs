// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How reads "<state> <thing> in|of <part>": the part after "in" or
 * "of" is the place, the words before it name an element of it and its
 * state. The page those words seem to name (it holds every part, so it is
 * never inside one) is that element: the part inside the place that takes
 * the state. A part the place may hold stays the part ("links on cards"),
 * and "of" with no state still compares ("twice the padding of buttons").
 * Every line offered is run.
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
    'astryx-theme-state-thing-part-place-',
    FIXTURE_PACKAGES,
  );
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
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

/** Run each line as offered. @param {string[]} lines */
const follow = async lines => {
  for (const line of lines) {
    const args =
      line.match(/'[^']*'|\S+/g)?.map(w => w.replace(/^'|'$/g, '')) ?? [];
    const r = await runCli(['experimental', 'theme', 'editor', ...args], cwd);
    expect(r.status, line).toBe(0);
  }
};

describe('a state of an element in a part', () => {
  it('the current page in pagination is its selected cell, never the page', async () => {
    await themeEditNew('p1', {cwd, like: 'neutral'});
    for (const ask of [
      'make the current page in pagination blue',
      'make the current page of the pagination blue',
    ]) {
      const rs = await how('p1', ask);
      // (Beside it, the readable-text line the fill's own check adds.)
      const lines = writes(
        rs.filter(r => !/^readable text on that fill/.test(r.text)),
      );
      expect(lines, ask).toEqual([
        "set p1 background-color '#2563eb' --on pagination-item --state selected",
      ]);
      expect(lines.join('\n')).not.toMatch(/--color-background-body|app-shell/);
    }
    await follow(
      writes(await how('p1', 'make the current page in pagination blue')),
    );
  }, 240_000);

  it('a part the place may hold stays the part', async () => {
    await themeEditNew('p2', {cwd, like: 'neutral'});
    const lines = writes(await how('p2', 'make links on cards red'));
    expect(lines).toEqual(["set p2 --color-text-accent '#dc2626' --on card"]);
    await follow(lines);
  }, 240_000);
});
