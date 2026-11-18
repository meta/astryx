// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A saved setting keeps saying how far it reaches: the build records
 * (`reached`) the parts each setting that reaches beyond its own part
 * writes, and the first change after that reach grows names the setting
 * once, at the top of its result, with the line that keeps it as it was.
 * A setting with no record yet is recorded as it reaches, with no word.
 * `--only` on a setting the theme already holds replaces it, so the look
 * leaves the group. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-saved-reach-', FIXTURE_PACKAGES);
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

/** @param {string} slug */
const settingsFile = slug =>
  path.join(cwd, 'themes', slug, `${slug}.settings.json`);

/** @param {string} slug */
const saved = slug => JSON.parse(fs.readFileSync(settingsFile(slug), 'utf8'));

/** @param {string} slug @param {any} data */
const save = (slug, data) =>
  fs.writeFileSync(settingsFile(slug), JSON.stringify(data, null, 2));

/** @param {string} slug @param {string} prop */
const partsWith = (slug, prop) =>
  [
    ...fs
      .readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8')
      .matchAll(/([^{}]+)\{([^{}]*)\}/g),
  ]
    .filter(m => m[2].includes(`${prop}:`))
    .flatMap(m => [...m[1].matchAll(/\.astryx-([a-z][a-z0-9-]*)/g)])
    .map(m => m[1]);

describe('a saved setting and how far it reaches', () => {
  it('a setting that now reaches more parts than recorded is named once, first in the result', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('grow', {cwd, like: 'neutral'});
    await themeEditSet('grow', 'border-color', '#ff0000', {
      cwd,
      on: 'text-input',
    });
    // The theme as an editor that reached only the field it named saved it.
    const data = saved('grow');
    const key = Object.keys(data.reached ?? {}).find(k =>
      k.startsWith('border-color|'),
    );
    expect(key).toBeTruthy();
    expect(data.reached[key]).toEqual(expect.arrayContaining(['text-area']));
    data.reached[/** @type {string} */ (key)] = ['text-input'];
    save('grow', data);

    const r = /** @type {any} */ (
      await themeEditSet('grow', 'corners', '4px', {cwd})
    );
    const widened = /** @type {any[]} */ (r.data.widened ?? []);
    expect(widened).toHaveLength(1);
    expect(widened[0].setting).toMatch(/^border-color = #ff0000 on text-input/);
    expect(widened[0].parts).toEqual(expect.arrayContaining(['text-area']));
    expect(widened[0].keep).toContain('--on text-input --only');
    // Said once: the record now holds where it reaches.
    const again = /** @type {any} */ (
      await themeEditSet('grow', 'corners', '6px', {cwd})
    );
    expect(again.data.widened ?? []).toEqual([]);
  }, 240_000);

  it('a setting saved with no record is recorded as it reaches, with no word', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('old', {cwd, like: 'neutral'});
    await themeEditSet('old', 'border-color', '#ff0000', {
      cwd,
      on: 'text-input',
    });
    const data = saved('old');
    delete data.reached;
    save('old', data);
    const r = /** @type {any} */ (
      await themeEditSet('old', 'corners', '4px', {cwd})
    );
    expect(r.data.widened ?? []).toEqual([]);
    expect(Object.keys(saved('old').reached ?? {})).toEqual(
      expect.arrayContaining([expect.stringMatching(/^border-color\|/)]),
    );
  }, 240_000);

  it('--only on the same setting replaces it, so the look leaves the group', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('narrow', {cwd, like: 'neutral'});
    await themeEditSet('narrow', 'border-color', '#ff0000', {
      cwd,
      on: 'text-input',
    });
    expect(partsWith('narrow', 'border-color')).toContain('text-area');
    await themeEditSet('narrow', 'border-color', '#ff0000', {
      cwd,
      on: 'text-input',
      only: true,
    });
    const entries = saved('narrow').settings.filter(
      (/** @type {any} */ x) => x.thing === 'border-color',
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].only).toBe(true);
    expect(partsWith('narrow', 'border-color')).not.toContain('text-area');
  }, 240_000);
});
