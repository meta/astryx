// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Real-binary e2e smoke — the process boundary the in-process harness
 * cannot cover.
 *
 * Every other CLI suite now drives the program IN-PROCESS via
 * test-utils/run-cli.mjs (createProgram + parseAsync), which is fast and
 * deterministic but deliberately bypasses `bin/astryx.mjs`: the Node-version
 * preflight gate, the realpath-based `importSrc` module resolution, the real
 * `process.exit` code, and the top-level try/catch error boundary. This file is
 * the small, high-signal counterweight that spawns the ACTUAL binary and asserts
 * the things only a real process can prove:
 *
 *   - the bin boots and a happy command exits 0;
 *   - a real command's output reaches stdout across the process boundary;
 *   - failures produce a NON-ZERO real exit code (not just process.exitCode);
 *   - the --json error boundary emits a valid envelope on stdout end-to-end;
 *   - Commander parse errors route through handleCommanderError in the REAL
 *     bin — i.e. the harness's in-process replica of that path matches reality.
 *
 * Keep this SMALL. Behavior/coverage of individual commands lives in their
 * in-process suites; this only guards the boundary. Do not grow it into a
 * per-command spawn suite (that flakiness is exactly what the rollout removed).
 */

import {describe, it, expect, afterAll} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_BIN = path.resolve(__dirname, 'bin', 'astryx.mjs');

/** Spawn the real binary. Returns the raw exit status + captured streams. */
function spawnCli(args) {
  const res = spawnSync(process.execPath, [CLI_BIN, ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Deterministic output: no color, and don't let a CI env flip behavior.
    env: {...process.env, FORCE_COLOR: '0', CI: ''},
  });
  return {
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

describe('e2e smoke: real binary boots + exits (happy paths)', () => {
  it('astryx --version boots and exits 0 with a semver', () => {
    const {status, stdout} = spawnCli(['--version']);
    expect(status).toBe(0);
    expect(stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  it('astryx template --list runs a real command and prints to stdout (exit 0)', () => {
    // `template` is bundled with the CLI (no compiled core needed), so this
    // exercises the full command-load path through the real bin without a build.
    const {status, stdout} = spawnCli(['template', '--list']);
    expect(status).toBe(0);
    expect(stdout.trim().length).toBeGreaterThan(0);
  });
});

describe('e2e smoke: real binary error boundary + exit codes', () => {
  it('unknown command exits non-zero with a stderr message', () => {
    const {status, stderr} = spawnCli(['definitely-not-a-real-command']);
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/unknown command/i);
  });

  it('an unsupported --json command is rejected with a real exit 1 + envelope on stdout', () => {
    // Proves the whole chain across the process boundary: bin boots → Commander
    // runs → preAction --json gate rejects the command → error envelope on
    // stdout → process really exits 1 (not merely process.exitCode set
    // in-process). `theme` is a command group with no output of its own, so it
    // stays off the allowlist.
    const {status, stdout} = spawnCli(['theme', '--json']);
    expect(status).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('error');
    expect(parsed).not.toHaveProperty('type');
  });

  it('a Commander parse error routes through handleCommanderError in the real bin', () => {
    // `theme build` with no <file> fails at parse time (missing argument) BEFORE
    // any command action or core load. In --json mode the real bin must convert
    // that CommanderError into a valid envelope on stdout with a mapped ERR_
    // code and exit 1 — the exact path run-cli.mjs replicates in-process.
    const {status, stdout} = spawnCli(['theme', 'build', '--json']);
    expect(status).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('error');
    expect(parsed.code).toMatch(/^ERR_/);
  });
});

describe('e2e smoke: the bin does not run a project config it was not asked to', () => {
  // The debug handler is loaded before Commander parses, which means
  // `Project.load` — and that EVALUATES the project's config module and loads
  // its integrations. Most commands never did either. Running a project's own
  // code on `astryx --version`, for a project that never opted in, is a cost
  // this feature does not get to impose, so the bin reads the config as text
  // and only loads it when it mentions something that can produce a handler:
  // `debug` (the project's own) or `integrations` (which may export one).
  // A project that lists integrations has asked for those packages' code to
  // run; a project that lists neither has asked for none of this. Only a real
  // process can show the difference.
  const projects = [];

  function project(configBody) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-cfg-'));
    projects.push(dir);
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({name: 'p', version: '1.0.0', type: 'module', private: true}),
    );
    const marker = path.join(dir, 'evaluated');
    fs.writeFileSync(
      path.join(dir, 'astryx.config.mjs'),
      `import {writeFileSync} from 'node:fs';\n` +
        `writeFileSync(${JSON.stringify(marker)}, '1');\n` +
        configBody,
    );
    return {dir, evaluated: () => fs.existsSync(marker)};
  }

  /** @param {{dir: string}} p */
  function runVersion(p) {
    return spawnSync(process.execPath, [CLI_BIN, '--version'], {
      cwd: p.dir,
      encoding: 'utf8',
      timeout: 30_000,
    });
  }

  afterAll(() => {
    for (const dir of projects) fs.rmSync(dir, {recursive: true, force: true});
  });

  it('leaves a config that mentions neither key unevaluated', () => {
    const p = project('export default { experimental: {} };\n');
    expect(runVersion(p).status).toBe(0);
    expect(p.evaluated()).toBe(false);
  });

  it('still loads a config that opts in with debug', () => {
    const p = project('export default { debug: () => {} };\n');
    expect(runVersion(p).status).toBe(0);
    expect(p.evaluated()).toBe(true);
  });

  it('loads a config that declares integrations, which may contribute one', () => {
    const p = project("export default { integrations: ['@acme/widgets'] };\n");
    expect(runVersion(p).status).toBe(0);
    expect(p.evaluated()).toBe(true);
  });
});
