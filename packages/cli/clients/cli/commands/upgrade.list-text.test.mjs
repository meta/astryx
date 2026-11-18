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

/** @param {string} s */
const flat = s => s.replace(/\s+/g, ' ').trim();

describe('upgrade --list text', () => {
  it('prints each codemod once, on its own line under its version', async () => {
    const json = await runCli(['upgrade', '--list', '--json'], {cwd: tmpDir});
    const codemods = JSON.parse(json.stdout).data;
    const textRun = await runCli(['upgrade', '--list'], {cwd: tmpDir});
    const lines = textRun.stdout.split('\n');
    const names = new Set(codemods.map((/** @type {any} */ c) => c.name));
    const isVersion = (/** @type {string} */ l) => /^\d+\.\d+\.\d+/.test(l);

    expect(textRun.stdout).toContain(
      `${codemods.length} codemods from @astryxdesign/core, oldest first`,
    );
    for (const c of codemods) {
      const at = lines.findIndex(l => l.startsWith(`${c.name} `));
      expect(at, c.name).toBeGreaterThan(-1);
      expect(lines.filter(l => l.startsWith(`${c.name} `))).toHaveLength(1);
      // The codemod's line, with any wrapped continuation lines.
      let end = at + 1;
      while (
        end < lines.length &&
        lines[end].startsWith(' ') &&
        !names.has(lines[end].trim().split(' ')[0])
      ) {
        end++;
      }
      const entry = flat(lines.slice(at, end).join(' '));
      expect(entry).toContain(flat(toAscii(c.title)));
      expect(entry.endsWith('(optional)')).toBe(c.optional);
      // The nearest version line above the codemod is its version.
      expect(lines.slice(0, at).reverse().find(isVersion)).toBe(c.version);
    }
  });
});
