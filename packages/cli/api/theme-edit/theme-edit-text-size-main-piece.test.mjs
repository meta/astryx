// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A text size said for a part whose text is drawn by elements inside
 * it that each read a text size token goes into its main text's token, the
 * largest as the sizes resolve (a top nav heading's title over its
 * supporting line). Saved as typed; built as the token alone. Refused as
 * before where no one main text can be told. A text column's lines each
 * take it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
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

/** @param {string} slug @param {string} part */
const rule = (slug, part) =>
  new RegExp(`\\.astryx-${part}\\s*\\{[^}]*\\}`).exec(
    fs.readFileSync(path.join(cwd, `themes/${slug}/${slug}.css`), 'utf8'),
  )?.[0] ?? '';

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-text-size-piece-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a text size for a part whose text sits in pieces', () => {
  it(
    'goes into the largest piece token, saved as typed and built alone',
    async () => {
      await themeEditNew('a', {cwd, like: 'neutral'});
      const r = await themeEditSet('a', 'font-size', '20px', {
        cwd,
        on: 'top-nav-heading',
      });
      expect(r.data.notes.join('\n')).toMatch(
        /goes into --text-large-size on top-nav-heading, the size of its main text/,
      );
      expect(r.data.setting.thing).toBe('font-size');
      expect(rule('a', 'top-nav-heading')).toMatch(/--text-large-size:\s*20px/);
      expect(rule('a', 'top-nav-heading')).not.toMatch(
        /--text-supporting-size|(^|[\s;{])font-size:/,
      );
    },
    T,
  );

  it(
    'is undone by the name it was set with',
    async () => {
      await themeEditNew('u', {cwd, like: 'neutral'});
      await themeEditSet('u', 'font-size', '20px', {
        cwd,
        on: 'top-nav-heading',
      });
      await themeEditUndo('u', {
        cwd,
        thing: 'font-size',
        on: 'top-nav-heading',
      });
      expect(rule('u', 'top-nav-heading')).not.toMatch(/--text-large-size/);
    },
    T,
  );

  it(
    'still refuses a value that is no size, or one naming the token itself',
    async () => {
      await themeEditNew('v', {cwd, like: 'neutral'});
      await expect(
        themeEditSet('v', 'font-size', 'red', {cwd, on: 'top-nav-heading'}),
      ).rejects.toThrow();
      await expect(
        themeEditSet('v', 'font-size', 'var(--text-large-size)', {
          cwd,
          on: 'top-nav-heading',
        }),
      ).rejects.toThrow(/never reaches it/);
    },
    T,
  );

  it(
    'refuses where no one main text is drawn (an icon sized by spacing)',
    async () => {
      await themeEditNew('x', {cwd, like: 'neutral'});
      await expect(
        themeEditSet('x', 'font-size', '20px', {cwd, on: 'nav-icon'}),
      ).rejects.toThrow(/never reaches it/);
      // (A part that holds other parts: its buttons and fields keep their
      // own sizes.)
      for (const on of ['popover', 'calendar'])
        await expect(
          themeEditSet('x', 'font-size', '20px', {cwd, on}),
          on,
        ).rejects.toThrow();
    },
    T,
  );

  it(
    "leaves a text column's lines each taking it",
    async () => {
      await themeEditNew('d', {cwd, like: 'neutral'});
      await themeEditSet('d', 'font-size', '14px', {cwd, on: 'banner'});
      expect(rule('d', 'banner')).toMatch(/--text-label-size:\s*14px/);
      expect(rule('d', 'banner')).toMatch(/--text-supporting-size:\s*14px/);
    },
    T,
  );
});
