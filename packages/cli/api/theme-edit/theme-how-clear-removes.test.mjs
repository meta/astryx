// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file "Clear" said of a removable thing takes it away, as "remove" does:
 * "clear the dark mode card background" gives the card a transparent fill
 * in dark mode. It never reads as a reset of a setting the theme does not
 * have ("already uses the base value"), which left the base's own fill
 * drawn. "Clear my ... changes" and "clear the overrides" stay a reset.
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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-clear-removes-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('ne', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} ask */
const how = async ask => {
  const {data} = /** @type {any} */ (
    await themeEditHow(ask, {cwd, theme: 'ne'})
  );
  return /** @type {Array<{text: string, commands: string[]}>} */ (
    data.results ?? []
  ).map(r => ({
    text: r.text,
    commands: r.commands.map(c => c.replace(/^.*? editor /, '')),
  }));
};

describe('clear said of a removable thing', () => {
  it('takes the dark card background away', async () => {
    const rs = await how('clear the dark mode card background');
    expect(rs.flatMap(r => r.commands)).toContain(
      'set ne background-color transparent --on card --mode dark',
    );
    expect(rs.map(r => r.text).join(' ')).not.toMatch(/already uses the base/);
  }, 120_000);

  it('takes a border or a shadow away', async () => {
    expect(
      (await how('clear the card border')).flatMap(r => r.commands),
    ).toContain('set ne border none --on card');
    expect(
      (await how("clear the card's shadow")).flatMap(r => r.commands),
    ).toContain('set ne box-shadow none --on card');
  }, 120_000);

  it('stays a reset for the changes or overrides', async () => {
    for (const ask of [
      'clear my card background changes',
      'clear the card overrides',
      'clear my changes to the border',
      'clear changes to the card background',
      'clear my background and border changes',
      'clear the card border color',
      'clear the border I added to cards',
      'clear my card border tweaks',
      'clear my modifications to the card border',
      'clear my customizations to the card shadow',
      'clear the border we added to cards',
      'clear the shadow I put on cards',
    ]) {
      const rs = await how(ask);
      expect(
        rs.flatMap(r => r.commands),
        ask,
      ).toEqual([]);
      expect(rs.map(r => r.text).join(' '), ask).toMatch(
        /already uses the base value/,
      );
    }
  }, 120_000);

  it('takes away a thing named after more words', async () => {
    expect(
      (await how('clear the dark mode secondary button background')).flatMap(
        r => r.commands,
      ),
    ).toContain(
      'set ne background-color transparent --on button --when variant:secondary --mode dark',
    );
  }, 120_000);

  it('never removes when clear says what a thing should look like', async () => {
    for (const ask of [
      'links should have a clear underline',
      'give inputs a clear border',
      'give cards a clear shadow',
      'accessible forms: clear borders and focus rings',
      'cards with clear borders and shadows',
      'tables with clear borders between rows',
    ]) {
      const cmds = (await how(ask)).flatMap(r => r.commands).join(' ;; ');
      expect(cmds, ask).not.toMatch(
        /(?:border|box-shadow|text-decoration) none|--focus-outline-width 0px|--border-width 0px/,
      );
    }
  }, 240_000);
});
