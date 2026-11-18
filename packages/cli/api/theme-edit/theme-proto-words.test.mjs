// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The names of JavaScript's object built-ins (`constructor`,
 * `__proto__`, `toString`…) typed as a value, a scope or a flag get the
 * same refusal any unknown word gets: no lookup table answers for them.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {DIALS} from './_tables.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

// The page renders cost seconds and these tests read only refusals.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;

/** Every name on Object.prototype, and the two that reach it by other means. */
const WORDS = [
  ...new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype']),
];

/**
 * The code a call is refused with, or 'ok'. A crash (a TypeError, not an
 * Astryx error) has no code.
 * @param {() => Promise<unknown>} fn
 */
async function outcome(fn) {
  try {
    await fn();
    return 'ok';
  } catch (e) {
    const code = /** @type {any} */ (e)?.code;
    return typeof code === 'string' && code !== 'ERR_UNKNOWN'
      ? code
      : `crash: ${String(/** @type {any} */ (e)?.message)}`;
  }
}

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-proto-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('p', {cwd, like: 'neutral'});
}, 120_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('object built-in names as user words', () => {
  it('every dial refuses them as a value', async () => {
    /** @type {string[]} */
    const crashes = [];
    for (const dial of Object.keys(DIALS))
      for (const word of WORDS) {
        const r = await outcome(() => themeEditSet('p', dial, word, {cwd}));
        if (r.startsWith('crash')) crashes.push(`${dial} ${word}: ${r}`);
      }
    expect(crashes).toEqual([]);
  }, 300_000);

  it('a token, a property, a scope, a state and a how question refuse them', async () => {
    /** @type {string[]} */
    const crashes = [];
    for (const word of WORDS)
      for (const [
        label,
        call,
      ] of /** @type {Array<[string, () => Promise<unknown>]>} */ ([
        ['token', () => themeEditSet('p', '--color-accent', word, {cwd})],
        [
          'property',
          () => themeEditSet('p', 'background', word, {cwd, on: 'card'}),
        ],
        ['--on', () => themeEditSet('p', 'background', 'red', {cwd, on: word})],
        [
          '--state',
          () =>
            themeEditSet('p', 'background', 'red', {
              cwd,
              on: 'button',
              state: word,
            }),
        ],
        [
          '--when',
          () =>
            themeEditSet('p', 'background', 'red', {
              cwd,
              on: 'button',
              when: word,
            }),
        ],
        ['thing', () => themeEditSet('p', word, 'red', {cwd})],
        ['how', () => themeEditHow(word, {cwd, theme: 'p'})],
        ['how part', () => themeEditHow(`${word} border`, {cwd, theme: 'p'})],
      ])) {
        const r = await outcome(call);
        if (r.startsWith('crash')) crashes.push(`${label} ${word}: ${r}`);
      }
    expect(crashes).toEqual([]);
  }, 300_000);

  it('new refuses them for a flag and a name', async () => {
    /** @type {string[]} */
    const crashes = [];
    for (const word of WORDS)
      for (const [
        label,
        call,
      ] of /** @type {Array<[string, () => Promise<unknown>]>} */ ([
        ['--accent', () => themeEditNew('q', {cwd, settings: {accent: word}})],
        ['--like', () => themeEditNew('q', {cwd, like: word})],
        [
          '--corners',
          () => themeEditNew('q', {cwd, settings: {corners: word}}),
        ],
      ])) {
        const r = await outcome(call);
        if (r.startsWith('crash')) crashes.push(`${label} ${word}: ${r}`);
      }
    expect(crashes).toEqual([]);
  }, 300_000);
});
