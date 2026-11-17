// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the stable error-code contract.
 *
 * Two layers:
 *
 *   1. Unit — the taxonomy itself: every code is a non-empty, unique,
 *      stable string; the object is frozen; helpers behave.
 *
 *   2. End-to-end — spawn the CLI as a subprocess and assert that
 *      representative error paths emit the right `code` in their JSON
 *      envelope. Spawning is the only way to exercise Commander hooks,
 *      the json-shim, and the bin error boundary together.
 */

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {ERROR_CODES, isErrorCode, allErrorCodes} from './error-codes.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

/** Parse the JSON envelope from stdout. Throws if stdout isn't clean JSON. */
function envelope(stdout) {
  return JSON.parse(stdout);
}

describe('error-codes taxonomy', () => {
  it('every code is a non-empty string', () => {
    for (const [key, value] of Object.entries(ERROR_CODES)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
      // Key and value must match — the object is a string enum.
      expect(value).toBe(key);
    }
  });

  it('every code follows the ERR_ naming convention', () => {
    for (const value of Object.values(ERROR_CODES)) {
      expect(value).toMatch(/^ERR_[A-Z0-9_]+$/);
    }
  });

  it('all codes are unique', () => {
    const values = Object.values(ERROR_CODES);
    expect(new Set(values).size).toBe(values.length);
  });

  it('includes the generic fallback', () => {
    expect(ERROR_CODES.ERR_UNKNOWN).toBe('ERR_UNKNOWN');
  });

  it('the taxonomy object is frozen (codes are stable, append-only)', () => {
    expect(Object.isFrozen(ERROR_CODES)).toBe(true);
    expect(() => {
      // @ts-expect-error - intentional mutation attempt
      ERROR_CODES.ERR_NEW = 'ERR_NEW';
    }).toThrow();
    expect(ERROR_CODES.ERR_NEW).toBeUndefined();
  });

  it('isErrorCode recognizes known codes and rejects others', () => {
    expect(isErrorCode('ERR_UNKNOWN_COMPONENT')).toBe(true);
    expect(isErrorCode('ERR_UNKNOWN')).toBe(true);
    expect(isErrorCode('ERR_NOT_A_REAL_CODE')).toBe(false);
    expect(isErrorCode('')).toBe(false);
    expect(isErrorCode(42)).toBe(false);
    expect(isErrorCode(undefined)).toBe(false);
  });

  it('allErrorCodes returns the sorted, complete set', () => {
    const codes = allErrorCodes();
    expect(codes.length).toBe(Object.keys(ERROR_CODES).length);
    expect(codes).toEqual([...codes].sort());
    expect(codes).toContain('ERR_UNKNOWN');
    expect(codes).toContain('ERR_UNKNOWN_COMPONENT');
  });
});

describe('error codes: shipped set', () => {
  // Every code a release has published. INV3: a shipped code is never removed
  // or respelled. Add a code here once it ships; never delete an entry.
  const SHIPPED = [
    'ERR_AMBIGUOUS_COMPONENT',
    'ERR_AMBIGUOUS_TEMPLATE',
    'ERR_AMBIGUOUS_THEME',
    'ERR_CODEMOD_FAILED',
    'ERR_CODEMOD_PROTECTED',
    'ERR_CODEMOD_PROTECTION_SOURCE',
    'ERR_CORE_INCOMPATIBLE',
    'ERR_CORE_NOT_FOUND',
    'ERR_DEP_MISSING',
    'ERR_FETCH_FAILED',
    'ERR_FILE_EXISTS',
    'ERR_FILE_NOT_FOUND',
    'ERR_GH_CLI',
    'ERR_INTEGRATION_EXPORT_CONFLICT',
    'ERR_INTEGRATION_ROOT_CONFLICT',
    'ERR_INVALID_ARGUMENT',
    'ERR_INVALID_DETAIL',
    'ERR_INVALID_DOC',
    'ERR_INVALID_LANG',
    'ERR_INVALID_OPTION',
    'ERR_INVALID_VERSION',
    'ERR_LAYOUT_INVALID',
    'ERR_LAYOUT_PARSE',
    'ERR_MISSING_ARGUMENT',
    'ERR_NODE_VERSION',
    'ERR_NOT_FOUND',
    'ERR_NO_DOC',
    'ERR_NO_SHOWCASE',
    'ERR_NO_SOURCE',
    'ERR_PALETTE_GENERATION',
    'ERR_PATH_TRAVERSAL',
    'ERR_PROJECT_REQUIRED',
    'ERR_SIGNAL_TERMINATED',
    'ERR_THEME_INVALID',
    'ERR_THEME_LOAD',
    'ERR_UNCLASSIFIED_EXIT',
    'ERR_UNKNOWN',
    'ERR_UNKNOWN_AGENT',
    'ERR_UNKNOWN_CATEGORY',
    'ERR_UNKNOWN_CODEMOD',
    'ERR_UNKNOWN_COMMAND',
    'ERR_UNKNOWN_COMPONENT',
    'ERR_UNKNOWN_FEATURE',
    'ERR_UNKNOWN_HOOK',
    'ERR_UNKNOWN_PACKAGE',
    'ERR_UNKNOWN_POST',
    'ERR_UNKNOWN_SECTION',
    'ERR_UNKNOWN_SUBCOMMAND',
    'ERR_UNKNOWN_TEMPLATE',
    'ERR_UNKNOWN_THEME',
    'ERR_UNKNOWN_TOPIC',
    'ERR_VERSION_DETECT',
    'ERR_VERSIONS_UNAVAILABLE',
    'ERR_WRITE_FAILED',
  ];

  it('still carries every shipped code, spelled the same', () => {
    const missing = SHIPPED.filter(
      code => !isErrorCode(code) || ERROR_CODES[code] !== code,
    );
    expect(missing, 'shipped codes removed or respelled').toEqual([]);
  });
});

describe('error codes: end-to-end JSON envelopes', () => {
  const cases = [
    {
      name: 'unknown component',
      args: ['component', 'Bogus', '--json'],
      code: 'ERR_UNKNOWN_COMPONENT',
    },
    {
      name: 'unknown hook',
      args: ['hook', 'bogusHook', '--json'],
      code: 'ERR_UNKNOWN_HOOK',
    },
    {
      name: 'unknown topic',
      args: ['docs', 'bogusTopic', '--json'],
      code: 'ERR_UNKNOWN_TOPIC',
    },
    {
      name: 'unknown template',
      args: ['template', 'bogusTemplate', '--json'],
      code: 'ERR_UNKNOWN_TEMPLATE',
    },
    {
      name: 'unknown command',
      args: ['bogus-cmd', '--json'],
      code: 'ERR_UNKNOWN_COMMAND',
    },
    {
      name: 'invalid --lang',
      args: ['docs', 'color', '--lang', 'fr', '--json'],
      code: 'ERR_INVALID_LANG',
    },
    {
      name: 'invalid --detail',
      args: ['docs', 'color', '--detail', 'bogus', '--json'],
      code: 'ERR_INVALID_DETAIL',
    },
    {
      name: 'unknown option',
      args: ['component', 'Button', '--bogus-flag', '--json'],
      code: 'ERR_INVALID_OPTION',
    },
    {
      name: 'missing argument',
      args: ['theme', 'build', '--json'],
      code: 'ERR_MISSING_ARGUMENT',
    },
    // `theme` is not on the --json allowlist, so --json on any theme subcommand
    // is rejected at the preAction gate with a stable invalid-option code.
    {
      name: 'json not supported',
      args: ['theme', '--json'],
      code: 'ERR_INVALID_OPTION',
    },
    // A group given a word it does not have names the unknown subcommand,
    // in JSON as in text.
    {
      name: 'unknown subcommand of a group',
      args: ['theme', 'bogus-sub', '--json'],
      code: 'ERR_UNKNOWN_SUBCOMMAND',
    },
  ];

  for (const {name, args, code} of cases) {
    it(`${name} → ${code}`, async () => {
      const {status, stdout} = await runCli(args);
      expect(status).toBe(1);
      const env = envelope(stdout);
      expect(env).toHaveProperty('apiVersion');
      expect(env).toHaveProperty('error');
      expect(env.code).toBe(code);
      // The code must be a recognized member of the taxonomy.
      expect(isErrorCode(env.code)).toBe(true);
    });
  }

  it('a filesystem failure carries a registered code, never the Node errno', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-errno-'));
    try {
      // A file where the target directory should be: mkdir fails with ENOTDIR.
      fs.writeFileSync(path.join(dir, 'blocker'), 'x');
      const {status, stdout} = await runCli(
        ['template', 'dashboard', 'blocker/out', '--json'],
        {cwd: dir},
      );
      expect(status).toBe(1);
      const env = envelope(stdout);
      expect(env.error).toMatch(/ENOTDIR/);
      expect(isErrorCode(env.code)).toBe(true);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('every error envelope carries a code (even unmatched paths fall back to ERR_UNKNOWN)', async () => {
    const {stdout} = await runCli(['component', 'Bogus', '--json']);
    const env = envelope(stdout);
    expect(typeof env.code).toBe('string');
    expect(env.code.length).toBeGreaterThan(0);
  });
});

describe('error codes: human mode stays clean', () => {
  it('the code is NOT printed in the human-facing error line', async () => {
    const {status, stderr, stdout} = await runCli(['component', 'Bogus']);
    expect(status).toBe(1);
    // Human output goes to stderr and must not leak the machine code.
    expect(stderr).toContain('No component named');
    expect(stderr).not.toContain('ERR_UNKNOWN_COMPONENT');
    expect(stdout).not.toContain('ERR_UNKNOWN_COMPONENT');
  });

  it('refuses --built with a doctor integration check', async () => {
    const json = await runCli(['--json', 'doctor', '--built', 'dist', 'integration', 'validate']);
    expect(json.status).toBe(1);
    expect(JSON.parse(json.stdout)).toMatchObject({code: 'ERR_INVALID_OPTION'});
    const text = await runCli(['doctor', '--built', 'dist', 'integration', 'docs']);
    expect(text.status).toBe(1);
    expect(text.stderr).toContain('goes with `doctor` alone');
  });

  it('unknown subcommand exits 1, with the code in JSON and not in text', async () => {
    // A group that is not JSON-capable itself still answers an unknown
    // subcommand in JSON, so a JSON caller learns the subcommands it has.
    const {status, stderr} = await runCli(['theme', 'bogus-sub']);
    expect(status).toBe(1);
    expect(stderr).toContain("unknown subcommand 'theme bogus-sub'");
    expect(stderr).not.toContain('ERR_UNKNOWN_SUBCOMMAND');
    for (const args of [
      ['--json', 'theme', 'bogus-sub'],
      ['theme', 'bogus-sub', '--json'],
      ['--json', 'doctor', 'integration', 'bogus-sub'],
    ]) {
      const json = await runCli(args);
      expect(json.status, args.join(' ')).toBe(1);
      expect(JSON.parse(json.stdout), args.join(' ')).toMatchObject({
        code: 'ERR_UNKNOWN_SUBCOMMAND',
        suggestions: expect.arrayContaining([expect.objectContaining({reason: 'available subcommand'})]),
      });
    }
    // Text and JSON agree for a group that shows help when run bare.
    const text = await runCli(['doctor', 'integration', 'bogus-sub']);
    expect(text.status).toBe(1);
    expect(text.stderr).toContain("unknown subcommand 'doctor integration bogus-sub'");
    const doctor = await runCli(['doctor', 'integrations']);
    expect(doctor.status).toBe(1);
    expect(doctor.stderr).toContain("unknown subcommand 'doctor integrations'");
  });
});
