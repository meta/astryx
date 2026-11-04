// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A parse failure reads like every other Astryx error in text mode.
 *
 * `astryx theme list --lang zh-Hans` printed Commander's own line —
 * `error: option '--lang <locale>' argument 'zh-Hans' is invalid…` — while
 * every other CLI error prints `Error: …`. `--json` was already correct
 * (ERR_INVALID_LANG), so text and JSON disagreed on everything except the exit
 * code. Commander writes that line before any Astryx code runs, so the shim is
 * the only place that can speak for it.
 */

import {describe, it, expect} from 'vitest';
import {Command} from 'commander';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {installJsonShim} from './json-shim.mjs';

describe('a parse error prints the Astryx error format', () => {
  it.each([
    ['invalid --lang value', ['theme', 'list', '--lang', 'zh-Hans'], 'ERR_INVALID_LANG'],
    ['invalid --detail value', ['theme', 'list', '--detail', 'nope'], 'ERR_INVALID_DETAIL'],
    ['unknown option', ['component', '--bogus-flag'], 'ERR_INVALID_OPTION'],
    ['missing argument', ['theme', 'build'], 'ERR_MISSING_ARGUMENT'],
  ])('%s', async (_label, args, code) => {
    const human = await runCli(args);

    expect(human.status).toBe(1);
    expect(human.stderr).toContain('Error: ');
    // Commander's own lowercase line must not reach the user.
    expect(human.stderr).not.toMatch(/(^|\n)error: /);

    // --json is unchanged, and the two modes agree on the exit code.
    const json = await runCli(['--json', ...args]);
    expect(json.status).toBe(human.status);
    expect(JSON.parse(json.stdout).code).toBe(code);
    expect(json.stderr).toBe('');
  });

  it('carries Commander\'s explanation, not just a generic line', async () => {
    const {stderr} = await runCli(['theme', 'list', '--lang', 'zh-Hans']);
    expect(stderr).toContain("'zh-Hans' is invalid");
    expect(stderr).toContain('en, zh, dense');
  });

  it('leaves --help and --version at exit 0 with nothing on stderr', async () => {
    for (const args of [['--help'], ['theme', '--help']]) {
      const r = await runCli(args);
      expect(r.status).toBe(0);
      expect(r.stderr).toBe('');
    }
  });

  // Commander writes help through the same stderr channel when it shows help
  // BECAUSE the invocation failed, so suppressing that channel wholesale would
  // have taken the help with it. Driven on a throwaway program rather than a
  // real command, so the guard outlives whichever command happens to have a
  // subcommand group today.
  it('still lets help reach stderr when help IS the failure report', () => {
    const program = new Command('probe');
    const group = program.command('group');
    group.command('leaf').action(() => {});
    installJsonShim(program);

    /** @type {string[]} */
    const written = [];
    const original = process.stderr.write;
    // @ts-expect-error test double for the write signature
    process.stderr.write = str => {
      written.push(String(str));
      return true;
    };
    try {
      group.outputHelp({error: true});
    } finally {
      process.stderr.write = original;
    }

    expect(written.join('')).toMatch(/Usage: probe group/);
  });
});
