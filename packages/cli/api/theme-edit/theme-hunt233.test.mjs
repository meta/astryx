// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file An accent you type is the color its fill keeps, and the color its
 * links and accent text keep wherever it reads on what they sit on; only
 * where it does not do they move, and the result says so. Text on the fill
 * is white or near-black by contrast: button and badge labels are
 * normal-size text and need 4.5:1, and the note names how to keep the
 * other one exactly.
 */

import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
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

/**
 * A page token's value in a theme's built CSS, as `[light, dark]`.
 * @param {string} slug @param {string} token
 * @returns {[string, string]}
 */
const valueOf = (slug, token) => {
  const css = fs.readFileSync(
    path.join(cwd, 'themes', slug, `${slug}.css`),
    'utf8',
  );
  const v = new RegExp(`\\s${token}:\\s*([^;]+);`).exec(css)?.[1]?.trim() ?? '';
  const pair = /^light-dark\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)$/.exec(v);
  return pair
    ? [pair[1].toLowerCase(), pair[2].toLowerCase()]
    : [v.toLowerCase(), v.toLowerCase()];
};

/** @param {string} slug */
const notesOf = async slug =>
  /** @type {string[]} */ (
    /** @type {any} */ ((await themeEditShow(slug, {cwd})).data).colorNotes ??
      []
  ).join('\n');

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt233-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('ios', {cwd, like: 'neutral'});
  await themeEditSet('ios', 'accent', '#007aff', {cwd});
  await themeEditSet('ios', 'danger', '#ff3b30', {cwd});
  await themeEditNew('slk', {cwd, like: 'neutral'});
  await themeEditSet('slk', 'accent', '#4a154b', {cwd});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('an accent you type', () => {
  it('keeps its exact color as the fill', () => {
    expect(valueOf('ios', '--color-accent')[0]).toBe('#007aff');
    expect(valueOf('slk', '--color-accent')[0]).toBe('#4a154b');
  });

  it('is the link color where it reads on what links sit on', () => {
    expect(valueOf('slk', '--color-text-accent')[0]).toBe('#4a154b');
  });

  it('moves links only where it does not read, and says so', async () => {
    expect(valueOf('ios', '--color-text-accent')[0]).not.toBe('#007aff');
    expect(await notesOf('ios')).toMatch(
      /--color-text-accent light: your exact color \(#007aff\) reads at only [\d.]+:1 on .*\(text needs 4\.5:1\), so links and accent text use shade \d+ \(#[0-9a-f]{6}\), the nearest that reads/,
    );
  });
});

describe('text on a fill', () => {
  it('is near-black where white fails 4.5:1, and says how to keep white', async () => {
    expect(valueOf('ios', '--color-on-accent')[0]).not.toBe('#ffffff');
    expect(valueOf('ios', '--color-on-error')[0]).not.toBe('#ffffff');
    const notes = await notesOf('ios');
    expect(notes).toMatch(
      /--color-on-accent uses near-black text in light, not white, .*white text reads at only 4\.02:1 \(button and badge labels are normal-size text, which needs 4\.5:1\); to keep white text anyway, set --color-on-accent exactly/,
    );
  });

  it('is white where white reads', () => {
    expect(valueOf('slk', '--color-on-accent')[0]).toBe('#ffffff');
  });
});
