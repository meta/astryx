// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A value question that names a status or a state reads that rule's
 * own value (an error input's border, a focused input's, a selected
 * card's), and "how thick is the focus ring" gives the ring's width.
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
    'astryx-theme-value-question-names-status-',
    FIXTURE_PACKAGES,
  );
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('ne', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} ask */
const how = async ask => {
  const {data} = /** @type {any} */ (
    await themeEditHow(ask, {cwd, theme: 'ne'})
  );
  return /** @type {Array<{text: string, commands: string[]}>} */ (
    data.results ?? []
  );
};

describe('a value question with a status or a state', () => {
  it.each([
    [
      'what is the border of error inputs in dark mode',
      /inputs has border-color #ffaea7 in dark mode \(status error\)/,
    ],
    [
      'what is the border color of warning inputs',
      /inputs has border-color #836700 in light mode, #eec448 in dark mode \(status warning\)/,
    ],
    [
      'what is the border of focused inputs in dark mode',
      /inputs has border-color #f1f1f1 in dark mode when focused/,
    ],
    [
      'what is the border of selected cards in dark mode',
      /card has border-color #f1f1f1 in dark mode when selected/,
    ],
    // The plain question keeps the plain rule.
    [
      'what is the border of inputs in dark mode',
      /inputs has border-color #[0-9a-f]{6} in dark mode now/,
    ],
  ])(
    '%s',
    async (ask, want) => {
      const rs = await how(ask);
      expect(rs[0].text).toMatch(want);
      expect(rs.flatMap(r => r.commands).join('\n')).not.toMatch(/ set /);
    },
    120_000,
  );
});

describe('how thick is the focus ring', () => {
  it.each([
    'how thick is the input focus ring',
    'how wide is the focus ring on inputs',
  ])(
    '%s: the ring and its width',
    async ask => {
      const rs = await how(ask);
      expect(rs[0].text).toMatch(
        /inputs draws a 2px box-shadow ring when focused: inset 0 0 0 2px /,
      );
    },
    120_000,
  );
});
