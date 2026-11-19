// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Words read as what they say: a weight word before the text it
 * describes, however many words about the text sit between ("thin elegant
 * headings"); a reader, which is no header; and a CSS custom property
 * pasted from a stylesheet, whose last words name what it sets, never the
 * prefix a codebase repeats (`--brand-bg` is a background).
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-words-weight-word-text-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** The commands a how answer gives. @param {string} ask */
const how = async ask => {
  const r = JSON.parse(
    (
      await runCli(
        [
          'experimental',
          'theme',
          'editor',
          'how',
          ask,
          '--theme',
          't',
          '--json',
        ],
        cwd,
      )
    ).stdout,
  );
  return /** @type {Array<{commands?: string[]}>} */ (r.data?.results ?? [])
    .flatMap(x => x.commands ?? [])
    .map(c => c.replace(/^.*? editor /, ''));
};

describe('a weight word before the text it describes', () => {
  for (const ask of [
    'thin headings',
    'thin elegant headings (with wide letter spacing)',
    'thin refined titles',
  ])
    it(
      `"${ask}" is the weight, never a border`,
      async () => {
        const cmds = await how(ask);
        expect(cmds.join(' ')).toMatch(/headings light|font-weight 300/);
        expect(cmds.join(' ')).not.toMatch(/\bborder\b/);
      },
      T,
    );
});

describe('a reader is no header', () => {
  for (const [ask, line] of [
    ['book reader app: huge text', /text-size|font-size/],
    ["children's book reader: roomy spacing", /spacing roomy/],
  ])
    it(
      `"${ask}" changes the theme, not app-shell-header`,
      async () => {
        const cmds = await how(ask);
        expect(cmds.join(' ')).toMatch(line);
        expect(cmds.join(' ')).not.toMatch(/app-shell-header/);
      },
      T,
    );
});

describe('CSS custom properties pasted from a stylesheet', () => {
  it(
    'read what their last words name, never the prefix a codebase repeats',
    async () => {
      const cmds = await how(
        '--brand-primary: #4f46e5; --brand-bg: #f9fafb; --brand-text: #111827; --brand-radius: 6px',
      );
      const all = cmds.join(' || ');
      expect(all).toMatch(/accent '#4f46e5'/);
      expect(all).toMatch(/--color-background-body '#f9fafb'/);
      expect(all).toMatch(/--color-text-primary '#111827'/);
      expect(all).toMatch(/corners 6px/);
      // The page color is never written as the accent.
      expect(all).not.toMatch(/accent '#f9fafb'/);
    },
    T,
  );

  it(
    "the editor's own token names are read as those tokens",
    async () => {
      const cmds = await how('--color-accent: #4f46e5');
      expect(cmds.join(' ')).toMatch(
        /--color-accent '#4f46e5'|accent '#4f46e5'/,
      );
    },
    T,
  );
});
