// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A var() is read as CSS reads it, a function token: glued after a
 * letter or a digit (`2var(--x)`) it is no reference, and text glued after
 * it (`var(--x)px`) stays a token of its own. Such a value is refused for
 * its grammar, never written and never blamed on the token's kind.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {matchValue, varReferences} from './_css.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;
/** @type {string} */
let fresh;

const file = () => path.join(cwd, 'themes/t/t.settings.json');
const saved = () => JSON.parse(fs.readFileSync(file(), 'utf8')).settings;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-var-glued-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  fresh = fs.readFileSync(file(), 'utf8');
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

beforeEach(() => {
  fs.writeFileSync(file(), fresh);
});

describe('a var() reference', () => {
  it('is a function token: never glued after a letter, a digit, a dot or a dash', () => {
    expect(varReferences('2var(--x)')).toEqual([]);
    expect(varReferences('8pxvar(--x)')).toEqual([]);
    expect(varReferences('calc(var(--x) * 2)')).toEqual([
      {at: 5, text: 'var(--x)'},
    ]);
    expect(matchValue('padding', '2var(--spacing-4)')).toBeNull();
    expect(matchValue('padding', 'var(--spacing-4)px')).toBeNull();
    expect(matchValue('padding', 'var(--spacing-4)')).not.toBeNull();
    expect(matchValue('padding', 'calc(var(--spacing-4) * 2)')).not.toBeNull();
  });
});

describe('a value with text glued to a var()', () => {
  for (const value of [
    '2var(--spacing-4)',
    'var(--spacing-4)px',
    '8pxvar(--spacing-4)',
    'var(--spacing-4) px',
  ]) {
    it(
      `padding "${value}" is refused for its grammar, and nothing is written`,
      async () => {
        const e = await refusal(() =>
          themeEditSet('t', 'padding', value, {cwd, on: 'card'}),
        );
        expect(e.message).toContain(
          `padding takes a value its CSS grammar takes`,
        );
        expect(e.message).not.toContain('is a size');
        // Never the same input again.
        expect(e.run.some((/** @type {string} */ l) => l.includes(value))).toBe(
          false,
        );
        expect(saved()).toEqual([]);
      },
      T,
    );
  }

  it(
    'a token of the wrong kind is still named, and a var() inside a calc() is taken',
    async () => {
      const e = await refusal(() =>
        themeEditSet('t', 'padding', 'var(--color-accent)', {
          cwd,
          on: 'card',
        }),
      );
      expect(e.message).toContain('--color-accent is a color');
      const r = await themeEditSet(
        't',
        'padding',
        'calc(var(--spacing-4) * 2)',
        {
          cwd,
          on: 'card',
        },
      );
      expect(r.data.setting).toMatchObject({
        value: 'calc(var(--spacing-4) * 2)',
      });
    },
    T,
  );
});
