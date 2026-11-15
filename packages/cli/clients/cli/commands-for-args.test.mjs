// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A run of the bin loads only the command its arguments name
 * (commandsForArgs in index.mjs). It prints what the full program prints,
 * with the same exit status. That holds for help on every command and
 * subcommand, in text and JSON, for the manifest and for the root's own
 * answers.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {COMMAND_NAMES, commandsForArgs, createProgram} from './index.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

/** @type {import('commander').Command} */
let full;
/** @type {string} */
let dir;

beforeAll(async () => {
  full = await createProgram();
  // Outside any project, so no project changes what help prints.
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-commands-for-args-'));
});

afterAll(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/** @param {string[]} argv */
const loads = argv => {
  const names = commandsForArgs(full, argv);
  return names == null ? null : [...names];
};

describe('commandsForArgs', () => {
  it('names the first operand after the root options', () => {
    expect(loads(['docs'])).toEqual(['docs']);
    expect(loads(['docs', 'tokens', '--dense'])).toEqual(['docs']);
    expect(loads(['--json', 'docs'])).toEqual(['docs']);
    expect(loads(['--detail', 'brief', 'docs'])).toEqual(['docs']);
    expect(loads(['--detail=brief', 'docs'])).toEqual(['docs']);
    expect(loads(['--lang', 'zh', 'component', 'Button'])).toEqual([
      'component',
    ]);
    expect(loads(['theme', 'build', 'theme.mjs'])).toEqual(['theme']);
  });

  // A registry name that differs from the name its module registers would
  // make `astryx <name>` answer differently from the full program.
  it('has one registry entry for each command of the full program, by name', async () => {
    const names = full.commands.map(command => command.name());
    expect([...COMMAND_NAMES].sort()).toEqual([...names].sort());
    for (const name of COMMAND_NAMES) {
      if (name === 'manifest') {
        expect(loads([name])).toBeNull();
        continue;
      }
      expect(loads([name]), name).toEqual([name]);
      const routed = await createProgram({argv: [name]});
      expect(
        routed.commands.map(command => command.name()),
        name,
      ).toEqual([name]);
    }
  });

  it('loads no command for a run that only prints the version', () => {
    expect(loads(['--version'])).toEqual([]);
    expect(loads(['-V', '--json'])).toEqual([]);
  });

  it('loads every command when the run prints or reads the whole list', () => {
    for (const argv of [
      [],
      ['--json'],
      ['--help'],
      ['-h'],
      ['--help', 'docs'],
      ['help', 'docs'],
      ['manifest', '--json'],
      ['no-such-command'],
      ['--no-such-flag', 'docs'],
      // Commander reads a value given to a flag that takes none as unknown.
      ['--json=1', 'docs'],
      ['--', 'docs'],
      ['-'],
      ['--detail'],
    ]) {
      expect(loads(argv), argv.join(' ')).toBeNull();
    }
  });
});

describe('a run that loads only its command prints what the full program prints', () => {
  /** @param {string[]} argv */
  const expectSameAnswer = async argv => {
    const asBin = await runCli(argv, {cwd: dir});
    const everything = await runCli(argv, {cwd: dir, allCommands: true});
    expect(asBin, argv.join(' ')).toEqual(everything);
  };

  it('for help on every command and subcommand, in text and JSON', async () => {
    /** @type {string[][]} */
    const paths = [];
    /** @param {import('commander').Command} cmd @param {string[]} parent */
    const walk = (cmd, parent) => {
      for (const sub of cmd.commands) {
        paths.push([...parent, sub.name()]);
        walk(sub, [...parent, sub.name()]);
      }
    };
    walk(full, []);
    expect(paths.length).toBeGreaterThan(full.commands.length);
    for (const commandPath of paths) {
      await expectSameAnswer([...commandPath, '--help']);
      await expectSameAnswer([...commandPath, '--help', '--json']);
    }
  });

  it('for the root, the manifest and the version', async () => {
    for (const argv of [
      ['--help'],
      ['--help', 'docs'],
      ['-h', 'theme'],
      ['--json'],
      ['manifest', '--json'],
      ['help', 'docs'],
      ['--version'],
      ['no-such-command'],
      ['--detail', 'brief', 'docs', '--help'],
      ['--lang', 'zh', 'component', '--help'],
      ['docs', '--no-such-flag'],
    ]) {
      await expectSameAnswer(argv);
    }
  });
});
