// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Two fills said for one part are a choice in `editor how`. The text
 * color a fill needs to stay readable goes in that fill's own choice, one
 * command line per choice, never as a line of its own; each fill is
 * measured, whichever is said first.
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
  cwd = makeLinkedFixture('astryx-theme-how-clash-fill-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** The choice answer for the checked look. @param {string} q */
const choiceFor = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  const results = /** @type {Array<{text: string, commands: string[]}>} */ (
    data.results ?? []
  );
  return {
    choice: results.find(
      r =>
        /contradict each other/.test(r.text) &&
        r.commands.some(c => /--state checked /.test(c)),
    ),
    results,
  };
};

describe("a clash with a see-through fill or another look's text", () => {
  for (const q of [
    'pressed checkboxes: a #0069d6 fill and a #0069d61a fill',
    'pressed checkboxes: a #0069d61a fill and a #0069d6 fill',
  ])
    it(q, async ({skip}) => {
      if (unbuilt) skip(unbuilt);
      const {choice, results} = await choiceFor(q);
      const blue = choice?.commands.find(c => /'#0069d6'/.test(c)) ?? '';
      expect(blue, q).toMatch(/ && .* color '#ffffff' /);
      const clear = choice?.commands.find(c => /'#0069d61a'/.test(c)) ?? '';
      expect(clear, q).not.toMatch(/&&/);
      expect(
        results.some(r => /^readable text on that fill/.test(r.text)),
      ).toBe(false);
    });
  it('a text color said for another look leaves the clash joined', async ({
    skip,
  }) => {
    if (unbuilt) skip(unbuilt);
    const {data} = await themeEditHow(
      'primary buttons #0000ff, primary buttons #ffff00, secondary buttons white text',
      {cwd, theme: 'n'},
    );
    const results = /** @type {Array<{text: string, commands: string[]}>} */ (
      data.results ?? []
    );
    expect(results.some(r => /^readable text on that fill/.test(r.text))).toBe(
      false,
    );
    const commands = results.flatMap(r => r.commands).join('\n');
    expect(commands).toMatch(
      /background-color '#0000ff' --on button --when variant:primary && .* color '#ffffff' /,
    );
    expect(commands).toMatch(
      /background-color '#ffff00' --on button --when variant:primary && .* color '#000000' /,
    );
  });
});

describe('a clashing fill keeps its text in its own choice', () => {
  for (const q of [
    'pressed checkboxes: a #0069d6 fill and a #eeeeee fill',
    'pressed checkboxes: a #eeeeee fill and a #0069d6 fill',
  ])
    it(q, async ({skip}) => {
      if (unbuilt) skip(unbuilt);
      const {choice, results} = await choiceFor(q);
      expect(choice, q).toBeTruthy();
      // (Two lines, one per fill; the blue fill's line also sets the text.)
      expect(choice?.commands).toHaveLength(2);
      const blue = choice?.commands.find(c => /'#0069d6'/.test(c)) ?? '';
      expect(blue).toMatch(
        /background-color '#0069d6' --on checkbox-indicator --state checked --only && .* color '#ffffff' --on checkbox-indicator --state checked/,
      );
      // (No line of its own writes text for a fill not picked.)
      expect(
        results.some(r => /^readable text on that fill/.test(r.text)),
      ).toBe(false);
    });
});
