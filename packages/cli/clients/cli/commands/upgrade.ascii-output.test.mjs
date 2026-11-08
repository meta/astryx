// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx upgrade` human output is plain ASCII on every path: the codemod
 * list, up to date, an empty range, a dry run, and an apply that runs a
 * post-codemod hook and refreshes the agent docs.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {generateCompressedIndex} from '../../../foundation/agent-docs/agent-docs.mjs';

const NON_ASCII = /[\u0080-\uFFFF]/;

let tmpDir;

/** @param {string} rel @param {string} body */
function write(rel, body) {
  const file = path.join(tmpDir, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, body);
}

/**
 * Output lines (stdout and stderr) that contain a non-ASCII character.
 * @param {string[]} args
 */
async function nonAsciiLines(args) {
  const r = await runCli(args, {cwd: tmpDir});
  expect(r.status).toBe(0);
  return `${r.stdout}\n${r.stderr}`
    .split('\n')
    .filter(line => NON_ASCII.test(line));
}

beforeEach(() => {
  // Repo-local so the config module can be imported under Vitest.
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-upgrade-ascii-'));
  write('package.json', JSON.stringify({name: 'consumer', private: true}));
  write(
    'node_modules/@astryxdesign/core/package.json',
    JSON.stringify({name: '@astryxdesign/core', version: '0.6.0'}),
  );
  write(
    'src/panel.tsx',
    "import {useResizable} from '@astryxdesign/core';\n" +
      'export const usePanel = () => useResizable({defaultSize: 250, minSizePx: 200});\n',
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('upgrade human output is ASCII', () => {
  it('lists codemods', async () => {
    expect(await nonAsciiLines(['upgrade', '--list'])).toEqual([]);
  });

  it('reports up to date and a missing agent-docs block', async () => {
    expect(await nonAsciiLines(['upgrade', '--from', '0.6.0'])).toEqual([]);
  });

  it('reports a range with no codemods', async () => {
    expect(
      await nonAsciiLines(['upgrade', '--from', '0.6.0', '--force']),
    ).toEqual([]);
  });

  it('previews and applies codemods, runs a hook, and refreshes agent docs', async () => {
    write(
      'astryx.config.mjs',
      `export default {hooks: {postCodemod: [{name: 'noop', buildCommand: () => ({command: ${JSON.stringify(process.execPath)}, args: ['-e', '0']})}]}};\n`,
    );
    write('AGENTS.md', `# Agents\n\n${generateCompressedIndex('0.5.0')}\n`);

    expect(await nonAsciiLines(['upgrade', '--from', '0.5.0'])).toEqual([]);
    expect(
      await nonAsciiLines(['upgrade', '--from', '0.5.0', '--apply']),
    ).toEqual([]);
    expect(fs.readFileSync(path.join(tmpDir, 'src/panel.tsx'), 'utf8')).toContain(
      'minSize: 200',
    );
  });

  // Every fixture above has a real src/, so the completion line for a project
  // whose source is somewhere else was never reached — this suite was green on
  // that path by luck, not by coverage.
  it('reports a source directory that does not exist', async () => {
    fs.rmSync(path.join(tmpDir, 'src'), {recursive: true, force: true});
    fs.mkdirSync(path.join(tmpDir, 'app'), {recursive: true});
    write('app/panel.tsx', 'export const x = 1;\n');

    expect(await nonAsciiLines(['upgrade', '--from', '0.5.0'])).toEqual([]);
    expect(
      await nonAsciiLines(['upgrade', '--from', '0.5.0', '--apply']),
    ).toEqual([]);
  });
});
