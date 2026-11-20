// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A new part setting that writes the same token reference Core
 * already writes there at rest changes nothing, so it is not written, and
 * the result says so. One whose value only matches what is drawn today
 * (pill corners on a round badge) is the person's own choice: written, and
 * said to match. A theme's own token values count (after the pill token
 * goes square, pill corners on a badge are a change).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
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
  it('pill corners on a round badge are written as their own, and said to match', async () => {
    if (unbuilt) return;
    const r = /** @type {any} */ (
      await themeEditSet('t', 'corners', 'pill', {cwd, on: 'badge'})
    );
    expect(r.data.notes).toContain(
      'badge already draws border-radius 9999px at rest (from var(--radius-full)): this writes 9999px as its own, so it holds if that token changes',
    );
    expect(
      fs.readFileSync(path.join(cwd, 'themes/t/t.settings.json'), 'utf8'),
    ).toContain('badge');
    await themeEditUndo('t', {cwd, thing: 'corners', on: 'badge'});
  }, 240_000);

  it('the token reference Core already writes on a badge is not written', async () => {
    if (unbuilt) return;
    const r = /** @type {any} */ (
      await themeEditSet('t', 'border-radius', 'var(--radius-full)', {
        cwd,
        on: 'badge',
      })
    );
    expect(JSON.stringify(r)).toContain(
      'no change: badge already draws border-radius var(--radius-full) at rest, so',
    );
    expect(
      fs.readFileSync(path.join(cwd, 'themes/t/t.settings.json'), 'utf8'),
    ).not.toContain('badge');
    // (A setting that did nothing is never reported as ok.)
    const cli = await runCli(
      [
        'experimental',
        'theme',
        'editor',
        'set',
        't',
        'border-radius',
        'var(--radius-full)',
        '--on',
        'badge',
      ],
      {cwd},
    );
    expect(cli.stdout).toMatch(/^\[no change\] t: /m);
  }, 240_000);

  it('pill corners on a badge are written after the theme squares the pill token', async () => {
    if (unbuilt) return;
    await themeEditSet('t', '--radius-full', '0px', {cwd});
    const r = /** @type {any} */ (
      await themeEditSet('t', 'corners', 'pill', {cwd, on: 'badge'})
    );
    expect(JSON.stringify(r)).not.toContain('already draws');
    expect(r.data?.styled ?? []).toContain('badge: border-radius 9999px');
    await themeEditUndo('t', {cwd, thing: 'corners', on: 'badge'});
    await themeEditUndo('t', {cwd, thing: '--radius-full'});
  }, 240_000);

  it('a fill Core draws at rest but not when checked is written', async () => {
    if (unbuilt) return;
    const r = /** @type {any} */ (
      await themeEditSet(
        't',
        'background-color',
        'var(--color-background-surface)',
        {cwd, on: 'checkbox-indicator'},
      )
    );
    expect(JSON.stringify(r)).not.toContain('no change: checkbox-indicator');
    await themeEditUndo('t', {
      cwd,
      thing: 'background-color',
      on: 'checkbox-indicator',
    });
  }, 240_000);

  it('a tint Core draws only while pressed is written at rest', async () => {
    if (unbuilt) return;
    const r = /** @type {any} */ (
      await themeEditSet(
        't',
        'background-color',
        'var(--color-overlay-pressed)',
        {cwd, on: 'tree-list-item'},
      )
    );
    expect(JSON.stringify(r)).not.toContain('no change: tree-list-item');
    await themeEditUndo('t', {
      cwd,
      thing: 'background-color',
      on: 'tree-list-item',
    });
  }, 240_000);

  it('a look Core draws only when selected is no reason to skip', async () => {
    if (unbuilt) return;
    const r = /** @type {any} */ (
      await themeEditSet('t', 'box-shadow', 'var(--shadow-low)', {
        cwd,
        on: 'segmented-control-item',
      })
    );
    expect(JSON.stringify(r)).not.toContain(
      'no change: segmented-control-item',
    );
    await themeEditUndo('t', {
      cwd,
      thing: 'box-shadow',
      on: 'segmented-control-item',
    });
  }, 240_000);

  it('a status fill kept at vibrancy names its variants', async () => {
    if (unbuilt) return;
    await themeEditSet('t', 'accent', '#0b5cff', {cwd});
    const r = /** @type {any} */ (
      await themeEditSet('t', 'vibrancy', '40', {cwd})
    );
    const where = /** @type {string[]} */ (r.data?.missedWhere ?? []);
    expect(where).not.toContain('badge at rest');
    await themeEditUndo('t', {cwd, thing: 'vibrancy'});
    await themeEditUndo('t', {cwd, thing: 'accent'});
  }, 240_000);

  it('the missed line names the variant a miss is in', async () => {
    if (unbuilt) return;
    const r = /** @type {any} */ (
      await themeEditSet('t', 'danger', '#e11d48', {cwd})
    );
    const where = /** @type {string[]} */ (r.data?.missedWhere ?? []);
    expect(where).toContain('toast type:error at rest');
    await themeEditUndo('t', {cwd, thing: 'danger'});
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
