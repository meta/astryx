// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A saved setting's reach is pinned: each setting that reaches beyond its
 * own part records the parts it reached when it was made (`reached`, kept by
 * the setting's identity), and the build, show and the previews keep it there. Parts its
 * family gains later are offered once, with the same line that takes them,
 * and never applied. A setting with no record yet is recorded as it
 * reaches, with no word. `--only` on a setting the theme already holds
 * replaces it, so the look leaves the group. Against real bundled base
 * themes.
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
  it('a setting keeps the reach it was made with; parts its family gains are offered once, never applied', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('grow', {cwd, like: 'neutral'});
    await themeEditSet('grow', 'border-color', '#ff0000', {
      cwd,
      on: 'text-input',
    });
    // The theme as an editor that reached only the field it named saved it.
    const data = saved('grow');
    const key = /** @type {string} */ (
      Object.keys(data.reached ?? {}).find(k => k.startsWith('border-color|'))
    );
    expect(data.reached[key]).toEqual(expect.arrayContaining(['text-area']));
    data.reached[key] = ['text-input'];
    save('grow', data);

    const r = /** @type {any} */ (
      await themeEditSet('grow', 'corners', '4px', {cwd})
    );
    // Built as recorded: the field gained since is not given the color.
    expect(partsWith('grow', 'border-color')).toContain('text-input');
    expect(partsWith('grow', 'border-color')).not.toContain('text-area');
    const offered = /** @type {any[]} */ (r.data.offered ?? []);
    expect(offered).toHaveLength(1);
    expect(offered[0].setting).toMatch(/^border-color = #ff0000 on text-input/);
    expect(offered[0].parts).toEqual(expect.arrayContaining(['text-area']));
    expect(offered[0].run).toMatch(/set grow border-color .*--on text-input/);
    expect(offered[0].run).not.toContain('--only');
    // Said once; the record is unchanged, so the offer stands.
    const again = /** @type {any} */ (
      await themeEditSet('grow', 'corners', '6px', {cwd})
    );
    expect(again.data.offered ?? []).toEqual([]);
    expect(partsWith('grow', 'border-color')).not.toContain('text-area');
    // The offered line takes the parts and records the whole reach.
    await themeEditSet('grow', 'border-color', '#ff0000', {
      cwd,
      on: 'text-input',
    });
    expect(partsWith('grow', 'border-color')).toContain('text-area');
    expect(saved('grow').reached[key]).toEqual(
      expect.arrayContaining(['text-input', 'text-area']),
    );
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
    expect(r.data.offered ?? []).toEqual([]);
    expect(partsWith('old', 'border-color')).toContain('text-area');
    const rec = saved('old').reached ?? {};
    expect(
      rec[
        /** @type {string} */ (
          Object.keys(rec).find(k => k.startsWith('border-color|'))
        )
      ],
    ).toEqual(expect.arrayContaining(['text-area']));
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
