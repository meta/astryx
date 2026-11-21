// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file When the components cannot be rendered (two copies of React, say),
 * a change is saved and says "saved, not checked" with the cause and its
 * own code; it is never a refusal, and `how` never reports zero readers.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {AstryxError} from '../error.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_parts.mjs', async importOriginal => {
  const real = /** @type {typeof import('./_parts.mjs')} */ (
    await importOriginal()
  );
  const fail = async () => {
    throw new AstryxError(
      "Could not render the components with this project's React: Cannot read properties of null (reading 'use')",
      [],
      'ERR_RENDER_FAILED',
    );
  };
  return {...real, partData: fail, renderGenerated: fail};
});

const {themeEditHow, themeEditNew, themeEditSet} =
  await import('./theme-edit.mjs');

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-unchecked-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('saved, not checked', () => {
  it('new and set save the change and report the cause instead of refusing', async () => {
    const made = await themeEditNew('u', {cwd, like: 'neutral'});
    expect(made.data.notChecked?.code).toBe('ERR_THEME_NOT_CHECKED');
    expect(made.data.preview).toBe(null);
    const r = await themeEditSet('u', '--color-background-body', '#fafafa', {
      cwd,
    });
    expect(r.data.notChecked).toMatchObject({
      code: 'ERR_THEME_NOT_CHECKED',
      cause: expect.stringContaining("reading 'use'"),
    });
    // Nothing was rendered, so `see` names why, not a current preview.html.
    expect(r.data.see).toContain(
      'the change is saved, but the components could not be rendered here',
    );
    expect(r.data.see).toContain("reading 'use'");
    expect(r.data.see).not.toContain('current after this change');
    expect(r.data.see).not.toContain('run it with --png');
    // The same set again, over a preview.html from before (rendered from
    // other settings): not the no-change shortcut, which would call it
    // current; the render is tried again and its cause named.
    fs.writeFileSync(
      path.join(cwd, 'themes/u/preview.html'),
      '<html>old</html>\n',
    );
    const again = await themeEditSet(
      'u',
      '--color-background-body',
      '#fafafa',
      {
        cwd,
      },
    );
    expect(again.data.notChecked?.code).toBe('ERR_THEME_NOT_CHECKED');
    expect(again.data.see).not.toContain('current after this change');
    expect(again.data.see).toContain('could not be rendered here');
    const settings = JSON.parse(
      fs.readFileSync(path.join(cwd, 'themes/u/u.settings.json'), 'utf8'),
    );
    expect(settings.settings[0]).toMatchObject({
      thing: '--color-background-body',
      value: '#fafafa',
    });
  }, 120_000);

  it('how says what it could not check instead of reporting zero readers', async () => {
    const part = /** @type {any} */ (
      (await themeEditHow('button', {cwd})).data
    );
    expect(part.notChecked?.code).toBe('ERR_THEME_NOT_CHECKED');
    const list = /** @type {any} */ (
      (await themeEditHow('', {cwd, list: 'tokens'})).data
    );
    expect(list.items.every((/** @type {any} */ x) => x.readBy === null)).toBe(
      true,
    );
  }, 120_000);
});
