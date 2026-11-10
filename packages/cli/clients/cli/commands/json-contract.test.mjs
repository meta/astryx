// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration tests for the global --json contract.
 *
 * These drive the REAL program IN-PROCESS (createProgram + parseAsync via the
 * shared runCli harness), which exercises Commander's preAction hooks, the
 * --json gate, and process.exit end-to-end without a per-assertion subprocess.
 * Assertions:
 *
 *   1. Commands NOT on the JSON_SUPPORTED allowlist reject --json BEFORE
 *      running any side effects (no files written, exit 1, valid JSON
 *      error envelope on stdout).
 *   2. Commands ON the allowlist emit valid JSON envelopes for their common
 *      code paths (success and error).
 *   3. The --version --json variant emits a structured envelope. This one is
 *      intercepted at the bin argv layer (before Commander), so it is the sole
 *      case that must spawn the real binary.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {fileURLToPath} from 'node:url';
import {runCli} from '../../../test-utils/run-cli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_BIN = path.resolve(__dirname, '../bin/astryx.mjs');

// `--version --json` is handled at the bin argv layer (before Commander ever
// runs), so it can only be exercised by spawning the real binary.
function runCliSpawn(args) {
  const res = spawnSync('node', [CLI_BIN, ...args], {
    encoding: 'utf-8',
    timeout: 20_000,
  });
  return {status: res.status, stdout: res.stdout || '', stderr: res.stderr || ''};
}

function parseJson(stdout) {
  // CLI emits a single JSON document. If anything else snuck onto stdout
  // (log output, console.log strings, etc.) JSON.parse will throw —
  // which is exactly the failure mode we want to catch in tests.
  return JSON.parse(stdout);
}

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-json-contract-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('--json contract: rejects before side effects', () => {
  // init used to be the example here: it was off the allowlist, so the gate
  // refused it before it could write half a project. It now returns a receipt
  // of its own, so the side-effect guarantee it demonstrated is covered by the
  // remaining side-effect-free rejections below, and init's own behaviour is
  // asserted in init.behavior.test.mjs.

  it('astryx theme --json (parent, no subcommand) rejects without printing help', async () => {
    const {status, stdout, stderr} = await runCli(['theme', '--json'], {cwd: tmpDir});
    expect(status).toBe(1);
    const parsed = parseJson(stdout);
    expect(parsed.error).toMatch(/theme/);
    // Human help text would mention "Usage:" — must NOT appear on stdout.
    expect(stdout).not.toMatch(/Usage:/);
    expect(stderr).not.toMatch(/Usage:/);
  });

  it('astryx postinstall --json rejects (hidden command not on allowlist)', async () => {
    const {status, stdout} = await runCli(['postinstall', '--json'], {cwd: tmpDir});
    expect(status).toBe(1);
    const parsed = parseJson(stdout);
    expect(parsed).toHaveProperty('error');
  });

  it('error envelope is { error, suggestions? } — never { type, data }', async () => {
    const {stdout} = await runCli(['theme', '--json'], {cwd: tmpDir});
    const parsed = parseJson(stdout);
    expect(parsed).toHaveProperty('error');
    expect(parsed).not.toHaveProperty('type');
    expect(parsed).not.toHaveProperty('data');
  });
});

describe('--json contract: supported commands emit valid envelopes', () => {
  it('astryx --version --json emits { type: "version", data: { version } }', () => {
    const {status, stdout} = runCliSpawn(['--version', '--json']);
    expect(status).toBe(0);
    const parsed = parseJson(stdout);
    expect(parsed.type).toBe('version');
    expect(parsed.data).toHaveProperty('version');
    expect(typeof parsed.data.version).toBe('string');
  });

  it('astryx --json (no subcommand) emits a help envelope', async () => {
    const {status, stdout} = await runCli(['--json']);
    expect(status).toBe(0);
    const parsed = parseJson(stdout);
    expect(parsed.type).toBe('help');
    expect(Array.isArray(parsed.data.commands)).toBe(true);
    expect(Array.isArray(parsed.data.jsonSupported)).toBe(true);
  });

  it('astryx upgrade --json --list returns the codemod list', async () => {
    const {status, stdout} = await runCli(['upgrade', '--json', '--list'], {cwd: tmpDir});
    expect(status).toBe(0);
    const parsed = parseJson(stdout);
    expect(parsed.type).toBe('upgrade.list');
    expect(Array.isArray(parsed.data)).toBe(true);
  });

  it('astryx upgrade --json (already up to date) emits upgrade.status', async () => {
    // Force a no-op range: from > installed target.
    const coreDir = path.join(tmpDir, 'node_modules', '@astryxdesign', 'core');
    fs.mkdirSync(coreDir, {recursive: true});
    fs.writeFileSync(
      path.join(coreDir, 'package.json'),
      JSON.stringify({name: '@astryxdesign/core', version: '0.0.1'}, null, 2),
    );

    const {status, stdout} = await runCli(
      ['upgrade', '--json', '--from', '99.0.0'],
      {cwd: tmpDir},
    );
    expect(status).toBe(0);
    const parsed = parseJson(stdout);
    expect(parsed.type).toBe('upgrade.status');
    expect(parsed.data.status).toBe('up_to_date');
    expect(parsed.data.from).toBe('99.0.0');
    expect(parsed.data.to).toBe('0.0.1');
  });

  it('astryx discover --json (no config) includes meta.configured=false', async () => {
    const {status, stdout} = await runCli(['discover', '--json'], {cwd: tmpDir});
    expect(status).toBe(0);
    const parsed = parseJson(stdout);
    expect(parsed.type).toBe('discover.list');
    expect(parsed.data).toEqual([]);
    expect(parsed.meta.configured).toBe(false);
    // The official list the CLI carries is always a source.
    expect(parsed.meta.sources).toEqual([
      expect.objectContaining({name: 'Astryx', status: 'fresh'}),
    ]);
    expect(parsed.meta.answeredBy).toEqual(expect.any(Object));
  });

  it('astryx template --json emits a typed envelope', async () => {
    const {status, stdout} = await runCli(['template', '--json'], {cwd: tmpDir});
    expect(status).toBe(0);
    const parsed = parseJson(stdout);
    expect(parsed.type).toBe('template.list');
    expect(Array.isArray(parsed.data)).toBe(true);
  });

  it('astryx docs --json emits a typed envelope', async () => {
    const {status, stdout} = await runCli(['docs', '--json'], {cwd: tmpDir});
    expect(status).toBe(0);
    const parsed = parseJson(stdout);
    expect(parsed.type).toMatch(/^docs\./);
  });

  it('astryx doctor --json emits a doctor envelope with checks + summary', async () => {
    // A project that declares @astryxdesign/core but installs none → a FAIL → exit 1.
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      '{"name":"app","dependencies":{"@astryxdesign/core":"*"}}',
    );
    const {status, stdout} = await runCli(['doctor', '--json'], {cwd: tmpDir});
    expect(status).toBe(1);
    const parsed = parseJson(stdout);
    expect(parsed.type).toBe('doctor');
    expect(Array.isArray(parsed.data.checks)).toBe(true);
    expect(parsed.data.summary).toHaveProperty('fail');
    expect(parsed.data.summary.fail).toBeGreaterThan(0);
  });
});

describe('--json contract: the flag describes the envelopes it emits', () => {
  /** @param {string} shape e.g. ` apiVersion, error, code, suggestions? ` */
  const fields = shape => shape.split(',').map(f => f.trim().replace(/\?$/, ''));

  it('names every field of the success and error envelopes', async () => {
    const manifest = parseJson((await runCli(['manifest', '--json'], {cwd: tmpDir})).stdout);
    const {description} = manifest.data.globalOptions.find(o => o.flag === '--json');
    const match = /Success envelope: \{([^}]*)\}.*Error envelope: \{([^}]*)\}/.exec(description);
    expect(match, description).not.toBeNull();
    const [, success, error] = /** @type {RegExpExecArray} */ (match);

    for (const key of Object.keys(manifest)) expect(fields(success)).toContain(key);
    expect(fields(success)).toContain('meta');

    // An unknown command's envelope carries every error field, suggestions included.
    const failure = parseJson((await runCli(['bogus-cmd', '--json'], {cwd: tmpDir})).stdout);
    expect(Object.keys(failure)).toContain('suggestions');
    for (const key of Object.keys(failure)) expect(fields(error)).toContain(key);
  });

  it('the CLI README describes the same envelopes', () => {
    const readme = fs.readFileSync(new URL('../../../README.md', import.meta.url), 'utf8');
    const line = readme
      .split('\n')
      .find(l => l.startsWith('- `--json`: Output as typed JSON envelope:'));
    expect(line, 'README global --json line').toBeDefined();
    const [success, error] = [...String(line).matchAll(/`\{([^}]*)\}`/g)].map(m => fields(m[1]));
    expect(success).toEqual(expect.arrayContaining(['apiVersion', 'type', 'data', 'meta']));
    expect(error).toEqual(expect.arrayContaining(['apiVersion', 'error', 'code', 'suggestions']));
    expect(readme).toContain('{"apiVersion": 1, "type": "component.detail"');
  });
});
