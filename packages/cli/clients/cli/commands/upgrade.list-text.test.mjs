// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * `upgrade --list` text: one line per codemod under its version, with the
 * same codemods, names, titles, versions and optional flags as `--json`.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {toAscii} from '../../../assets/codemods/term-log.mjs';

/** @type {string} */
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-upgrade-list-'));
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('upgrade --list text', () => {
  it('prints each codemod once, on one line under its version', async () => {
    const json = await runCli(['upgrade', '--list', '--json'], {cwd: tmpDir});
    const codemods = JSON.parse(json.stdout).data;
    const textRun = await runCli(['upgrade', '--list'], {cwd: tmpDir});
    const lines = textRun.stdout.split('\n');

    expect(textRun.stdout).toContain(
      `${codemods.length} codemods from @astryxdesign/core, oldest first:`,
    );
    for (const c of codemods) {
      const line = `  ${c.name}: ${toAscii(c.title)}${c.optional ? ' (optional)' : ''}`;
      expect(lines.filter(l => l === line)).toHaveLength(1);
      // The nearest version line above the codemod is its version.
      const at = lines.indexOf(line);
      const version = lines
        .slice(0, at)
        .reverse()
        .find(l => /^\d+\.\d+\.\d+/.test(l));
      expect(version).toBe(c.version);
    }
  });
});
