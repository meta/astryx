// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A preview page is hashed in time that grows with its size, never
 * with its depth: a page whose JSX nests deep is read once per element, so
 * add and remove stay fast and still tell a change by hand from a
 * formatter run.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditPreviewAdd,
  themeEditPreviewRemove,
} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {appPackages} from '../../test-utils/theme-edit-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const ROUTE = 'src/app/theme-preview';

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-preview-hash-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    `${JSON.stringify(appPackages({packageManager: 'npm@10.9.0'}))}\n`,
  );
  fs.mkdirSync(path.join(cwd, 'src/app'), {recursive: true});
  fs.writeFileSync(
    path.join(cwd, 'src/app/layout.tsx'),
    "import '@astryxdesign/core/astryx.css';\nexport default function RootLayout({children}) { return children; }\n",
  );
  await themeEditNew('t', {cwd, like: 'neutral'});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** A component whose JSX nests `depth` elements deep. @param {number} depth */
const deep = depth =>
  `\nexport function Deep() {\n  return ${'<div>'.repeat(depth)}x${'</div>'.repeat(depth)};\n}\n`;

describe('a preview page whose JSX nests deep', () => {
  it('is read once per element: a change by hand is told at once', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 't'});
    const page = path.join(cwd, ROUTE, '_pages/overview.tsx');
    fs.appendFileSync(page, deep(25));
    const started = Date.now();
    const r = await themeEditPreviewRemove(undefined, {cwd});
    // Twenty-five levels read twice at each level would be 2^25 reads:
    // slow enough to fail the bound, never so slow that it holds the leg.
    expect(Date.now() - started).toBeLessThan(20_000);
    expect(r.data.notes.join(' ')).toContain('changed by hand');
    expect(fs.existsSync(page)).toBe(true);
    fs.rmSync(path.join(cwd, ROUTE), {recursive: true, force: true});
  }, 60_000);
});
