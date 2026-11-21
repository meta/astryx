// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A weight word in a list of asks ("white 11px normal text") is read
 * by the weight reader: once an answer writes that weight, the word is not
 * named as one no setting reads. A word no reader takes still is.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-weight-word-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** Every answer's text and lines. @param {string} q */
const answer = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 't'});
  const results = /** @type {any[]} */ (data.results ?? []);
  return {
    text: results.map(r => r.text).join('\n'),
    lines: results.flatMap(r => r.commands ?? []).join('\n'),
  };
};

describe('a weight word in a list of asks', () => {
  it(
    'is read, never named as a word left out',
    async () => {
      const a = await answer(
        'primary buttons: white 11px normal text, padding 2px 15px 3px',
      );
      expect(a.lines).toMatch(
        /font-weight 400 --on button --when variant:primary/,
      );
      expect(a.text).not.toMatch(/not taken: [^\n]*"normal"/);
    },
    T,
  );

  it(
    'leaves a word no reader takes named',
    async () => {
      const a = await answer(
        'primary buttons: white 11px blorpish text, padding 2px 15px 3px',
      );
      expect(a.text).toMatch(/not taken: [^\n]*"blorpish"/);
    },
    T,
  );
});
