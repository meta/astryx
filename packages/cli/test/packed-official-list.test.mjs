// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The published package carries the official list that `prepack` derives
 * from the repository: the packed tarball ships it, and it lists what the
 * checkout derives.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';
import {readOfficialList} from '../foundation/discovery/official-list.mjs';
import {
  cliTarball,
  placeCli,
  recyclePlacedCopies,
  tarballFiles,
} from '../test-utils/global-local-fixtures.mjs';

const LIST = 'assets/discover/official-packages.json';
const VERSION = JSON.parse(
  fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'),
).version;

/** @type {string | undefined} */
let work;

afterAll(() => {
  recyclePlacedCopies();
  if (work) fs.rmSync(work, {recursive: true, force: true});
});

describe('the packed official list', () => {
  it('writes the list in prepack and removes it in postpack', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'),
    );
    expect(pkg.scripts.prepack).toContain(
      'scripts/generate-official-packages.mjs',
    );
    expect(pkg.scripts.postpack).toContain(
      'scripts/generate-official-packages.mjs --clean',
    );
  });

  it('ships in the tarball', () => {
    expect(tarballFiles(cliTarball())).toContain(LIST);
  });

  it('lists what the checkout derives from the repository', () => {
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'packed-official-list-'));
    const packed = placeCli(path.join(work, 'cli'), VERSION).dir;
    const shipped = JSON.parse(
      fs.readFileSync(path.join(packed, LIST), 'utf8'),
    );
    expect(shipped).toEqual(readOfficialList());
    expect(shipped.packages.length).toBeGreaterThan(0);
  }, 120_000);
});
