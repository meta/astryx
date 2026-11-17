// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` reads "twice as thin / small / narrow / short / tight"
 * as half of now in that way, keeping what the words change: a divider's
 * line, a border's width, the text size, the room inside.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

/** @type {string} */
let cwd;
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-twice-as-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} q */
const first = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  const r = (data.results ?? []).find(x =>
    x.commands.some(c => / editor set /.test(c)),
  );
  return (r?.commands ?? [])
    .filter(c => / editor set /.test(c))
    .map(c => c.replace(/^.* editor set \S+ /, ''));
};

describe('twice as thin', () => {
  it('is half of now in that way, on what the words change', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    expect(await first('make dividers twice as thin')).toEqual([
      '--border-width 0.5px --on divider',
    ]);
    expect(await first('make card borders twice as thin')).toEqual([
      'border-width 0.5px --on card',
    ]);
    expect(await first('make the text twice as small')).toEqual([
      'text-size less',
    ]);
    expect(await first('make the padding twice as tight')).toEqual([
      'spacing less',
    ]);
  }, 300_000);
});
