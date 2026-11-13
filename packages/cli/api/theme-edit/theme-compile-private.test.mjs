// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Settings the editor takes build a theme `compile --check` takes: a part's
 * corner radii are written as CSS properties Core reads (never a private
 * variable), and a padding only Core's private variable could reach is
 * refused.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
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

const THEMES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../themes',
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-compile-private-', FIXTURE_PACKAGES);
  // The bundled themes themselves, as an app that installs them has them.
  for (const like of ['butter', 'neutral']) {
    const link = path.join(
      path.dirname(cwd),
      'node_modules/@astryxdesign',
      `theme-${like}`,
    );
    fs.rmSync(link, {recursive: true, force: true});
    fs.symlinkSync(path.join(THEMES, like), link, 'dir');
  }
}, 120_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug @param {string} file */
const read = (slug, file) =>
  fs.readFileSync(path.join(cwd, 'themes', slug, file), 'utf8');

describe('compile --check takes what the editor builds', () => {
  it('writes corner radii as properties Core reads, never a private variable', async () => {
    await themeEditNew('a', {cwd, like: 'neutral'});
    await themeEditSet('a', 'border-radius', '12px 16px', {cwd, on: 'card'});
    await themeEditSet('a', 'border-radius', '4px 10px', {cwd, on: 'button'});
    const settings = read('a', 'a.settings.ts');
    expect(settings).not.toMatch(/"--_/);
    const css = read('a', 'a.css');
    expect(css).toMatch(/--_card-radius:\s*12px/);
    expect(css).toMatch(/border-top-right-radius:\s*16px/);
    const r = await runCli(
      ['experimental', 'theme', 'compile', 'themes/a/a.theme.ts', '--check'],
      {cwd},
    );
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout + r.stderr).not.toMatch(/private var/);
  }, 240_000);

  it('refuses a chat-composer padding only a private variable could reach', async () => {
    await themeEditNew('c', {cwd, like: 'neutral'});
    /** @type {any} */
    let err;
    try {
      await themeEditSet('c', 'padding', '4px', {cwd, on: 'chat-composer'});
    } catch (e) {
      err = e;
    }
    expect(err?.code).toBe('ERR_THEME_NO_EFFECT');
    expect(read('c', 'c.settings.ts')).not.toMatch(/"--_/);
  }, 240_000);
});
