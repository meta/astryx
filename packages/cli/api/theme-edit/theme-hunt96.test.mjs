// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The input reader's small cases: a radius typed with its unit keeps
 * its size, a size worked out from constant math, no unit guessed for a
 * bare number, percentage math in a color mix, two color names run
 * together, label forms read as flags, a font list in single quotes, mode
 * labels in a one-mode theme, and an old keyword no browser applies.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt96-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('b', {cwd, like: 'neutral'});
  await themeEditNew('d', {cwd, like: 'neutral'});
  await themeEditSet('d', 'mode', 'dark-only', {cwd});
}, 240_000);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {() => Promise<unknown>} run */
async function refusal(run) {
  try {
    await run();
  } catch (error) {
    return /** @type {any} */ (error);
  }
  throw new Error('expected a refusal');
}
const names = (/** @type {any} */ e) =>
  (e.suggestions ?? []).map((/** @type {any} */ x) => x.name);

describe('a typed value is offered as typed', () => {
  it.each(
    /** @type {Array<[string, string, string, Record<string, string>, RegExp]>} */ ([
      ['b', 'radius', '1rem', {}, / set b corners 16px$/],
      ['b', 'radius', '10PX', {}, / set b corners 10px$/],
      ['b', 'radius', 'banana', {}, / how corners$/],
      ['b', 'rounded', '0.5rem', {}, / set b corners 8px$/],
      ['b', 'text-size', 'calc(16px + 2px)', {}, / set b text-size 18$/],
      ['b', 'text-size', 'calc(1rem + 2px)', {}, / set b text-size 18$/],
      ['b', 'text-size', '1.5', {}, / how text-size$/],
      ['b', 'corners', '0.5', {}, / how corners$/],
      // navyblue is no CSS color name: no part of it is guessed.
      ['b', 'accent', 'navyblue', {}, / how accent$/],
      [
        'b',
        'corners',
        'on button: pill',
        {},
        / set b corners pill --on button$/,
      ],
      [
        'b',
        'padding',
        'state=hover 4px',
        {on: 'button'},
        / set b padding 4px --on button --state hover$/,
      ],
      ['b', 'accent', 'light: red dark: blue', {}, / set b accent red$/],
      [
        'b',
        '--color-accent',
        'light: red dark: blue',
        {},
        / set b --color-accent 'light-dark\(red, blue\)'$/,
      ],
      [
        'b',
        'cursor',
        'hand',
        {on: 'button'},
        / set b cursor pointer --on button$/,
      ],
      ['d', '--color-accent', 'light: red', {}, / set d mode both$/],
      ['d', 'accent', 'light: red; dark: blue', {}, / set d accent blue$/],
    ]),
  )('%s %s %j', async (slug, thing, value, flags, line) => {
    const err = await refusal(() =>
      themeEditSet(slug, thing, value, {cwd, ...flags}),
    );
    expect(names(err)[0]).toMatch(line);
  });
});

describe('valid input that is read', () => {
  it('a color-mix share written as percentage math', async () => {
    for (const share of ['calc(50% * 1)', 'calc(25% + 25%)'])
      await themeEditSet(
        'b',
        '--color-accent',
        `color-mix(in srgb, red ${share}, blue)`,
        {cwd},
      );
  }, 240_000);

  it('a font list in single quotes, as a JS config writes it', async () => {
    const r = /** @type {any} */ (
      await themeEditSet('b', 'font', "['Georgia', 'serif']", {cwd})
    );
    expect(JSON.stringify(r.data)).toContain('Georgia, serif');
  }, 240_000);

  it('in a dark-only theme, the dark label is the value', async () => {
    const r = /** @type {any} */ (
      await themeEditSet('d', '--color-accent', 'dark: #2563eb', {cwd})
    );
    expect(JSON.stringify(r.data)).toContain('#2563eb');
  }, 240_000);
});
