// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A field's placeholder is not its text. A text color that reaches a
 * text input (set on it, or on a member of its family) goes into the text
 * token its value reads, never the secondary one its placeholder reads, so
 * an empty field's placeholder still reads as a hint, not a typed value.
 * Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
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
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-placeholder-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

/** Every declaration block written for text-input. @param {string} slug */
const textInputBlocks = slug =>
  [
    ...fs
      .readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8')
      .matchAll(/\.astryx-text-input\)?[^{]*\{([^}]*)\}/g),
  ].map(m => m[1]);

describe('a text color that reaches a text input', () => {
  it('leaves the secondary color its placeholder reads', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('p', {cwd, like: 'neutral'});
    // A color on the selector reaches the whole inputs family.
    await themeEditSet('p', 'color', '#000000', {
      cwd,
      on: 'selector',
      mode: 'light',
    });
    const blocks = textInputBlocks('p');
    expect(blocks.some(b => /--color-text-primary: #000000;/.test(b))).toBe(
      true,
    );
    expect(blocks.some(b => /--color-text-secondary:/.test(b))).toBe(false);
  }, 240_000);

  it('is offered as the value text color alone', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o', {cwd, like: 'neutral'});
    const e = await themeEditSet('o', 'color', '#000000', {
      cwd,
      on: 'text-input',
      only: true,
    }).catch(x => x);
    expect(String(e?.message ?? e)).not.toMatch(/--color-text-secondary/);
  }, 240_000);
});
