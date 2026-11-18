// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The answer to an option a command does not take: it names the
 * options the command takes, and the run as meant when the option points at
 * one of them. Each run it names parses, and the real CLI runs the named
 * command.
 */

import {describe, it, expect} from 'vitest';
import {Command, Option} from 'commander';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {runParses, strayOptionAnswer, withoutStray} from './stray-option.mjs';

/** A program shaped like the CLI's: global options, a lookup, a group. */
function program() {
  const root = new Command('astryx');
  root.option('--json', 'JSON');
  root.addOption(
    new Option('--detail <level>', 'detail').choices([
      'full',
      'compact',
      'brief',
    ]),
  );
  const component = root
    .command('component')
    .argument('[names...]')
    .option('--list', 'list')
    .option('--props', 'props')
    .option('--category <category>', 'group');
  const theme = root.command('theme');
  theme.command('list');
  theme.command('build').argument('<files...>').option('--out <path>', 'out');
  const upgrade = root.command('upgrade').option('--from <version>', 'from');
  return {root, component, theme, upgrade};
}

/**
 * The answer as the CLI gives it: Commander's message for the stray option,
 * with the near name Commander suggests, if any.
 * @param {Command} cmd
 * @param {string} stray
 * @param {string[]} words
 * @param {string} [similar]
 * @param {(path: string) => boolean} [jsonSupported]
 */
function answer(cmd, stray, words, similar, jsonSupported) {
  const message = `unknown option '${stray}'${similar ? `\n(Did you mean ${similar}?)` : ''}`;
  return strayOptionAnswer(
    cmd,
    message,
    words,
    jsonSupported ? {jsonSupported} : {},
  );
}

/** @param {ReturnType<typeof answer>} a */
const runs = a =>
  (a?.suggestions ?? [])
    .filter(s => s.reason === 'do this instead')
    .map(s =>
      s.name.replace(/^.*?(?:@astryxdesign\/cli(?:@\S+)?|astryx)\s+/, ''),
    );

describe('the run as meant', () => {
  it('reads an option written with a value that names an option', () => {
    const {component} = program();
    expect(
      runs(
        answer(component, '--format', [
          'component',
          'Table',
          '--format',
          'json',
        ]),
      ),
    ).toEqual(['component Table --json']);
    expect(
      runs(
        answer(component, '--format=json', [
          'component',
          'Table',
          '--format=json',
        ]),
      ),
    ).toEqual(['component Table --json']);
    expect(
      runs(answer(component, '-o', ['component', 'Table', '-o', 'json'])),
    ).toEqual(['component Table --json']);
  });

  it('never gives an option twice', () => {
    const {component} = program();
    expect(
      runs(
        answer(component, '--format', [
          '--json',
          'component',
          'Table',
          '--format',
          'json',
        ]),
      ),
    ).toEqual(['--json component Table']);
  });

  it('offers --json only to a command that answers it', () => {
    const {component} = program();
    const a = answer(
      component,
      '--format',
      ['component', 'Table', '--format', 'json'],
      undefined,
      () => false,
    );
    expect(runs(a)).toEqual([]);
    expect(a?.message).not.toContain('--json');
  });

  it('reads an option named as a value one option takes', () => {
    const {component} = program();
    expect(
      runs(answer(component, '--full', ['component', 'Table', '--full'])),
    ).toEqual(['component Table --detail full']);
  });

  it('takes the near name Commander suggests, and an option with words added', () => {
    const {component} = program();
    expect(
      runs(
        answer(
          component,
          '--prop',
          ['component', 'Table', '--prop'],
          '--props',
        ),
      ),
    ).toEqual(['component Table --props']);
    expect(
      runs(
        answer(component, '--props-only', [
          'component',
          'Table',
          '--props-only',
        ]),
      ),
    ).toEqual(['component Table --props']);
  });

  it('never offers an option with set values with a value it does not take', () => {
    const {component} = program();
    expect(
      runs(
        answer(
          component,
          '--domain',
          ['component', 'Table', '--domain', 'component'],
          '--detail',
        ),
      ),
    ).toEqual([]);
  });

  it('reads an option that names a subcommand of the group', () => {
    const {theme} = program();
    expect(runs(answer(theme, '--list', ['theme', '--list']))).toEqual([
      'theme list',
    ]);
  });

  it('offers no run as meant that does not parse', () => {
    const {theme} = program();
    expect(runs(answer(theme, '--list', ['theme', '--list', 'extra']))).toEqual(
      [],
    );
  });

  it('offers no run while another word is still not an option the command takes', () => {
    const {component} = program();
    expect(
      runs(
        answer(component, '--format', [
          'component',
          'Table',
          '--format',
          'json',
          '--verbose',
        ]),
      ),
    ).toEqual([]);
  });

  it('offers no run when nothing points: the options and the help name the way', () => {
    const {component} = program();
    const a = answer(component, '--verbose', [
      'component',
      'Table',
      '--verbose',
    ]);
    expect(runs(a)).toEqual([]);
    expect(a?.message).toBe(
      "unknown option '--verbose': component takes --list, --props, --category and --json.",
    );
    expect(a?.suggestions.at(-1)?.name).toMatch(/component --help$/);
  });

  it("names a group's subcommands", () => {
    const {theme} = program();
    expect(answer(theme, '--bogus', ['theme', '--bogus'])?.message).toBe(
      "unknown option '--bogus': theme takes --json, or a subcommand: list, build.",
    );
  });
});

describe('runParses', () => {
  it('accepts a run each word of which the command takes', () => {
    const {root} = program();
    expect(runParses(root, ['component', 'Table', '--props', '--json'])).toBe(
      true,
    );
    expect(
      runParses(root, ['--json', 'theme', 'build', 'a.ts', '--out', 'a.css']),
    ).toBe(true);
    expect(runParses(root, ['theme', 'list'])).toBe(true);
  });

  it('refuses an unknown option, too many words, and a group alone', () => {
    const {root} = program();
    expect(runParses(root, ['component', 'Table', '--verbose'])).toBe(false);
    expect(runParses(root, ['theme', 'list', 'extra'])).toBe(false);
    expect(runParses(root, ['theme'])).toBe(false);
    expect(runParses(root, ['describe', 'Table'])).toBe(false);
  });
});

describe('runParses: what a command requires', () => {
  it('refuses a run without a required argument or a required option, and accepts a help run', () => {
    const root = new Command('astryx');
    const theme = root.command('theme');
    theme.command('list');
    theme
      .command('build')
      .argument('<files...>')
      .requiredOption('--out <path>', 'out');
    theme.command('eject').argument('<name>');
    expect(runParses(root, ['theme', 'build'])).toBe(false);
    expect(runParses(root, ['theme', 'build', 'a.ts'])).toBe(false);
    expect(runParses(root, ['theme', 'build', 'a.ts', '--out', 'x'])).toBe(
      true,
    );
    expect(runParses(root, ['theme', 'eject'])).toBe(false);
    expect(runParses(root, ['theme', 'eject', 'brand'])).toBe(true);
    expect(runParses(root, ['theme', 'build', '--help'])).toBe(true);
  });

  it('offers no run as meant that lacks what the command requires', () => {
    const {theme} = program();
    expect(runs(answer(theme, '--build', ['theme', '--build']))).toEqual([]);
  });
});

describe('runParses: an option that needs a value', () => {
  it('refuses the option with no value after it', () => {
    const {root} = program();
    expect(runParses(root, ['component', 'Table', '--category'])).toBe(false);
    expect(runParses(root, ['component', 'Table', '--category', 'forms'])).toBe(
      true,
    );
    expect(runParses(root, ['component', '--category=forms'])).toBe(true);
    expect(runParses(root, ['component', '--category', '--json'])).toBe(false);
  });

  it('offers no near name that would need a value the call did not give', () => {
    const {component, upgrade} = program();
    expect(
      runs(
        answer(
          component,
          '--categry',
          ['component', 'Table', '--categry'],
          '--category',
        ),
      ),
    ).toEqual([]);
    expect(
      runs(answer(upgrade, '--frm', ['upgrade', '--frm'], '--from')),
    ).toEqual([]);
    const frm = answer(
      upgrade,
      '--frm',
      ['upgrade', '--frm', '--json'],
      '--from',
    );
    expect(runs(frm)).toEqual([]);
    expect(frm?.message).toMatch(/ Did you mean --from\?$/);
    expect(
      runs(
        answer(
          component,
          '--categry',
          ['component', 'Table', '--categry', '--json'],
          '--category',
        ),
      ),
    ).toEqual([]);
    expect(
      runs(answer(upgrade, '--frm', ['upgrade', '--frm', '0.6.8'], '--from')),
    ).toEqual(['upgrade --from 0.6.8']);
  });
});

describe('withoutStray', () => {
  it('replaces the option by the one its value names, else leaves the option word out', () => {
    const {root} = program();
    expect(
      withoutStray(
        ['describe', 'Table', '--format', 'json'],
        '--format',
        root.options,
      ),
    ).toEqual(['describe', 'Table', '--json']);
    expect(
      withoutStray(['--props', 'Button'], '--props', root.options),
    ).toEqual(['Button']);
  });

  it('gives the option the value names once', () => {
    const {root} = program();
    expect(
      withoutStray(
        ['--json', 'describe', 'Table', '--format', 'json'],
        '--format',
        root.options,
      ),
    ).toEqual(['--json', 'describe', 'Table']);
  });
});

describe('the CLI', () => {
  it('names the run as meant, and that run works', async () => {
    const failed = await runCli(['component', 'Text', '--format', 'json']);
    expect(failed.status).toBe(1);
    expect(failed.stderr).toMatch(
      /^Error: unknown option '--format': component takes .*--props.*--json\.$/m,
    );
    expect(failed.stderr).toMatch(/^Run: .*astryx\S* component Text --json$/m);

    const json = await runCli([
      '--json',
      'component',
      'Text',
      '--format',
      'json',
    ]);
    const envelope = JSON.parse(json.stdout);
    expect(envelope.code).toBe('ERR_INVALID_OPTION');
    expect(envelope.suggestions[0]).toMatchObject({reason: 'do this instead'});
    expect(envelope.suggestions[0].name).toMatch(/ --json component Text$/);

    const meant = await runCli(['component', 'Text', '--json']);
    expect(meant.status).toBe(0);
    expect(JSON.parse(meant.stdout).type).toMatch(/^component/);
  });

  it('names the options a command takes when the option points at none', async () => {
    const {status, stderr} = await runCli(['template', 'dashboard', '--print']);
    expect(status).toBe(1);
    expect(stderr).toMatch(
      /^Error: unknown option '--print': template takes --list, --type/m,
    );
    expect(stderr).toMatch(/^Run: .* template --help$/m);
  });
});
