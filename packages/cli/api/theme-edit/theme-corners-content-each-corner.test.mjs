// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A radius of different corners on a part whose content Core hands
 * each corner to (a card): the result names no single-radius gap for that
 * content, which takes each corner.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-corners-content-each-corner-',
    FIXTURE_PACKAGES,
  );
  await themeEditNew('c', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a card radius of different corners', () => {
  it('names no single radius for the content that reaches its edges', async () => {
    const r = /** @type {any} */ (
      await themeEditSet('c', 'border-radius', '12px 12px 0 0', {
        cwd,
        on: 'card',
      })
    );
    expect((r.data?.notes ?? []).join(' ')).not.toMatch(
      /Core gives it a single radius/,
    );
  }, 240_000);

  it('still names it on a part whose content takes one radius', async () => {
    const r = /** @type {any} */ (
      await themeEditSet('c', 'border-radius', '12px 12px 0 0', {
        cwd,
        on: 'button',
      })
    );
    expect((r.data?.notes ?? []).join(' ')).toMatch(
      /Core gives it a single radius/,
    );
  }, 240_000);

  it('takes a menu radius of different corners', async () => {
    await expect(
      themeEditSet('c', 'border-radius', '0 0 12px 12px', {
        cwd,
        on: 'dropdown-menu',
      }),
    ).resolves.toBeTruthy();
  }, 240_000);
});
