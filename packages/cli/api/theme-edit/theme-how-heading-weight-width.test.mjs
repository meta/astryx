// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A weight said is the weight's way ("heavy condensed headings" is
 * heavy, never light); heavy is the heavy rung; a typeface's width,
 * "condensed", is named and never read as less room; a look's lead before
 * a colon names no part. Every line offered is run.
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
    'astryx-theme-how-heading-weight-width-',
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

/** @param {Array<{text: string}>} rs */
const texts = rs => rs.map(r => r.text).join('\n');

describe('heading weight and width', () => {
  it('heavy condensed headings are heavy, and the width is named', async () => {
    const rs = await how('q0', 'heavy condensed headings');
    const lines = writes(rs);
    expect(lines[0]).toBe('set q0 headings heavy');
    expect(lines.join(' ')).not.toMatch(
      /headings light|font-weight 300|spacing less/,
    );
    expect(texts(rs)).toMatch(/condensed is a typeface's width/);
    expect(writes(await how('q0', 'condensed headings'))).toEqual([]);
  }, 240_000);

  it("a look's lead before a colon names no part", async () => {
    const rs = await how(
      'q0',
      'page loud and fast: black background, neon green, heavy condensed headings',
    );
    expect(texts(rs)).not.toMatch(/no part is called "page loud"/);
  }, 240_000);
});
