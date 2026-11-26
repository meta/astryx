// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A radius named for one corner ("a 4px top left radius") writes that
 * corner only, on every part. On a part that shows no corners of its own
 * and has no edge, it is refused with why, and never widened to all four
 * corners.
 *
 * @position api/theme-edit — tests
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
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-one-corner-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('c', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** Every result of an ask: its set lines, and its text. @param {string} q */
const answer = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'c'});
  const results = data.results ?? [];
  return {
    sets: results
      .flatMap(r => r.commands)
      .flatMap(c => c.split(' && '))
      .filter(c => / editor set /.test(c))
      .map(c => c.replace(/^.* editor set \S+ /, '')),
    text: results.map(r => r.text).join('\n'),
  };
};

describe('a radius named for one corner', () => {
  for (const [corner, longhand] of [
    ['top left', 'border-start-start-radius'],
    ['top right', 'border-start-end-radius'],
    ['bottom left', 'border-end-start-radius'],
    ['bottom right', 'border-end-end-radius'],
  ])
    it(`writes the ${corner} corner only on a part that shows corners`, async test => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        test.skip();
      }
      const {sets} = await answer(`cards with a 4px ${corner} radius`);
      expect(sets, sets.join('\n')).toContain(`${longhand} 4px --on card`);
      expect(sets.join('\n')).not.toMatch(/^border-radius /m);
    }, 240_000);

  it('is refused with why on a part with no edge, never widened to every corner', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    const {sets, text} = await answer('a link with a 4px top left radius');
    expect(sets.join('\n')).not.toMatch(/radius .*--on link\b/);
    expect(text).toMatch(
      /the top-left corner on link: 4px[^\n]*no command does it[^\n]*no background, border or shadow of its own/,
    );
  }, 240_000);

  it('runs after the edge the same ask gives that part', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    const {data} = await themeEditHow(
      'focused links: a shadow and a 4px top left radius',
      {cwd, theme: 'c'},
    );
    const whole = (data.results ?? []).find(r =>
      /^all of it, in order/.test(r.text),
    );
    const sets = (whole?.commands ?? []).map(c =>
      c.replace(/^.* editor set \S+ /, ''),
    );
    const shadow = sets.findIndex(x => /^box-shadow .*--on link\b/.test(x));
    const corner = sets.findIndex(x =>
      /^border-start-start-radius 4px --on link --state focus-visible\b/.test(
        x,
      ),
    );
    expect(shadow, sets.join('\n')).toBeGreaterThan(-1);
    expect(corner, sets.join('\n')).toBeGreaterThan(shadow);
    expect(sets.join('\n')).not.toMatch(/^border-radius /m);
  }, 240_000);
});
