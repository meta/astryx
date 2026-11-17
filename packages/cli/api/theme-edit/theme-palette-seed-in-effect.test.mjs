// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A color family whose fill the theme's own source sets exactly grows
 * its shades from that color, the one the fill shows: a set accent then
 * moves links, icons and the muted tint to shades of the source's color,
 * and the note about the source's color names a shade of it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-palette-seed-in-effect-',
    FIXTURE_PACKAGES,
  );
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('t', {cwd, like: 'neutral'});
  const file = path.join(cwd, 'themes/t/t.theme.ts');
  fs.writeFileSync(
    file,
    fs
      .readFileSync(file, 'utf8')
      .replace(
        "name: 't',",
        "name: 't',\n  tokens: {'--color-accent': ['#9333ea', '#d8b4fe']},",
      ),
  );
  await runCli(['experimental', 'theme', 'compile', 'themes/t/t.theme.ts'], {
    cwd,
  });
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} hex */
const hue = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (!d) return 0;
  const h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

describe('a family whose fill the source sets', () => {
  it('grows its link and icon shades from the source color', async () => {
    if (unbuilt) return;
    const r = /** @type {any} */ (
      await themeEditSet('t', 'accent', '#2563eb', {cwd})
    );
    const css = fs.readFileSync(path.join(cwd, 'themes/t/t.css'), 'utf8');
    const text = /--color-text-accent:\s*light-dark\((#[0-9a-f]{6}),/i.exec(
      css,
    )?.[1];
    expect(text).toBeDefined();
    // (Purple, as #9333ea is, never the blue of the dial value.)
    expect(hue(String(text))).toBeGreaterThan(250);
    expect(hue(String(text))).toBeLessThan(300);
    const note = (r.data?.notes ?? []).find((/** @type {string} */ n) =>
      /your exact color \(#9333ea\)/.test(n),
    );
    if (note) {
      const shade = /\((#[0-9a-f]{6})\), the nearest that reads/.exec(
        note,
      )?.[1];
      expect(hue(String(shade))).toBeGreaterThan(250);
    }
  }, 240_000);
});
