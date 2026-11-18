// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` answers that hold together: no rounding anywhere
 * reaches the parts drawn as pills, a part and an aspect alone say what to
 * look at, thick borders on everything reach every border (and the
 * surfaces that draw none), and a border color on a part keeps the colors
 * Core gives it by status and focus.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {pillDrawnRadios} from './_check.mjs';
import {context} from './_context.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

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
  cwd = makeLinkedFixture('astryx-theme-hunt155-', FIXTURE_PACKAGES);
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
  return {
    first: (
      results.find(r => r.commands.some(c => / editor set /.test(c)))
        ?.commands ?? []
    ).map(c => c.replace(/^.* editor /, '')),
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

const T = 180_000;

describe('answers that hold together', () => {
  it(
    'no rounding anywhere squares the pills too, and names them',
    async test => {
      needsBases(test);
      const r = await answer('no rounding anywhere, badges and switches too');
      // On a Core that draws a radio's circle with the pill token, the
      // radio marks keep it at Core's value.
      const radios = pillDrawnRadios((await context(cwd)).C);
      expect(r.first).toEqual([
        'set n corners square',
        'set n --radius-full 0px',
        ...radios.map(
          m =>
            `set n --radius-full 9999px --on ${m}${m === 'radio-indicator' ? ' --only' : ''}`,
        ),
      ]);
      expect(r.text).toMatch(/badge/);
      expect((await answer('corners square')).first).toEqual([
        'set n corners square',
      ]);
    },
    T,
  );
  it(
    'a part and an aspect alone say what to look at',
    async test => {
      needsBases(test);
      const r = await answer('toast background');
      expect(r.first).toEqual([]);
      expect(r.text).toMatch(/names toast and what to look at/);
    },
    T,
  );
  it(
    'thick black borders on everything reach every border',
    async test => {
      needsBases(test);
      const r = await answer('thick black borders on everything');
      expect(r.first.slice(0, 3)).toEqual([
        'set n --border-width 2px',
        "set n --color-border '#000000'",
        "set n --color-border-emphasized '#000000'",
      ]);
      expect(r.first).toContain("set n border '2px solid #000000' --on dialog");
      // A popover draws a fixed line of its own, which the shared width
      // does not widen: it gets its own border too.
      expect(r.first).toContain(
        "set n border '2px solid #000000' --on popover",
      );
    },
    T,
  );
  it(
    'a border color on inputs keeps the status and focus colors',
    async test => {
      needsBases(test);
      const r = await answer('thick black borders on inputs and popovers');
      expect(r.first[0]).toBe("set n border '2px solid #000000' --on inputs");
      expect(r.first).toContain(
        "set n border-color 'var(--color-border-error)' --on inputs --when status:error",
      );
      expect(r.first).toContain(
        "set n border-color 'var(--color-accent)' --on inputs --state focus-within",
      );
      const card = await answer('card border red');
      expect(card.first.join('\n')).not.toMatch(
        /'var\(--color-border\)' --on card --when variant:default/,
      );
    },
    T,
  );
});
