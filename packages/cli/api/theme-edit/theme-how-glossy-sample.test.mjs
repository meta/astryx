// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file "Glossy" writes no sample gradient: a gloss is the part's own color
 * in each mode, so the answer gives the sample as help and writes nothing.
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
  cwd = makeLinkedFixture('astryx-theme-how-glossy-sample-', FIXTURE_PACKAGES);
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

describe('glossy writes no sample', () => {
  it("a brief's glossy buttons and top bar write no gradient", async () => {
    const rs = await how(
      'q0',
      'Surface: glossy gradient buttons and top bar, flat cards.',
    );
    const lines = writes(rs);
    expect(lines.join('\n')).not.toMatch(/linear-gradient/);
    expect(lines).toContain('set q0 box-shadow none --on card');
    // (The sample is offered as help.)
    expect(rs.map(r => r.text).join('\n')).toMatch(
      /a glossy fill on button is a gradient of the part's own color/,
    );
  }, 240_000);
});
