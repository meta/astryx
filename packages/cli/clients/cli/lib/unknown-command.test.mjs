// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The answer to a word the CLI has no command for names the command
 * the run meant when the words point at one, else near names, else every
 * command. Each run it names parses, and the real CLI runs it.
 */

import {describe, it, expect} from 'vitest';
import {Command} from 'commander';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {unknownCommandAnswer} from './unknown-command.mjs';

/** A program shaped like the CLI's. */
function program() {
  const root = new Command('astryx');
  root.option('--json', 'JSON');
  root.command('init');
  root
    .command('component')
    .argument('[names...]')
    .option('--list', 'list')
    .option('--props', 'props');
  root.command('docs').argument('[topic]').option('--list', 'list');
  root
    .command('template')
    .argument('[name]')
    .argument('[path]')
    .option('--list', 'list');
  const theme = root.command('theme');
  theme.command('list');
  theme.command('targets').argument('[component]');
  const integration = root.command('integration');
  integration.command('verify');
  const doctor = root.command('doctor');
  doctor.command('integration').command('validate').argument('[pkg]');
  const experimental = root.command('experimental');
  experimental.command('icon').argument('[query...]');
  return root;
}

/** @param {string} name */
const entries = async name =>
  ({
    Text: {command: 'component', name: 'Text'},
    DialogFormDialog: {command: 'template', name: 'DialogFormDialog'},
    tokens: {command: 'docs', name: 'tokens'},
  })[name] ?? null;

/** @param {string[]} words */
async function names(words) {
  const a = await unknownCommandAnswer(program(), words, {findEntry: entries});
  return a?.suggestions.map(s => s.name);
}

describe('the command the words point at', () => {
  it('splits a whole command passed as one word', async () => {
    expect(await names(['component Table'])).toEqual([
      'astryx component Table',
    ]);
  });

  it("reads a command's plural, and a group's plural as its list", async () => {
    expect(await names(['components', 'Button'])).toEqual([
      'astryx component Button',
    ]);
    expect(await names(['themes'])).toEqual(['astryx theme list']);
  });

  it('reads an option some commands take', async () => {
    expect(await names(['list', 'components'])).toEqual([
      'astryx component --list',
    ]);
    expect(await names(['list'])).toEqual([
      'astryx component --list',
      'astryx docs --list',
      'astryx template --list',
    ]);
  });

  it('finds a command deeper in the tree, by its name or by the parts of a hyphenated word', async () => {
    expect(await names(['verify'])).toEqual(['astryx integration verify']);
    expect(await names(['targets', 'button'])).toEqual([
      'astryx theme targets button',
    ]);
    expect(await names(['validate-integration', '@acme/widgets'])).toEqual([
      'astryx doctor integration validate @acme/widgets',
    ]);
  });

  it('names no experimental command, only the group in the list of commands', async () => {
    for (const words of [['find-icon', 'grid'], ['icons']])
      expect((await names(words)) ?? []).not.toContainEqual(
        expect.stringMatching(/^astryx experimental /),
      );
  });

  it('reads the next word, else the word itself, as a name another command reads', async () => {
    expect(await names(['info', 'Text'])).toEqual(['astryx component Text']);
    expect(await names(['block', 'DialogFormDialog'])).toEqual([
      'astryx template DialogFormDialog',
    ]);
    expect(await names(['tokens'])).toEqual(['astryx docs tokens']);
  });

  it('keeps the options given before the word', async () => {
    expect(await names(['--json', 'info', 'Text'])).toEqual([
      'astryx --json component Text',
    ]);
  });

  it('offers only runs that parse', async () => {
    // `theme list` takes no word, so `list layouts` points at no run.
    const a = await unknownCommandAnswer(program(), ['list', 'layouts'], {
      findEntry: entries,
    });
    expect(a?.suggestions.every(s => !s.name.startsWith('astryx '))).toBe(true);
  });

  it('falls back to near names, else every command', async () => {
    expect(await names(['componet'])).toEqual(['component']);
    const far = await unknownCommandAnswer(program(), ['frobnicate'], {
      findEntry: entries,
    });
    expect(far?.suggestions.map(s => s.reason)).toEqual(
      Array(far?.suggestions.length).fill('available command'),
    );
  });
});

describe('the CLI', () => {
  it('names the lookup that reads the next word, and that run works', async () => {
    const {status, stdout} = await runCli(['--json', 'info', 'Button']);
    expect(status).toBe(1);
    const envelope = JSON.parse(stdout);
    expect(envelope.code).toBe('ERR_UNKNOWN_COMMAND');
    expect(envelope.suggestions[0]).toEqual({
      name: 'astryx --json component Button',
      reason: 'Button is read by component',
    });

    const meant = await runCli(['--json', 'component', 'Button']);
    expect(meant.status).toBe(0);
  });

  it('reports an unknown command before an option the program does not take', async () => {
    const {status, stderr} = await runCli([
      'describe',
      'Table',
      '--format',
      'json',
    ]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/^Error: unknown command 'describe'$/m);
    expect(stderr).toMatch(/^Run: .* component Table --json$/m);
  });
});
