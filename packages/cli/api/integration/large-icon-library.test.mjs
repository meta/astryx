// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A very large icon library passes `integration check --strict` and
 * `integration verify`: every file of the package is scanned, every icon the
 * set re-exports from the package's own name is proved, and npm's pack list
 * is read whole.
 *
 * The library is generated at test time (large-icon-library.mjs). Its size
 * comes from ASTRYX_LARGE_ICON_LIBRARY_ICONS: by default it holds enough
 * generated files to pass the old file-scan bound and stays fast. Run the
 * script in that file for a full-size run with times and peak memory.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  LARGE_LIBRARY_NAME,
  runCli,
  writeLargeIconLibrary,
} from '../../test-utils/large-icon-library.mjs';

const COUNT = Number(process.env.ASTRYX_LARGE_ICON_LIBRARY_ICONS ?? 3_000);

/** @type {string} */
let dir;

beforeAll(() => {
  dir = writeLargeIconLibrary(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-large-icons-')),
    {count: COUNT},
  );
}, 300_000);

afterAll(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

describe(`an icon library of ${COUNT} icons`, () => {
  it('passes integration check --strict with every icon checked', () => {
    const run = runCli(dir, ['integration', 'check', '--strict', '--json']);
    const {data} = JSON.parse(run.stdout);

    expect(data).toMatchObject({
      name: LARGE_LIBRARY_NAME,
      errors: 0,
      warnings: 0,
      skipped: [],
      unchecked: 0,
      failed: false,
    });
    const [validate] = data.checks;
    expect(validate.response.data.issues).toEqual([]);
    expect(validate.response.data.iconSets[0].unchecked).toEqual([]);
    expect(run.status).toBe(0);
  }, 300_000);

  it('passes integration verify', () => {
    const run = runCli(dir, ['integration', 'verify', '--json']);
    const {data} = JSON.parse(run.stdout);

    expect(data.issues).toEqual([]);
    expect(data.packable).toBe(true);
    expect(data.tarball.fileCount).toBeGreaterThan(COUNT);
    expect(run.status).toBe(0);
  }, 300_000);
});
