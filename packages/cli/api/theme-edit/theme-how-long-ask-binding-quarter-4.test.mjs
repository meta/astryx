// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Quarter 4 of the long asks that once wrote on the wrong part
 * (the table in test-utils/long-ask-binding-rows): no answer writes
 * theme-wide, or on a part, beyond the ones listed for it. The binding
 * rules themselves are read in theme-how-long-ask-binding. The asks are
 * split four ways so each file stays fast.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {linesBeyond} from '../../test-utils/long-ask-binding-rows.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-how-binding-q-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** The first answer that writes, as lines, and every result's text. @param {string} q */
const answer = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  const results =
    /** @type {Array<{text: string, commands: string[], offer?: boolean}>} */ (
      data.results ?? []
    );
  const writes = results.find(
    r => !r.offer && r.commands.some(c => / editor set /.test(c)),
  );
  return {
    lines: (writes?.commands ?? [])
      .filter(c => / editor set /.test(c))
      .map(c => c.replace(/^.* editor set \S+ /, '')),
    text: results.map(r => r.text).join('\n'),
  };
};

describe('long asks bind each clause to its own part', () => {
  it('quarter 4: no answer writes beyond its own parts and theme words', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    expect(await linesBeyond(answer, 3)).toEqual([]);
  }, 300_000);
});
