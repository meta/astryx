// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Unit tests for the CommandDoc -> Commander converter.
 */

import {Command} from 'commander';
import {describe, it, expect} from 'vitest';
import {defineCommand, servedOptionDescription} from './define-command.mjs';
import {formatCliCommand} from '../../../foundation/env/package-manager.mjs';
import {doc as searchCommand} from '../commands/search.doc.mjs';
import {doc as searchFn} from '../../../api/search/search.doc.mjs';

describe('defineCommand', () => {
  it('builds a Commander command from a CommandDoc', () => {
    const program = new Command();
    const cmd = defineCommand(program, searchCommand, {
      fn: searchFn,
      action: () => {},
    });

    expect(cmd.name()).toBe('search');
    expect(cmd.description()).toBe(searchCommand.summary);
    expect(cmd.registeredArguments.map(a => a.name())).toEqual(['query']);
    expect(cmd.registeredArguments[0].required).toBe(true);
    expect(cmd.options.map(o => o.flags)).toEqual([
      '--type <domain>',
      '--limit <n>',
      '--verbose',
    ]);
  });

  it("builds an option's text from its pointers and drops a pointer not served", () => {
    const program = new Command('astryx');
    const cmd = defineCommand(
      program,
      {
        name: 'pick',
        displayName: 'astryx pick',
        summary: 'Pick one',
        fn: 'pick',
        options: [
          {
            flag: '--list',
            description: 'List: <name>',
            pointers: [{commands: ['pick --deep'], text: ', --deep'}, ' are refused'],
          },
          {
            flag: '--from <pkg>',
            param: 'options.from',
            pointers: [{commands: ['pick x --from core'], text: ' Use core.'}],
          },
        ],
      },
      {
        fn: {
          type: 'function',
          name: 'pick',
          params: [{name: 'options.from', type: 'string', description: 'One package.'}],
        },
      },
    );
    const [list, from] = cmd.options;
    expect(list.description).toBe('List: <name>, --deep are refused');
    expect(from.description).toBe('One package. Use core.');
    expect(servedOptionDescription(list, () => false)).toBe('List: <name> are refused');
    expect(servedOptionDescription(from, () => false)).toBe('One package.');
  });

  it('nests a subcommand token under a group parent', () => {
    const program = new Command();
    const group = program.command('theme');
    const cmd = defineCommand(
      group,
      {
        type: 'command',
        name: 'theme build',
        displayName: 'astryx theme build',
        summary: 'Build.',
        args: [{name: 'file', required: true}],
      },
      {action: () => {}},
    );
    expect(cmd.name()).toBe('build');
    expect(cmd.registeredArguments.map(a => a.name())).toEqual(['file']);
  });

  it('ends help with the exit codes, the examples, and the docs route', () => {
    const program = new Command();
    const group = program.command('grp');
    const cmd = defineCommand(
      group,
      {
        type: 'command',
        name: 'grp sub',
        displayName: 'astryx grp sub',
        summary: 'Sub.',
        examples: [
          {label: 'Run it', cli: 'astryx grp sub x'},
          {cli: 'astryx grp sub y --json'},
        ],
        exitCodes: [{code: 0, when: 'it works'}],
      },
      {action: () => {}},
    );
    let out = '';
    cmd.configureOutput({writeOut: s => (out += s)});
    cmd.outputHelp();
    const stem = formatCliCommand('');
    expect(out.slice(out.indexOf('\nExit codes:\n'))).toBe(
      [
        '',
        'Exit codes:',
        '  0  it works',
        '',
        'Examples:',
        '  # Run it',
        `  ${stem} grp sub x`,
        `  ${stem} grp sub y --json`,
        '',
        `More: ${stem} docs cli/commands/grp-sub`,
        '',
      ].join('\n'),
    );
  });

  it('still names the docs route when a command has no examples', () => {
    const program = new Command();
    const cmd = defineCommand(
      program,
      {type: 'command', name: 'solo', summary: 'Solo.', exitCodes: [{code: 0, when: 'ok'}]},
      {action: () => {}},
    );
    let out = '';
    cmd.configureOutput({writeOut: s => (out += s)});
    cmd.outputHelp();
    expect(out).not.toContain('Examples:');
    expect(out.endsWith(`\n\nMore: ${formatCliCommand('docs cli/commands/solo')}\n`)).toBe(true);
  });
});
