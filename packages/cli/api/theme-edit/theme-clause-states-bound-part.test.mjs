// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` reads a clause that only states a bound on a part as
 * a limit on the asks said with it, before or after them: it never becomes
 * an ask of its own nor the part of those asks, and each answer that
 * reaches the part holds it at the bound.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import fs from 'node:fs';
import path from 'node:path';

// The assertions are about settings, builds, notes and lines, not rendered
// pages: a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-clause-states-bound-part-',
    FIXTURE_PACKAGES,
  );
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/**
 * The answer's first command list, as set takes it.
 * @param {string} q
 * @param {string} [theme]
 */
const answer = async (q, theme = 'n') => {
  const {data} = await themeEditHow(q, {cwd, theme});
  const results = data.results ?? [];
  const r = results.find(x => x.commands.some(c => / editor set /.test(c)));
  return {
    text: results.map(x => x.text).join('\n'),
    first: (r?.commands ?? [])
      .filter(c => / editor set /.test(c))
      .map(c => c.replace(/^.* editor set \S+ /, '')),
  };
};

/**
 * One command line's words, as the shell reads them.
 * @param {string} line
 */
const words = line =>
  [...line.matchAll(/'([^']*)'|(\S+)/g)].map(m => m[1] ?? m[2]);

/** @param {import('vitest').TestContext} test */
const needsBases = test => {
  if (unbuilt) {
    console.warn(`skipped: ${unbuilt}`);
    test.skip();
  }
};

const T = 300_000;

describe('a bound said with the asks', () => {
  it.each([
    'never make buttons rounder than 10px; make everything rounder',
    'make everything rounder; never make buttons rounder than 10px',
  ])(
    '%s: the asks stay whole and the part is held, in either order',
    async (q, test) => {
      needsBases(test);
      const r = await answer(q);
      expect(r.first).toEqual([
        'corners more',
        '--radius-element 10px --on button',
      ]);
      expect(r.text).toMatch(/button held at 10px/);
    },
    T,
  );
  it(
    'following each line builds the bound: buttons at 10px, cards rounder',
    async test => {
      needsBases(test);
      await themeEditNew('f', {cwd, like: 'neutral'});
      const r = await answer(
        'never make buttons rounder than 10px; make everything rounder',
        'f',
      );
      for (const line of r.first) {
        const [thing, value, ...rest] = words(line);
        /** @type {Record<string, string>} */
        const flags = {};
        for (let i = 0; i < rest.length; i += 2)
          flags[rest[i].replace(/^--/, '')] = rest[i + 1];
        await themeEditSet('f', thing, value, {cwd, ...flags});
      }
      const css = fs.readFileSync(path.join(cwd, 'themes/f/f.css'), 'utf8');
      expect(css).toMatch(
        /\.astryx-button[^{]*\{[^}]*--radius-element:\s*10px/,
      );
    },
    T,
  );
  it(
    'a bound the asks already keep is said as within it',
    async test => {
      needsBases(test);
      const r = await answer(
        'never make cards rounder than 40px, make everything rounder',
      );
      expect(r.first).toEqual(['corners more']);
      expect(r.text).toMatch(/card is \d+px, within it/);
    },
    T,
  );
});
