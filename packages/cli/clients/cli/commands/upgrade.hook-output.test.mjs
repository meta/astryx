// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Subprocess test: a post-codemod hook that prints must not corrupt the
 * `upgrade --json` envelope. Stdout carries exactly one envelope; the hook's
 * output goes to stderr.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {fileURLToPath} from 'node:url';
import {CLI_VERSION} from '../../../test-utils/release-fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', 'bin', 'astryx.mjs');

let tmpDir;

/** @param {string} rel @param {string} body */
function write(rel, body) {
  const file = path.join(tmpDir, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, body);
}

/** @param {string[]} args */
function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: tmpDir,
    encoding: 'utf8',
    timeout: 60_000,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {...process.env, FORCE_COLOR: '0', CI: ''},
  });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-upgrade-hook-output-'));
  write('package.json', JSON.stringify({name: 'consumer', private: true}));
  write(
    'node_modules/@astryxdesign/core/package.json',
    JSON.stringify({name: '@astryxdesign/core', version: CLI_VERSION}),
  );
  write(
    'src/panel.tsx',
    "import {useResizable} from '@astryxdesign/core';\n" +
      'export const usePanel = () => useResizable({defaultSize: 250, minSizePx: 200});\n',
  );
  write(
    'astryx.config.mjs',
    'export default {hooks: {postCodemod: [{name: "noisy", buildCommand: ({files}) => {\n' +
      '  console.log("hook saw " + files.join(","));\n' +
      '  process.stdout.write("hook raw write\\n");\n' +
      '  return null;\n' +
      '}}]}};\n',
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('upgrade post-codemod hook output', () => {
  it('keeps --json stdout to one envelope and sends hook output to stderr', () => {
    const r = runCli([
      '--json',
      'upgrade',
      '--from',
      '0.5.0',
      '--codemod',
      'rename-resizable-pixel-bounds',
      '--apply',
    ]);

    expect(r.signal).toBeNull();
    expect(r.status).toBe(0);
    const envelope = JSON.parse(r.stdout);
    expect(envelope.type).toBe('upgrade.run');
    expect(envelope.data.filesChanged).toBe(1);
    expect(r.stderr).toContain('hook saw src/panel.tsx');
    expect(r.stderr).toContain('hook raw write');
    expect(fs.readFileSync(path.join(tmpDir, 'src/panel.tsx'), 'utf8')).toContain(
      'minSize: 200',
    );
  });
});
