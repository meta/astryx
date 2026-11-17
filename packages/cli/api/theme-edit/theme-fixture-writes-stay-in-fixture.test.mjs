// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A fixture's stand-in base theme is written in the fixture: where a
 * real theme's package is linked in its place (the checkout's own, or the
 * run's one build of it), the link is replaced, and nothing is written
 * through it.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;
/** @type {string} */
let elsewhere;
beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-fixture-writes-', FIXTURE_PACKAGES);
  elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-linked-theme-'));
  fs.writeFileSync(path.join(elsewhere, 'package.json'), '{"name":"real"}\n');
});
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
  if (elsewhere) fs.rmSync(elsewhere, {recursive: true, force: true});
});

describe('a fixture base theme', () => {
  it('replaces a linked package and writes nothing through it', () => {
    const at = path.join(
      path.dirname(cwd),
      'node_modules/@astryxdesign/theme-neutral',
    );
    fs.symlinkSync(elsewhere, at, 'dir');
    writeFixtureBaseTheme(cwd, 'neutral');
    expect(fs.lstatSync(at).isSymbolicLink()).toBe(false);
    expect(fs.existsSync(path.join(at, 'built.js'))).toBe(true);
    expect(fs.readdirSync(elsewhere)).toEqual(['package.json']);
    expect(fs.readFileSync(path.join(elsewhere, 'package.json'), 'utf8')).toBe(
      '{"name":"real"}\n',
    );
  });

  it('lives in a temp folder, outside the checkout', () => {
    const root = path.dirname(cwd);
    expect(root.startsWith(fs.realpathSync(os.tmpdir()))).toBe(true);
  });
});
