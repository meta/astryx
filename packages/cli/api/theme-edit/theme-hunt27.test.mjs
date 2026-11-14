// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The twenty-seventh pass over `astryx experimental theme editor`: a
 * `lifted` field that is not a list is named, never a crash, and a token the
 * theme's own source sets is named when a dial would change it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt27-', FIXTURE_PACKAGES);
  await themeEditNew('a', {cwd});
  await themeEditSet('a', 'corners', 'small', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {() => Promise<unknown>} run */
async function refusal(run) {
  try {
    await run();
  } catch (error) {
    return /** @type {any} */ (error);
  }
  throw new Error('expected a refusal');
}

const dir = () => path.join(cwd, 'themes/a');

describe('R15-A: lifted that is not a list', () => {
  it.each([5, 'x', [1]])(
    'lifted %j is named, never a crash',
    async lifted => {
      const file = path.join(dir(), 'a.settings.json');
      const kept = fs.readFileSync(file, 'utf8');
      fs.writeFileSync(file, JSON.stringify({...JSON.parse(kept), lifted}));
      try {
        const err = await refusal(() =>
          themeEditSet('a', 'corners', 'pill', {cwd}),
        );
        expect(err.code).toBe('ERR_THEME_INVALID');
        expect(err.message).toContain(`lifted is ${JSON.stringify(lifted)}`);
        expect(err.message).not.toContain('not iterable');
        expect(JSON.stringify(err.suggestions)).toContain(' undo a');
      } finally {
        fs.writeFileSync(file, kept);
      }
    },
    240_000,
  );

  it('the undo it suggests puts the settings back', async () => {
    const file = path.join(dir(), 'a.settings.json');
    await themeEditSet('a', 'corners', 'medium', {cwd});
    fs.writeFileSync(
      file,
      JSON.stringify({...JSON.parse(fs.readFileSync(file, 'utf8')), lifted: 5}),
    );
    await themeEditUndo('a', {cwd});
    expect(
      Array.isArray(JSON.parse(fs.readFileSync(file, 'utf8')).lifted ?? []),
    ).toBe(true);
  }, 240_000);
});

describe('R15-B: a token the own source sets wins over a dial', () => {
  it('set corners notes the token the source sets itself', async () => {
    const ts = path.join(dir(), 'a.theme.ts');
    const kept = fs.readFileSync(ts, 'utf8');
    fs.writeFileSync(
      ts,
      kept.replace(
        /defineTheme\(\{/,
        "defineTheme({\n  tokens: {'--radius-element': '3px'},",
      ),
    );
    try {
      const r = /** @type {any} */ (
        await themeEditSet('a', 'corners', 'pill', {cwd})
      );
      const notes = JSON.stringify(r.data ?? r);
      expect(notes).toContain('a.theme.ts sets --radius-element itself');
    } finally {
      fs.writeFileSync(ts, kept);
    }
  }, 240_000);
});
