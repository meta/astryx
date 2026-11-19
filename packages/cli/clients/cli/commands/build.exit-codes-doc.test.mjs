// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx build` documents that a query needs @astryxdesign/core while
 * the playbook does not, and exits as documented without it.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {doc as buildDoc} from './build.doc.mjs';
import {linkThisCliAsProjectCli} from '../../../test-utils/release-fixtures.mjs';

const SLOW = 30_000;

/** @type {string} */
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-no-core-'));
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({name: 'consumer'}));
  // A project whose own CLI answers and that installs no Core: outside a
  // project a copy answers from the Core it carries instead (AST-081 FR3).
  linkThisCliAsProjectCli(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** @param {number} code */
const exitWhen = code => buildDoc.exitCodes?.find(e => e.code === code)?.when ?? '';

describe('astryx build without @astryxdesign/core', () => {
  it('the CommandDoc lists a query without core under exit 1, and both modes exit 1', async () => {
    expect(exitWhen(1)).toMatch(/a query when @astryxdesign\/core cannot be found/);

    const text = await runCli(['build', 'dashboard'], tmpDir);
    const json = await runCli(['--json', 'build', 'dashboard'], tmpDir);
    expect(text.status).toBe(1);
    expect(json.status).toBe(1);
    expect(JSON.parse(json.stdout).error).toMatch(/@astryxdesign\/core/);
  }, SLOW);

  it('the CommandDoc says the playbook needs no core, and it exits 0', async () => {
    expect(exitWhen(1)).toMatch(/the playbook needs no core/);

    const {status, stdout} = await runCli(['--json', 'build'], tmpDir);
    expect(status).toBe(0);
    expect(JSON.parse(stdout).type).toBe('build.help');
  }, SLOW);
});
