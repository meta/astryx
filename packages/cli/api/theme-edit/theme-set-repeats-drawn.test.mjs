// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A new part setting that writes only what Core already draws there
 * at rest (pill corners on a badge, which is round already) changes nothing
 * on screen, so it is not written, and the result says what is drawn and
 * what to do instead; one that changes the drawing is written and lists
 * what it styled.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-set-repeats-drawn-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('t', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a part setting Core already draws', () => {
  it('pill corners on a badge are not written', async () => {
    if (unbuilt) return;
    const r = /** @type {any} */ (
      await themeEditSet('t', 'corners', 'pill', {cwd, on: 'badge'})
    );
    const text = JSON.stringify(r);
    expect(text).toContain(
      'no change: badge already draws border-radius 9999px at rest, so corners = pill on badge was not written; to change it, set another value',
    );
    const saved = fs.readFileSync(
      path.join(cwd, 'themes/t/t.settings.json'),
      'utf8',
    );
    expect(saved).not.toContain('badge');
    // (A setting that did nothing is never reported as ok.)
    const cli = await runCli(
      [
        'experimental',
        'theme',
        'editor',
        'set',
        't',
        'corners',
        'pill',
        '--on',
        'badge',
      ],
      {cwd},
    );
    expect(cli.stdout).toMatch(
      /^\[no change\] t: corners = pill on badge already shows; nothing written/m,
    );
  }, 240_000);

  it('square corners on a badge are written and styled', async () => {
    if (unbuilt) return;
    const r = /** @type {any} */ (
      await themeEditSet('t', 'corners', 'square', {cwd, on: 'badge'})
    );
    expect(JSON.stringify(r.data?.styled ?? r.styled)).toMatch(
      /badge: border-radius 0px/,
    );
    expect(JSON.stringify(r)).not.toContain('this changes nothing you see');
  }, 240_000);
});
