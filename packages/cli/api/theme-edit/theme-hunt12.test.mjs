// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The twelfth pass over `astryx experimental theme editor`: a build
 * is judged by its content, never by file times, and a tab's disabled
 * state is the one Core marks.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
import {loadTheme, staleBuild} from './_settings.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt12-', FIXTURE_PACKAGES);
  await themeEditNew('a', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('R8-C: a build judged by content', () => {
  it('a settings module saved again with the same bytes is not stale', async () => {
    await themeEditSet('a', 'corners', 'pill', {cwd});
    const ts = path.join(cwd, 'themes/a/a.settings.ts');
    fs.writeFileSync(ts, fs.readFileSync(ts));
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(ts, later, later);
    expect(staleBuild(cwd, 'a', loadTheme(cwd, 'a'))).toBeNull();
  }, 240_000);

  it('a build left by another CLI than the settings module is stale', () => {
    const css = path.join(cwd, 'themes/a/a.css');
    const text = fs.readFileSync(css, 'utf8');
    fs.writeFileSync(
      css,
      text.replace(/(\* CLI: @astryxdesign\/cli@)\S+/, '$10.0.1'),
    );
    expect(staleBuild(cwd, 'a', loadTheme(cwd, 'a'))).toMatch(/did not finish/);
    fs.writeFileSync(css, text);
  });
});

describe('a tab marked disabled', () => {
  it('takes --state disabled', async () => {
    await themeEditSet('a', 'opacity', '0.5', {
      cwd,
      on: 'tab',
      state: 'disabled',
    });
    expect(fs.readFileSync(path.join(cwd, 'themes/a/a.css'), 'utf8')).toMatch(
      /\.astryx-tab:is\(:disabled,\[aria-disabled="true"\]/,
    );
    await themeEditUndo('a', {cwd});
  }, 240_000);
});

describe('a theme name with a space', () => {
  it('is one name, not a list', async () => {
    await themeEditNew('my-theme', {cwd});
    const {refusal} = await import('../../test-utils/theme-edit-fixture.mjs');
    const r = await refusal(() => themeEditUndo('My Theme', {cwd}));
    expect(r.run[0]).toMatch(/ show my-theme$/);
    expect(r.message).not.toMatch(/more than one theme/);
  }, 240_000);
});
