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
import {
  ADD_WORDS,
  JOB_WORDS,
  LIST_WORDS,
  PROPS_WORDS,
  READ_WORDS,
  SOURCE_WORDS,
} from './other-cli-words.mjs';

/** A program shaped like the CLI's. */
function program() {
  const root = new Command('astryx');
  root.option('--json', 'JSON');
  root.option('--base <pkg>', 'base');
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
    .option('--list', 'list')
    .option('--type <type>', 'type')
    .option('--skeleton', 'skeleton');
  root.command('build').argument('[query]');
  root.command('hook').argument('[name]');
  root.command('swizzle').argument('[component]').option('--list', 'list');
  root
    .command('upgrade')
    .option('--from <version>', 'from')
    .option('--list', 'list')
    .option('--apply', 'apply');
  root
    .command('gap-report')
    .argument('[component]')
    .option('--reason <reason>', 'reason');
  root.command('discover').argument('[query]');
  const theme = root.command('theme');
  theme.command('list');
  theme.command('add').argument('[slug]');
  theme.command('eject').argument('[slug]').argument('[path]');
  theme.command('targets').argument('[component]');
  const integration = root.command('integration');
  integration.command('verify');
  integration.command('add').argument('[kind]').argument('[name]');
  const doctor = root.command('doctor');
  doctor.command('integration').command('validate').argument('[pkg]');
  const experimental = root.command('experimental');
  experimental.command('icon').argument('[query...]');
  experimental
    .command('export')
    .argument('[page]')
    .option('--title <title>', 'title');
  return root;
}

/** @param {string} name */
const entries = async name =>
  ({
    Text: {command: 'component', name: 'Text'},
    button: {command: 'component', name: 'Button'},
    Card: {command: 'component', name: 'Card'},
    Stepper: {command: 'component', name: 'Stepper'},
    theme: {command: 'component', name: 'Theme'},
    settings: {command: 'template', name: 'settings'},
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

describe('words from another command line', () => {
  it('reads a verb before its group', async () => {
    expect(await names(['add', 'theme', 'matcha'])).toEqual([
      'astryx theme add matcha',
    ]);
    expect(await names(['list', 'themes'])).toEqual(['astryx theme list']);
  });

  it('reads a plural kind of template as its list', async () => {
    expect(await names(['list', 'pages'])).toEqual([
      'astryx template --list --type page',
    ]);
  });

  it('reads a word before a command as a request to run it, and moves a path option to its path', async () => {
    expect(await names(['show', 'component', 'Button'])).toEqual([
      'astryx component Button',
    ]);
    expect(
      await names([
        'add',
        'template',
        'settings',
        '--out',
        'src/app/settings/page.tsx',
      ]),
    ).toEqual(['astryx template settings src/app/settings/page.tsx']);
  });

  it('reads a copy verb and a component name as swizzle, and leaves other names to the tree', async () => {
    expect(await names(['eject', 'button'])).toEqual(['astryx swizzle Button']);
    expect(await names(['eject', 'neutral'])).toEqual([
      'astryx theme eject neutral',
    ]);
  });

  it('reads add and a name by what the name is', async () => {
    expect(await names(['add', 'button'])).toEqual([
      'astryx swizzle Button',
      'astryx component Button',
    ]);
    expect(
      await names(['add', 'settings', '--path', 'src/app/settings/page.tsx']),
    ).toEqual(['astryx template settings src/app/settings/page.tsx']);
  });

  it("reads a props word and a component name as the component's props", async () => {
    expect(await names(['props', 'Card'])).toEqual([
      'astryx component Card --props',
    ]);
  });

  it('reads a word for a job one command does, and names the inputs the run needs', async () => {
    expect(await names(['migrate'])).toEqual([
      'astryx upgrade --from <old-version>',
    ]);
    expect(
      await names(['migrate', '--from', '0.6.0', '--to', 'latest']),
    ).toEqual(['astryx upgrade --from 0.6.0']);
    expect(await names(['migrate', '--list'])).toEqual([
      'astryx upgrade --list',
    ]);
    expect(await names(['browse', 'integrations'])).toEqual([
      'astryx discover',
    ]);
  });

  it('keeps the program options written after the word', async () => {
    expect(
      await names([
        'add',
        'theme',
        'matcha',
        '--json',
        '--base',
        '@astryxdesign/core',
      ]),
    ).toEqual(['astryx theme add matcha --json --base @astryxdesign/core']);
    expect(await names(['eject', 'button', '--json'])).toEqual([
      'astryx swizzle Button --json',
    ]);
  });

  it('leaves a read word before a group alone to the name lookup', async () => {
    for (const verb of ['info', 'show', 'view', 'describe'])
      expect(await names([verb, 'theme'])).toEqual(['astryx component Theme']);
  });

  it('names no experimental command from a verb before the group', async () => {
    for (const name of (await names(['icons', 'experimental'])) ?? [])
      expect(name).not.toMatch(/^astryx experimental\b/);
  });

  it('names experimental export for a share word, once, whatever follows (FR27)', async () => {
    expect(await names(['render', 'experimental'])).toEqual([
      'astryx experimental export',
    ]);
    expect(await names(['share', 'page.tsx'])).toEqual([
      'astryx experimental export page.tsx',
    ]);
    expect(
      await names(['share', 'page.tsx', '--title', 'experimental']),
    ).toEqual(['astryx experimental export page.tsx --title experimental']);
  });

  it('leaves a name another command reads after a share word to the name lookup', async () => {
    expect(await names(['export', 'button'])).toEqual([
      'astryx component Button',
    ]);
    expect(await names(['share', 'Card'])).toEqual(['astryx component Card']);
  });

  it('keeps the program options after the name in the props, add and template-kind runs', async () => {
    expect(await names(['props', 'Card', '--json'])).toEqual([
      'astryx component Card --props --json',
    ]);
    expect(await names(['add', 'button', '--json'])).toEqual([
      'astryx swizzle Button --json',
      'astryx component Button --json',
    ]);
    expect(
      await names(['list', 'pages', '--base', '@astryxdesign/core']),
    ).toEqual(['astryx template --list --type page --base @astryxdesign/core']);
  });

  it("leaves a command's plural to the plural rule", async () => {
    expect(await names(['integrations', 'verify'])).toEqual([
      'astryx integration verify',
    ]);
    expect(await names(['integrations'])).toEqual([
      'astryx integration --help',
    ]);
    expect(await names(['integrations', 'list'])).toEqual([
      'astryx integration --help',
    ]);
  });

  it("reads a list word or a read word after a command's plural", async () => {
    expect(await names(['templates', 'list'])).toEqual([
      'astryx template --list',
    ]);
    expect(
      await names(['templates', 'view', 'settings', '--skeleton']),
    ).toEqual(['astryx template settings --skeleton']);
  });
});

describe('the table of words from other command lines', () => {
  it('holds no word that is a command, or the plural of one', async () => {
    const {stdout} = await runCli(['--json', 'help']);
    const commands = new Set(
      JSON.parse(stdout).data.subcommands.map(
        (/** @type {{name: string}} */ c) => c.name,
      ),
    );
    const tables = [
      LIST_WORDS,
      READ_WORDS,
      ADD_WORDS,
      SOURCE_WORDS,
      PROPS_WORDS,
      JOB_WORDS,
    ];
    for (const {word, usedBy} of tables.flat()) {
      expect(usedBy).not.toBe('');
      expect(commands.has(word)).toBe(false);
      expect(commands.has(word.replace(/s$/, ''))).toBe(false);
      expect(commands.has(`${word}s`)).toBe(false);
    }
    for (const {run} of JOB_WORDS) expect(commands.has(run[0])).toBe(true);
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

    const group = JSON.parse(
      (await runCli(['--json', 'info', 'theme'])).stdout,
    );
    expect(group.suggestions[0].name).toBe('astryx --json component Theme');
  });

  it('names the command for words from another command line', async () => {
    const added = JSON.parse(
      (await runCli(['--json', 'add', 'theme', 'matcha'])).stdout,
    );
    expect(added.code).toBe('ERR_UNKNOWN_COMMAND');
    expect(added.suggestions[0].name).toBe('astryx --json theme add matcha');

    const ejected = JSON.parse(
      (await runCli(['--json', 'eject', 'button'])).stdout,
    );
    expect(ejected.suggestions[0].name).toBe('astryx --json swizzle Button');
  });

  it('keeps the options the command it names takes, when the program does not take them', async () => {
    const {status, stdout} = await runCli([
      '--json',
      'migrate',
      '--from',
      '0.6.0',
      '--to',
      'latest',
    ]);
    expect(status).toBe(1);
    const envelope = JSON.parse(stdout);
    expect(envelope.code).toBe('ERR_UNKNOWN_COMMAND');
    expect(envelope.suggestions[0].name).toMatch(
      / --json upgrade --from 0\.6\.0$/,
    );

    const bare = JSON.parse((await runCli(['--json', 'migrate'])).stdout);
    expect(bare.suggestions[0].name).toMatch(
      / --json upgrade --from <old-version>$/,
    );
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
