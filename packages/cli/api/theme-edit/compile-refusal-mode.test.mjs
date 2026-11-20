// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The editor's compile refusals (from a subfolder, its settings file,
 * --family) suggest a compile that keeps --check and --icons-specifier.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {editorCompileProblem} from './_adapter.mjs';
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
  cwd = makeLinkedFixture('astryx-compile-mode-', FIXTURE_PACKAGES);
  await themeEditNew('g', {cwd});
}, 240_000);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const MODE = {check: true, iconsSpecifier: "./my icons's.mjs"};
const TAIL = /--icons-specifier '\.\/my icons'\\''s\.mjs' --check$/;

describe('editor compile refusals keep the mode', () => {
  it('from a subfolder', async () => {
    const sub = path.join(cwd, 'src', 'app');
    fs.mkdirSync(sub, {recursive: true});
    const r = await editorCompileProblem(['../../themes/g/g.theme.ts'], {
      cwd: sub,
      ...MODE,
    });
    expect(r?.suggestions?.[0]?.name).toMatch(TAIL);
  }, 240_000);

  it('its settings file', async () => {
    const r = await editorCompileProblem(['themes/g/g.settings.ts'], {
      cwd,
      ...MODE,
    });
    expect(r?.suggestions?.[0]?.name).toMatch(
      / experimental theme compile themes\/g\/g\.theme\.ts --icons-specifier/,
    );
    expect(r?.suggestions?.[0]?.name).toMatch(TAIL);
  }, 240_000);

  it('--family', async () => {
    const r = await editorCompileProblem(['themes/g/g.theme.ts'], {
      cwd,
      family: true,
      ...MODE,
    });
    expect(r?.suggestions?.[0]?.name).toMatch(TAIL);
  }, 240_000);

  it('--out is kept: the settings file names the same output, a subfolder rebases it onto the root', async () => {
    const r = await editorCompileProblem(['themes/g/g.settings.ts'], {
      cwd,
      check: true,
      out: 'dist/g.css',
    });
    expect(r?.suggestions?.[0]?.name).toMatch(
      / experimental theme compile themes\/g\/g\.theme\.ts --out dist\/g\.css --check$/,
    );
    const sub = path.join(cwd, 'src');
    fs.mkdirSync(sub, {recursive: true});
    const s = await editorCompileProblem(['../themes/g/g.theme.ts'], {
      cwd: sub,
      check: true,
      out: '../dist/g.css',
    });
    expect(s?.suggestions?.[0]?.name).toMatch(
      /^cd \.\. && .* experimental theme compile themes\/g\/g\.theme\.ts --out dist\/g\.css --check$/,
    );
  }, 240_000);
});
