// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file release-fixtures.test.mjs
 * @input The project-CLI fixture builder
 * @output Proof that a fixture project links a CLI that really resolves
 * @position Test utility coverage for the shared release fixtures
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {linkThisCliAsProjectCli} from './release-fixtures.mjs';

/** @type {string[]} */
const made = [];

function tempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-project-cli-'));
  made.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of made.splice(0)) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

describe('linkThisCliAsProjectCli', () => {
  it('links a fixture project to this CLI package on disk', () => {
    const dir = tempProject();
    linkThisCliAsProjectCli(dir);

    const link = path.join(dir, 'node_modules', '@astryxdesign', 'cli');
    // realpathSync throws ENOENT when a link's target is missing, which is
    // what a percent-encoded (and therefore nonexistent) package folder
    // produces: the link itself is created whether or not the target exists.
    const target = fs.realpathSync(link);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(target, 'package.json'), 'utf8'),
    );
    expect(manifest.name).toBe('@astryxdesign/cli');
    expect(
      fs.existsSync(
        path.join(target, ...manifest.bin.astryx.split('/').filter(Boolean)),
      ),
    ).toBe(true);
  });
});
