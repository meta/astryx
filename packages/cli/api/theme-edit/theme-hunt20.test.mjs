// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The twentieth pass over `astryx experimental theme editor`: a bare
 * number on a length gets px, a part named by its class or component, what
 * a look dial writes read from the build, unknown states, and a sheet that
 * matches the build after an undo.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt20-', FIXTURE_PACKAGES);
  await themeEditNew('b', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('hunt20', () => {
  it('1: a bare number on a length suggests px, keeping every flag', async () => {
    const r = await refusal(() =>
      themeEditSet('b', 'padding', '4 8', {cwd, on: 'button', state: 'hover'}),
    );
    expect(r.run[0]).toMatch(/ padding '4px 8px' --on button --state hover$/);
  });

  it('2: a part named by its class or component names the part', async () => {
    for (const on of ['.astryx-card', 'astryx-card', '<Card>', 'Card']) {
      const r = await refusal(() =>
        themeEditSet('b', 'background', 'red', {cwd, on}),
      );
      expect(r.run[0], on).toMatch(/ background red --on card$/);
    }
  });

  it('3/4: a look dial under an exact property says so, and its undo names the dial', async () => {
    await themeEditSet('b', 'text-transform', 'none', {cwd, on: 'button'});
    const set = await themeEditSet('b', 'buttons', 'caps', {cwd});
    expect(set.data.notes.join(' ')).toMatch(
      /text-transform = none on button is an exact property and wins over buttons/,
    );
    const undo = await themeEditUndo('b', {
      cwd,
      thing: 'text-transform',
      on: 'button',
    });
    expect(/** @type {any} */ (undo.data).now).toMatch(/buttons = caps/);
  }, 240_000);

  it('5: an unknown state maps to the one meant, else names the part', async () => {
    const pressed = await refusal(() =>
      themeEditSet('b', 'background', 'red', {
        cwd,
        on: 'button',
        state: 'pressed',
      }),
    );
    expect(pressed.run[0]).toMatch(/--state active$/);
    const open = await refusal(() =>
      themeEditSet('b', 'background', 'red', {cwd, on: 'card', state: 'open'}),
    );
    expect(open.run[0]).toMatch(/ how card$/);
  });

  it('R12-A: after a change and its undo the sheet carries no banner', async () => {
    await themeEditNew('s', {cwd});
    await themeEditShow('s', {cwd});
    const sheet = path.join(cwd, 'themes/s/sheet.html');
    await themeEditSet('s', 'info', '#0000ff', {cwd});
    expect(fs.readFileSync(sheet, 'utf8')).toMatch(/older than the theme/);
    const r = await themeEditUndo('s', {cwd});
    expect(/** @type {any} */ (r.data).sheetStale).toBeUndefined();
    expect(fs.readFileSync(sheet, 'utf8')).not.toMatch(/older than the theme/);
  }, 240_000);
});
