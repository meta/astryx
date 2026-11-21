// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A stylesheet the editor theme's own source imports for its side
 * effect is named by `show` once that source changes, as the build names
 * it: the built outputs do not carry it, so the app imports it. The editor
 * records such a source as built without a build when the outputs stay the
 * same, and keeps that build's warnings.
 */

import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditShow} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-show-stylesheet-', FIXTURE_PACKAGES);
  await themeEditNew('t', {cwd});
}, 600_000);

afterAll(() => removeLinkedFixture(cwd));

describe('show of a theme whose source imports a stylesheet', () => {
  it('names the stylesheet the outputs do not carry', async () => {
    const dir = path.join(cwd, 'themes', 't');
    fs.writeFileSync(path.join(dir, 'brand.css'), '.brand { color: red; }\n');
    const source = path.join(dir, 't.theme.ts');
    fs.writeFileSync(
      source,
      `import './brand.css';\n${fs.readFileSync(source, 'utf8')}`,
    );
    const result = await themeEditShow('t', {cwd});
    expect(JSON.stringify(result.data)).toContain(
      'themes/t/t.theme.ts imports themes/t/brand.css, which the built outputs do not carry',
    );
  }, 240_000);
});
