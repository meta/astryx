// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` (follow-up): on a theme that draws both
 * modes, a clearly dark card or surface fill goes to dark mode, its own
 * text with it, unless the same answer gives it its own text (a look in
 * every mode); a clearly light whole-theme border color goes to light
 * mode.
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
  cwd = makeLinkedFixture(
    'astryx-theme-how-draws-modes-clearly-dark-',
    FIXTURE_PACKAGES,
  );
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

describe('dark surfaces and light borders by mode', () => {
  it('go to the mode they suit', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    expect(await first('cards #0f1011; main text #f7f8f8')).toEqual([
      "background-color '#0f1011' --on card --when variant:default --mode dark",
      "background-color '#0f1011' --on card --when variant:transparent --mode dark",
      "background-color '#0f1011' --on card --when variant:muted --mode dark",

      "--color-text-primary '#f7f8f8' --mode dark",
    ]);
    expect(await first('dark cards')).toEqual([
      "background-color '#1f2937' --on card --mode dark",
    ]);
    // (Its own text said with it: a look in every mode.)
    expect((await first('navy header with white text'))[0]).toBe(
      "background-color '#1e3a8a' --on app-shell-header",
    );
    expect(await first('body text should be #1a1f36; borders #e3e8ee')).toEqual(
      [
        "--color-text-primary '#1a1f36' --mode light",
        "--color-border '#e3e8ee' --mode light",
      ],
    );
    expect(await first('make the borders #333333')).toEqual([
      "--color-border '#333333'",
    ]);
  }, 300_000);
});
