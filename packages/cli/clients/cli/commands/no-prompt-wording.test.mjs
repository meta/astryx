// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The CLI never asks a question, so no help text, manifest entry or
 * error-code description may say a flag skips a prompt. Each flag's text states
 * what happens without it instead, and the CLI does that.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {doc as errorCodesDoc} from '../../../foundation/response/error-codes.doc.mjs';
import {doc as upgradeFn} from '../../../api/upgrade/upgrade.doc.mjs';

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SLOW = 30_000;

/** @type {string} */
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-no-prompt-'));
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({name: 'consumer'}));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * One option's description from the manifest (subcommands are nested).
 * @param {string} command @param {string} flag
 */
async function optionText(command, flag) {
  const {stdout} = await runCli(['--json', 'manifest'], tmpDir);
  /** @typedef {{name: string, options: Array<{flag: string, description: string}>, subcommands?: ManifestCommand[]}} ManifestCommand */
  /** @param {ManifestCommand[]} list @returns {ManifestCommand | undefined} */
  const find = list => {
    for (const c of list) {
      const hit = c.name === command ? c : find(c.subcommands ?? []);
      if (hit) return hit;
    }
    return undefined;
  };
  const cmd = find(JSON.parse(stdout).data.commands);
  return cmd?.options.find(o => o.flag.includes(flag))?.description ?? '';
}

describe('no help text describes a prompt', () => {
  it('theme eject --overwrite states the refusal, and a refused run writes nothing', async () => {
    const help = await optionText('theme eject', '--overwrite');
    expect(help).not.toMatch(/prompt/i);
    expect(help).toContain('ERR_FILE_EXISTS');
    expect(help).toMatch(/nothing is written/);

    const first = await runCli(['--json', 'theme', 'eject', 'matcha'], tmpDir);
    expect(first.status).toBe(0);
    const {outputDir, files} = JSON.parse(first.stdout).data;
    expect(files.length).toBeGreaterThan(1);
    const dir = path.join(tmpDir, outputDir);
    fs.writeFileSync(path.join(dir, files[0]), '// edited\n');
    fs.rmSync(path.join(dir, files[1]));

    const refused = await runCli(['--json', 'theme', 'eject', 'matcha'], tmpDir);
    expect(refused.status).toBe(1);
    expect(JSON.parse(refused.stdout).code).toBe('ERR_FILE_EXISTS');
    expect(fs.readFileSync(path.join(dir, files[0]), 'utf8')).toBe('// edited\n');
    expect(fs.existsSync(path.join(dir, files[1]))).toBe(false);
  }, SLOW);

  it('upgrade --install-deps names the failure without it, in help and in the API doc', async () => {
    const help = await optionText('upgrade', '--install-deps');
    const param = upgradeFn.params?.find(p => p.name === 'options.installDeps')?.description ?? '';
    for (const text of [help, param]) {
      expect(text).not.toMatch(/prompt/i);
      expect(text).toContain('ERR_DEP_MISSING');
    }
  }, SLOW);

  it('ERR_FILE_EXISTS is described without an interactive mode, in the code set, its doc and the README table', () => {
    const member = errorCodesDoc.members.find(m => m.value === 'ERR_FILE_EXISTS');
    expect(member?.description).toBe('Refused to overwrite an existing file.');

    const source = fs.readFileSync(path.join(CLI_ROOT, 'foundation/response/error-codes.mjs'), 'utf8');
    expect(source).toMatch(/\/\*\* Refused to overwrite an existing file\. \*\/\s*ERR_FILE_EXISTS:/);

    const readme = fs.readFileSync(path.join(CLI_ROOT, 'README.md'), 'utf8');
    const row = readme.split('\n').find(line => line.startsWith('| `ERR_FILE_EXISTS`'));
    expect(row).toMatch(/\| Refused to overwrite an existing file\.\s+\|$/);
  });
});
