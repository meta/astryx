// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how`: an amount said with a
 * softening word goes the way the words say ("three times as soft" is a
 * third, "half as small" twice); "exactly 36px high" is that height; a
 * later "the text bigger" is the theme's text; a border color keeps only
 * the status and focus colors, never every variant's; and a part made
 * fainter or more transparent moves from what it shows, each variant from
 * its own color, in the state asked.
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
    'astryx-theme-how-amount-softening-word-words-',
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
const answer = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  const results = data.results ?? [];
  const sets = (/** @type {string[]} */ cs) =>
    cs
      .filter(c => / editor set /.test(c))
      .map(c => c.replace(/^.* editor set \S+ /, ''));
  return {
    first: sets(
      results.find(r => r.commands.some(c => / editor set /.test(c)))
        ?.commands ?? [],
    ),
    text: results.map(r => r.text).join('\n'),
  };
};

/** @param {import('vitest').TestContext} test */
const needsBases = test => {
  if (unbuilt) {
    console.warn(`skipped: ${unbuilt}`);
    test.skip();
  }
};

const T = 300_000;

describe('amounts with a softening word', () => {
  it(
    'go the way the words say',
    async test => {
      needsBases(test);
      expect((await answer('make the shadow 3 times as soft')).text).toMatch(
        /softer shadows everywhere: .* alpha ×0\.333/,
      );
      expect((await answer('make the shadow half as soft')).text).toMatch(
        /stronger shadows everywhere: .* alpha ×2/,
      );
      expect((await answer('make the corners half as small')).text).toMatch(
        /each ×2\b/,
      );
      expect((await answer('make the inputs exactly 36px high')).first).toEqual(
        [
          '--size-element-md 36px --on inputs',
          '--size-element-sm 32px --on inputs',
        ],
      );
    },
    T,
  );
});

/** A plain fill on cards: each neutral card variant. @param {string} fill */
const CARDS = fill =>
  ['default', 'transparent', 'muted'].map(
    v => `${fill} --on card --when variant:${v}`,
  );

describe('a later clause about the theme text', () => {
  it(
    'is the theme text, never the part before',
    async test => {
      needsBases(test);
      expect(
        (await answer('make cards red and the text bigger')).first,
      ).toEqual([...CARDS("background-color '#dc2626'"), 'text-size more']);
    },
    T,
  );
});

describe('a border color', () => {
  it(
    'keeps the status and focus colors, never every variant pinned gray',
    async test => {
      needsBases(test);
      const r = await answer('make the selector border red');
      expect(r.first[0]).toBe("border-color '#dc2626' --on selector --only");
      for (const c of r.first.slice(1).filter(x => /^border-color /.test(x))) {
        expect(c).not.toMatch(/--when variant:/);
        expect(c).toMatch(/--when status:|--state focus/);
      }
      expect(r.first).toContain(
        "border-color 'var(--color-border-error)' --on selector --when status:error --only",
      );
    },
    T,
  );
});

describe('a part fainter or more transparent', () => {
  it(
    'moves from what it shows, the way asked',
    async test => {
      needsBases(test);
      const disabled = await answer('make disabled buttons more transparent');
      expect(disabled.first).toEqual([
        'opacity 0.3 --on button --state disabled',
      ]);
      const hover = await answer('make hovered buttons fainter');
      expect(hover.first.length).toBeGreaterThan(1);
      for (const c of hover.first)
        expect(c).toMatch(
          /^background-color '#[0-9a-f]{8}' --on button --when variant:[a-z]+ --state hover/,
        );
      const plain = await answer('make buttons fainter');
      for (const c of plain.first) expect(c).not.toMatch(/--color-border/);
    },
    T,
  );
});
