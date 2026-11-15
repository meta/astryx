// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file An undo names what it took back in its headline, text and JSON
 * alike, and says when the last command was refused and changed nothing,
 * so the undo took back the change before it.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
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

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-undo-headline-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('v', {cwd, like: 'neutral'});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('an undo headline', () => {
  it('names the setting it took back, in the text headline and the JSON', async () => {
    await themeEditSet('v', 'neutral', '#78716c', {cwd});
    const text = await runCli(
      ['experimental', 'theme', 'editor', 'undo', 'v'],
      cwd,
    );
    expect(text.stdout.split('\n')[0]).toBe(
      '[ok] v: undid neutral = #78716c (whole theme)',
    );
    await themeEditSet('v', 'neutral', '#78716c', {cwd});
    const r = await themeEditUndo('v', {cwd});
    expect(/** @type {any} */ (r.data).undid).toBe(
      'neutral = #78716c (whole theme)',
    );
    expect(/** @type {any} */ (r.data).refusedBefore).toBeUndefined();
  }, 120_000);

  it('says a refused last command changed nothing, and what the undo took back instead', async () => {
    await themeEditSet('v', 'corners', 'pill', {cwd});
    await refusal(() => themeEditSet('v', 'neutral', 'banana', {cwd}));
    const r = await themeEditUndo('v', {cwd});
    expect(/** @type {any} */ (r.data).undid).toBe(
      'corners = pill (whole theme)',
    );
    expect(/** @type {any} */ (r.data).refusedBefore).toBe(
      'the last command (experimental theme editor set v neutral banana) was refused and changed nothing, so this undid the change before it',
    );
  }, 120_000);

  it('names each change of a step that took back several', async () => {
    await themeEditSet('v', 'corners', 'pill', {cwd});
    await themeEditSet('v', 'base', 'none', {cwd});
    const r = await themeEditUndo('v', {cwd});
    expect(/** @type {any} */ (r.data).undid).toMatch(
      /^base none \(back to neutral\)$|changes: /,
    );
  }, 120_000);
});
