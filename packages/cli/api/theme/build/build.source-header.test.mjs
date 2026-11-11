// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The `Source:` line of a theme build's generated header, and the check
 *   that compares it.
 * @input A theme source in a subfolder of a temp project, built and checked
 *   with themeBuild.
 * @output The header names the source with `/` on every platform, so outputs
 *   built on one platform are up to date when `--check` runs on another.
 * @position Direct API coverage for the generated header in build.mjs.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const {themeBuild} = await import('./build.mjs');

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-source-header-'));
  fs.mkdirSync(path.join(tmpDir, 'themes'));
  fs.writeFileSync(
    path.join(tmpDir, 'themes', 'ocean.mjs'),
    `export default {name: 'ocean', tokens: {'--color-background': '#fff'}};\n`,
  );
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** The generated outputs that carry a header. */
function outputs() {
  return fs
    .readdirSync(path.join(tmpDir, 'themes'))
    .filter(name => name !== 'ocean.mjs')
    .map(name => path.join(tmpDir, 'themes', name));
}

describe('theme build header Source line', () => {
  it('names the source with `/` whatever the platform separator', async () => {
    await themeBuild(path.join('themes', 'ocean.mjs'), {}, {cwd: tmpDir});

    const css = fs.readFileSync(
      path.join(tmpDir, 'themes', 'ocean.css'),
      'utf8',
    );
    expect(css).toContain(' * Source: themes/ocean.mjs\n');
    expect(css).not.toContain('themes\\ocean.mjs');
  });

  it('reads outputs built on another platform as up to date', async () => {
    await themeBuild(path.join('themes', 'ocean.mjs'), {}, {cwd: tmpDir});
    // The header as a build on macOS or Linux writes it.
    for (const file of outputs()) {
      const text = fs.readFileSync(file, 'utf8');
      fs.writeFileSync(
        file,
        text.replace(/ \* Source: .*\n/u, ' * Source: themes/ocean.mjs\n'),
      );
    }

    const receipt = await themeBuild(
      path.join('themes', 'ocean.mjs'),
      {check: true},
      {cwd: tmpDir},
    );

    expect(receipt?.type).toBe('theme.build.check');
    expect(receipt?.data.stale).toEqual([]);
    expect(receipt?.data.upToDate).toBe(true);
  });
});
