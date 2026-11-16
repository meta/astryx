// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` writes nothing for what asks nothing: a tag question,
 * a question about how the theme is now beside a look it names, a
 * question about what a dial does, sarcasm carried by the case, a past
 * hypothetical, a change timed to a later event, and an ask that takes
 * back a setting the theme does not have. In a sequence, the later step
 * says where it ends. Real asks beside a question still write.
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
  cwd = makeLinkedFixture('astryx-theme-how-non-asks-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} q */
const writes = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  return (data.results ?? [])
    .flatMap(r => r.commands)
    .filter(c => / editor (?:set|undo) /.test(c))
    .map(c => c.replace(/^.* editor (?:set|undo) \S+ /, ''));
};

/** @param {import('vitest').TestContext} test */
const needsBases = test => {
  if (unbuilt) {
    console.warn(`skipped: ${unbuilt}`);
    test.skip();
  }
};

const T = 300_000;

describe('a screen named by what it shows', () => {
  // (No part to paint; its status colors by hue are the status colors.)
  it(
    'medical records table view: status colors by hue',
    async test => {
      needsBases(test);
      const lines = await writes(
        'medical records table view: clear status colors: green #15803d stable, amber #b45309 pending, red #b91c1c critical',
      );
      expect(lines.join(' ')).not.toMatch(/--on table/);
      expect(lines).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/success '#15803d'/),
          expect.stringMatching(/warning '#b45309'/),
          expect.stringMatching(/danger '#b91c1c'/),
        ]),
      );
    },
    T,
  );
});

describe('writes nothing', () => {
  it.each([
    "spacing is compact, isn't that so",
    'cards no border. is the shadow still there?',
    'what does spacing less do',
    'yes because neon green links are SO professional',
    'had we gone with serif headings',
    'after the review, square the buttons',
    'accent red; also undo the corners',
  ])(
    '%s',
    async (q, test) => {
      needsBases(test);
      expect(await writes(q)).toEqual([]);
    },
    T,
  );
});

describe('still writes', () => {
  it.each([
    [
      'square avatars please; is that even a thing?',
      'corners square --on avatar',
    ],
    ['set font to Inter; does that need an import?', 'font inter'],
    ['make it SO much rounder', 'corners more'],
    ['no shadows!? on cards', 'box-shadow none --on card'],
    // (A focus ring draws no shadow: "no shadows" after it is the theme's.)
    ['visible thick focus ring, no shadows', '--shadow-low none'],
    ['boutons arrondis, sans ombre', 'box-shadow none --on button'],
  ])(
    '%s',
    async (q, line, test) => {
      needsBases(test);
      expect(await writes(q)).toContain(line);
    },
    T,
  );
  it(
    'a sequence ends at its later step',
    async test => {
      needsBases(test);
      const lines = await writes('make it compact, then make it roomy');
      expect(lines).toContain('spacing more');
      expect(lines).not.toContain('spacing less');
      // (Without "then", the two contradict: choices, never a sequence.)
      const both = await writes('compact spacing and roomy spacing');
      expect(both).toEqual(['spacing compact', 'spacing roomy']);
    },
    T,
  );
});
