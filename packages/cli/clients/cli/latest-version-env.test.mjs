// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ASTRYX_LATEST_VERSION is not a CLI control: setting it changes nothing
 * a command prints. It used to append an update hint to `component` and
 * `docs`.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../test-utils/run-cli.mjs';

const VARIABLE = 'ASTRYX_LATEST_VERSION';

/** @type {string} */
let dir;
/** @type {string | undefined} */
let saved;

beforeEach(() => {
  saved = process.env[VARIABLE];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-latest-version-'));
  // A project on an old core, so a "newer version" hint would have a reason to fire.
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: 'app', private: true, dependencies: {'@astryxdesign/core': '^0.0.1'}}),
  );
});

afterEach(() => {
  if (saved === undefined) delete process.env[VARIABLE];
  else process.env[VARIABLE] = saved;
  fs.rmSync(dir, {recursive: true, force: true});
});

describe('ASTRYX_LATEST_VERSION', () => {
  it('does not change what astryx docs prints', async () => {
    delete process.env[VARIABLE];
    const without = await runCli(['docs'], {cwd: dir});
    process.env[VARIABLE] = '999.0.0';
    const withVariable = await runCli(['docs'], {cwd: dir});

    expect(withVariable.status).toBe(without.status);
    expect(withVariable.stdout).toBe(without.stdout);
    expect(withVariable.stderr).toBe(without.stderr);
    expect(withVariable.stderr).not.toMatch(/newer version/i);
  });
});
