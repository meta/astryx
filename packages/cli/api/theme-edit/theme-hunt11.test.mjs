// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The eleventh pass over `astryx experimental theme editor`: a list
 * where one theme goes, the end of the corners scale, dial refusals that
 * name the corners dial, property suggestions that work, and focus-within
 * where nothing inside takes focus.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt11-', FIXTURE_PACKAGES);
  await themeEditNew('t', {cwd});
  await themeEditNew('u', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('hunt11', () => {
  it('a list where one theme goes names each theme, never a new one', async () => {
    const r = await refusal(() => themeEditUndo('t,u', {cwd}));
    expect(r.run).toEqual([
      expect.stringMatching(/ show t$/),
      expect.stringMatching(/ show u$/),
    ]);
  });

  it('corners more at pill writes nothing', async () => {
    await themeEditSet('t', 'corners', 'pill', {cwd});
    const before = fs.readFileSync(path.join(cwd, 'themes/t/t.history.json'));
    const r = await refusal(() => themeEditSet('t', 'corners', 'more', {cwd}));
    expect(r.code).toBe('ERR_THEME_NO_EFFECT');
    expect(r.run[0]).toMatch(/ corners less$/);
    expect(fs.readFileSync(path.join(cwd, 'themes/t/t.history.json'))).toEqual(
      before,
    );
  }, 240_000);

  it('a corner word on buttons names the corners dial on the button', async () => {
    const r = await refusal(() => themeEditSet('t', 'buttons', 'pill', {cwd}));
    expect(r.run[0]).toMatch(/ corners pill --on button$/);
  });

  it('a property suggestion is a value the property takes, in the same scope', async () => {
    const ws = await refusal(() =>
      themeEditSet('t', 'white-space', 'no-wrap', {cwd, on: 'button'}),
    );
    expect(ws.run[0]).toMatch(/ white-space nowrap --on button$/);
    const td = await refusal(() =>
      themeEditSet('t', 'text-decoration', 'underlined', {
        cwd,
        on: 'text-area',
        only: true,
      }),
    );
    expect(td.run[0]).toMatch(
      / text-decoration underline --on text-area --only$/,
    );
  });

  it('focus-within where nothing inside takes focus is refused', async () => {
    const r = await refusal(() =>
      themeEditSet('t', 'background-color', '#ff0000', {
        cwd,
        on: 'switch',
        state: 'focus-within',
      }),
    );
    expect(r.code).toBe('ERR_THEME_NO_EFFECT');
    expect(r.message).not.toMatch(/focus-within does/);
  });
});

describe('astracat round 5', () => {
  it('disabled on a part never marked disabled is refused', async () => {
    const r = await refusal(() =>
      themeEditSet('t', 'background', 'red', {
        cwd,
        on: 'card',
        state: 'disabled',
      }),
    );
    expect(r.code).toBe('ERR_THEME_NO_EFFECT');
  });
});
