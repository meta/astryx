// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The cached part data is keyed by the code that builds it: a fingerprint
 * of the census source and what it imports, never a number bumped by hand.
 * A cache built by other code is built again.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {partData} from './_parts.mjs';
import {openProject} from './_project.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-census-key-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('k', {cwd, like: 'neutral'});
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('the part data cache key', () => {
  it('is the census code fingerprint, and another one builds it again', async () => {
    const project = await openProject(cwd);
    const file = path.join(project.cacheDir, 'parts.json');
    const first = await partData(project);
    expect(first.censusKey).toMatch(/^[0-9a-f]{16}$/);
    expect('version' in first).toBe(false);
    // A cache another build of the census wrote is never read as this one's.
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(
      file,
      JSON.stringify({...d, censusKey: '0000000000000000', map: {}}),
    );
    const again = await partData(project);
    expect(again.censusKey).toBe(first.censusKey);
    expect(Object.keys(again.map).length).toBeGreaterThan(10);
  }, 240_000);
});
