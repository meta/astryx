// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration tests for the JSON shim — extends the --json
 * contract to cover Commander's parse-time short-circuits.
 *
 * Spawns the CLI as a real subprocess so Commander hooks, exitOverride,
 * and process.exit fire end-to-end. Asserts:
 *
 *   1. `--help --json` (root + subcommand) emits a JSON help envelope,
 *      not raw "Usage:" text. Exit 0.
 *   2. Parse errors (missing required arg, unknown option) emit a
 *      JSON error envelope on stdout. Exit 1.
 *   3. Unknown subcommand produces an error envelope (not a help
 *      envelope with exit 0).
 *   4. Invalid `--detail` choice produces a single error envelope
 *      (not error then help).
 *   5. Non-`--json` invocations still print to stderr and exit 1
 *      exactly as before — no regression.
 */

import {describe, it, expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Command} from 'commander';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {installJsonShim} from './json-shim.mjs';
import {setJsonMode} from '../../../foundation/response/json.mjs';

function parseJson(stdout) {
  return JSON.parse(stdout);
}

describe('--json shim: --help renders JSON envelope', () => {
  it('astryx --help --json emits a help envelope (not raw text), exit 0', async () => {
    const {status, stdout, stderr} = await runCli(['--help', '--json']);
    expect(status).toBe(0);
    expect(stderr).toBe('');
    const parsed = parseJson(stdout);
    expect(parsed.apiVersion).toBe(1);
    expect(parsed.type).toBe('help');
    expect(parsed.data).toBeDefined();
    expect(parsed.data.command).toBe('astryx');
    // Should list known subcommands
    const subNames = parsed.data.subcommands.map((s) => s.name);
    expect(subNames).toContain('component');
    expect(subNames).toContain('theme');
  });

  it('astryx component --help --json emits a subcommand help envelope', async () => {
    const {status, stdout} = await runCli(['component', '--help', '--json']);
    expect(status).toBe(0);
    const parsed = parseJson(stdout);
    expect(parsed.apiVersion).toBe(1);
    expect(parsed.type).toBe('help');
    expect(parsed.data.command).toBe('astryx component');
    // Should expose its options
    const flags = parsed.data.options.map((o) => o.flags);
    expect(flags).toContain('--list');
  });

  it('astryx theme build --help --json emits a nested subcommand help envelope', async () => {
    const {status, stdout} = await runCli(['theme', 'build', '--help', '--json']);
    expect(status).toBe(0);
    const parsed = parseJson(stdout);
    expect(parsed.apiVersion).toBe(1);
    expect(parsed.type).toBe('help');
    expect(parsed.data.command).toBe('astryx theme build');
    expect(parsed.data.usage).toMatch(/<files\.\.\.>/);
  });
});

describe('--json shim: parse errors emit JSON error envelope', () => {
  it('astryx theme build --json (missing required arg) emits error envelope, exit 1', async () => {
    const {status, stdout} = await runCli(['theme', 'build', '--json']);
    expect(status).toBe(1);
    const parsed = parseJson(stdout);
    expect(parsed.apiVersion).toBe(1);
    expect(parsed.error).toMatch(/missing required argument/i);
    expect(parsed.error).toMatch(/file/i);
  });

  it('astryx --bogus-flag --json (unknown option) emits error envelope, exit 1', async () => {
    const {status, stdout} = await runCli(['--bogus-flag', '--json']);
    expect(status).toBe(1);
    const parsed = parseJson(stdout);
    expect(parsed.apiVersion).toBe(1);
    expect(parsed.error).toMatch(/unknown option/i);
    expect(parsed.error).toMatch(/--bogus-flag/);
  });

  it('astryx component --json --bogus-flag (unknown option on subcmd) emits error envelope, exit 1', async () => {
    const {status, stdout} = await runCli(['component', '--json', '--bogus-flag']);
    expect(status).toBe(1);
    const parsed = parseJson(stdout);
    expect(parsed.apiVersion).toBe(1);
    expect(parsed.error).toMatch(/unknown option/i);
  });
});

describe('--json shim: unknown subcommand emits error envelope', () => {
  it('astryx bogus-cmd --json emits error envelope, exit 1 (not exit 0 + help)', async () => {
    const {status, stdout} = await runCli(['bogus-cmd', '--json']);
    expect(status).toBe(1);
    const parsed = parseJson(stdout);
    expect(parsed.apiVersion).toBe(1);
    expect(parsed.error).toMatch(/unknown command/i);
    expect(parsed.error).toMatch(/bogus-cmd/);
    // Suggestions should list known commands
    expect(Array.isArray(parsed.suggestions)).toBe(true);
    const names = parsed.suggestions.map((s) => s.name);
    expect(names).toContain('component');
  });
});

describe('--json shim: invalid --detail choice', () => {
  it('astryx --detail bogus --json emits a single error envelope, exit 1', async () => {
    const {status, stdout} = await runCli(['--detail', 'bogus', '--json']);
    expect(status).toBe(1);
    const parsed = parseJson(stdout);
    expect(parsed.apiVersion).toBe(1);
    expect(parsed.error).toMatch(/--detail/);
    expect(parsed.error).toMatch(/invalid|allowed/i);
    // Single emission only — stdout must be exactly one JSON document.
    // (parseJson would have thrown if there were two concatenated docs.)
    // Belt-and-suspenders: count opening braces at column 0.
    const topLevelBraces = stdout.split('\n').filter((l) => l === '{').length;
    expect(topLevelBraces).toBe(1);
  });
});

describe('--json shim: invalid --lang choice', () => {
  it('astryx docs color --lang fr --json emits a single error envelope, exit 1', async () => {
    const {status, stdout} = await runCli(['docs', 'color', '--lang', 'fr', '--json']);
    expect(status).toBe(1);
    const parsed = parseJson(stdout);
    expect(parsed.apiVersion).toBe(1);
    expect(parsed.error).toMatch(/--lang/);
    expect(parsed.error).toMatch(/invalid|allowed/i);
    // Single emission only — stdout must be exactly one JSON document.
    const topLevelBraces = stdout.split('\n').filter((l) => l === '{').length;
    expect(topLevelBraces).toBe(1);
  });

  it('astryx docs color --lang fr (no --json) writes to stderr and exits 1', async () => {
    const {status, stdout, stderr} = await runCli(['docs', 'color', '--lang', 'fr']);
    expect(status).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toMatch(/--lang/);
  });

  it('astryx docs color --lang zh is accepted (exit 0)', async () => {
    const {status} = await runCli(['docs', 'color', '--lang', 'zh']);
    expect(status).toBe(0);
  });

  it('astryx docs color --lang en is accepted (exit 0)', async () => {
    const {status} = await runCli(['docs', 'color', '--lang', 'en']);
    expect(status).toBe(0);
  });
});

describe('--json shim: non-JSON behavior is preserved', () => {
  it('astryx theme build (no --json, missing arg) writes to stderr and exits 1', async () => {
    const {status, stdout, stderr} = await runCli(['theme', 'build']);
    expect(status).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toMatch(/missing required argument/i);
  });

  it('astryx --bogus-flag (no --json) writes to stderr and exits 1', async () => {
    const {status, stdout, stderr} = await runCli(['--bogus-flag']);
    expect(status).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toMatch(/unknown option/i);
  });

  it('astryx bogus-cmd (no --json) writes to stderr and exits 1', async () => {
    const {status, stdout, stderr} = await runCli(['bogus-cmd']);
    expect(status).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toMatch(/unknown command/i);
  });

  it('astryx --detail bogus (no --json) writes to stderr and exits 1', async () => {
    const {status, stdout, stderr} = await runCli(['--detail', 'bogus']);
    expect(status).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toMatch(/--detail/);
  });

  it('astryx --help (no --json) writes raw help text to stdout, exit 0', async () => {
    const {status, stdout, stderr} = await runCli(['--help']);
    expect(status).toBe(0);
    expect(stdout).toMatch(/^Usage: astryx/);
    expect(stderr).toBe('');
  });
});

describe('--json shim: stdout discipline under --json', () => {
  it('all error envelopes have empty stderr (no leak of legacy "error: ..." line)', async () => {
    const cases = [
      ['theme', 'build', '--json'],
      ['--bogus-flag', '--json'],
      ['bogus-cmd', '--json'],
      ['--detail', 'bogus', '--json'],
      ['docs', 'color', '--lang', 'fr', '--json'],
    ];
    for (const args of cases) {
      const {stderr} = await runCli(args);
      expect(stderr, `stderr should be empty for: ${args.join(' ')}`).toBe('');
    }
  });
});

describe('--json shim: help shown for a failed invocation is an error envelope', () => {
  it('astryx help bogus --json emits ERR_UNKNOWN_COMMAND, exit 1', async () => {
    const {status, stdout, stderr} = await runCli(['help', 'bogus', '--json']);
    expect(status).toBe(1);
    expect(stderr).toBe('');
    const parsed = parseJson(stdout);
    expect(parsed).not.toHaveProperty('type');
    expect(parsed.apiVersion).toBe(1);
    expect(parsed.code).toBe('ERR_UNKNOWN_COMMAND');
    expect(parsed.error).toMatch(/bogus/);
  });

  it('the real binary emits the same envelope for help bogus --json', () => {
    // One program per process, so the root's own outputHelp patch is used here.
    const bin = fileURLToPath(new URL('../bin/astryx.mjs', import.meta.url));
    const res = spawnSync(process.execPath, [bin, 'help', 'bogus', '--json'], {
      encoding: 'utf-8',
      timeout: 20_000,
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toBe('');
    const parsed = parseJson(res.stdout);
    expect(parsed).not.toHaveProperty('type');
    expect(parsed.code).toBe('ERR_UNKNOWN_COMMAND');
  });

  it('a group added after install gets the same error envelope', () => {
    const program = new Command('astryx');
    installJsonShim(program);
    // Added later, so only the prototype-level patch covers its outputHelp.
    const late = new Command('late');
    late.command('child');
    program.addCommand(late);
    /** @type {string[]} */
    const writes = [];
    const origWrite = process.stdout.write;
    // @ts-expect-error - test-only capture
    process.stdout.write = (chunk) => writes.push(String(chunk)) > 0;
    setJsonMode(true);
    delete process.__xdsJsonHandled;
    try {
      late.outputHelp({error: true});
    } finally {
      process.stdout.write = origWrite;
      setJsonMode(false);
      delete process.__xdsJsonHandled;
    }
    const parsed = parseJson(writes.join(''));
    expect(parsed.code).toBe('ERR_MISSING_ARGUMENT');
    expect(parsed.suggestions).toEqual([{name: 'late child', reason: 'available subcommand'}]);
  });

});
