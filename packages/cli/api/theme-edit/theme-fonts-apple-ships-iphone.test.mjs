// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The fonts Apple ships on iPhone and iPad as well as the Mac are
 * named as fonts of Apple platforms, never of macOS only; the Mac-only ones
 * stay macOS. A comma before three digits on a millisecond time groups
 * thousands, as on a pixel length.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {oneSystemOf} from './_tables.mjs';
import {commaNumbers} from './_normal.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;
const APPLE = 'Apple platforms (macOS, iOS and iPadOS)';

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-fonts-apple-ships-iphone-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('the fonts Apple ships', () => {
  it('on iPhone and iPad too are fonts of Apple platforms', () => {
    for (const family of [
      '-apple-system',
      'Apple Color Emoji',
      'Helvetica Neue',
      'PingFang SC',
      'Hiragino Sans',
      'Avenir Next',
      'Futura',
    ])
      expect(oneSystemOf(family), family).toBe(APPLE);
  });

  it('on the Mac only stay macOS', () => {
    for (const family of [
      'BlinkMacSystemFont',
      'Monaco',
      'Lucida Grande',
      'Geneva',
      'Andale Mono',
    ])
      expect(oneSystemOf(family), family).toBe('macOS');
  });

  it(
    'are noted by the platforms that have them',
    async () => {
      const emoji = await themeEditSet(
        't',
        'font',
        '"Apple Color Emoji", sans-serif',
        {cwd},
      );
      expect(emoji.data.notes.join('\n')).toContain(
        `"Apple Color Emoji" ships only on ${APPLE}:`,
      );
      const ui = await themeEditSet('t', 'font', '-apple-system, sans-serif', {
        cwd,
      });
      const said = ui.data.notes.join('\n');
      expect(said).toContain(
        `"-apple-system" names the interface font of ${APPLE}, and only there:`,
      );
      expect(said).not.toContain('only macOS');
      const blink = await themeEditSet(
        't',
        'font',
        'BlinkMacSystemFont, sans-serif',
        {cwd},
      );
      expect(blink.data.notes.join('\n')).toContain(
        '"BlinkMacSystemFont" names the interface font of macOS, and only there:',
      );
    },
    T,
  );
});

describe('a comma before three digits', () => {
  it('groups thousands on a millisecond time, as on a pixel length', () => {
    expect(commaNumbers('1,000ms')).toBe('1000ms');
    expect(commaNumbers('2,500ms')).toBe('2500ms');
    expect(commaNumbers('1,250px')).toBe('1250px');
    // A thousandth of a rem or a second is a real value: a decimal point.
    expect(commaNumbers('1,125rem')).toBe('1.125rem');
    expect(commaNumbers('1,500s')).toBe('1.500s');
    expect(commaNumbers('0,25s')).toBe('0.25s');
  });

  it(
    "repairs transition-duration '1,000ms' to 1000ms, and that line is taken",
    async () => {
      const e = await refusal(() =>
        themeEditSet('t', 'transition-duration', '1,000ms', {
          cwd,
          on: 'button',
        }),
      );
      expect(e.run).toContainEqual(
        expect.stringMatching(/ set t transition-duration 1000ms --on button$/),
      );
      const r = await themeEditSet('t', 'transition-duration', '1000ms', {
        cwd,
        on: 'button',
      });
      expect(r.data.setting).toMatchObject({value: '1000ms'});
    },
    T,
  );
});
