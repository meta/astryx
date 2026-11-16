// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A refusal names a run that works: paths given to `doctor` as words,
 * `upgrade --list` with `--from`, `template --skeleton` with a path, and an
 * unknown option before an unknown command or with a value before a command.
 * Each test runs the named command too.
 */

import {afterEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../test-utils/run-cli.mjs';

/** @type {string[]} */
const made = [];
afterEach(() => {
  for (const dir of made.splice(0))
    fs.rmSync(dir, {recursive: true, force: true});
});

/** A folder with an app's files in it. */
function app() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-refusal-'));
  made.push(dir);
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    '{"name":"app","private":true}\n',
  );
  fs.mkdirSync(path.join(dir, 'app', 'portal'), {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'app', 'page.tsx'),
    'export default () => null;\n',
  );
  fs.writeFileSync(
    path.join(dir, 'app', 'portal', 'A.tsx'),
    'export const A = 1;\n',
  );
  fs.writeFileSync(
    path.join(dir, 'app', 'portal', 'B.tsx'),
    'export const B = 2;\n',
  );
  return dir;
}

/**
 * The words a shell reads from a named run, after the CLI itself (`astryx`,
 * or a package runner's `@astryxdesign/cli@<version>`).
 * @param {string} line
 * @returns {string[]}
 */
function words(line) {
  const parts = [...line.matchAll(/'([^']*)'|(\S+)/g)].map(m => m[1] ?? m[2]);
  const cli = parts.findIndex(
    p => p === 'astryx' || p.startsWith('@astryxdesign/cli'),
  );
  return parts.slice(cli + 1);
}

describe('doctor given paths as words', () => {
  it('names --built for one path', async () => {
    const cwd = app();
    const {status, stdout} = await runCli(
      ['--json', 'doctor', 'app/page.tsx'],
      cwd,
    );
    expect(status).toBe(1);
    const envelope = JSON.parse(stdout);
    expect(envelope.code).toBe('ERR_UNKNOWN_SUBCOMMAND');
    expect(envelope.error).toBe(
      'doctor takes no path: app/page.tsx is checked with --built',
    );
    expect(envelope.suggestions).toEqual([
      {name: 'astryx doctor --built app/page.tsx', reason: 'check that path'},
    ]);

    const meant = await runCli(
      ['--json', ...words(envelope.suggestions[0].name)],
      cwd,
    );
    expect(JSON.parse(meant.stdout).type).toBe('doctor');
  });

  it('names the folder that holds several paths', async () => {
    const cwd = app();
    const {stdout} = await runCli(
      [
        '--json',
        'doctor',
        '--built',
        'app/portal/A.tsx',
        'app/portal/B.tsx',
        'app/page.tsx',
      ],
      cwd,
    );
    const envelope = JSON.parse(stdout);
    expect(envelope.error).toBe(
      '--built takes one path, and doctor was given 3: app/portal/A.tsx, app/portal/B.tsx, app/page.tsx',
    );
    expect(envelope.suggestions).toEqual([
      {
        name: 'astryx doctor --built app',
        reason: 'the folder that holds them all',
      },
    ]);

    const meant = await runCli(
      ['--json', ...words(envelope.suggestions[0].name)],
      cwd,
    );
    expect(JSON.parse(meant.stdout).type).toBe('doctor');
  });

  it('still reads a word that is no path as an unknown subcommand', async () => {
    const {stdout} = await runCli(['--json', 'doctor', 'integrations'], app());
    expect(JSON.parse(stdout).error).toBe(
      "unknown subcommand 'doctor integrations'",
    );
  });
});

describe('upgrade --list with --from', () => {
  it('names the list and the migration from that version', async () => {
    const {status, stdout} = await runCli([
      '--json',
      'upgrade',
      '--from',
      '0.7.5',
      '--list',
    ]);
    expect(status).toBe(1);
    const envelope = JSON.parse(stdout);
    expect(envelope.suggestions).toEqual([
      {name: 'astryx upgrade --list', reason: 'list the codemods'},
      {
        name: 'astryx upgrade --from 0.7.5',
        reason: 'show what a migration from that version changes',
      },
    ]);

    const listed = await runCli(['--json', 'upgrade', '--list']);
    expect(listed.status).toBe(0);
  });
});

describe('template --skeleton with a path', () => {
  it('names the skeleton alone and the scaffold to that path', async () => {
    const {status, stdout} = await runCli([
      '--json',
      'template',
      'dashboard',
      'app/x.tsx',
      '--skeleton',
    ]);
    expect(status).toBe(1);
    const envelope = JSON.parse(stdout);
    expect(envelope.suggestions).toEqual([
      {name: 'astryx template dashboard --skeleton', reason: 'print it'},
      {
        name: 'astryx template dashboard app/x.tsx',
        reason: 'scaffold the template there',
      },
    ]);

    const skeleton = await runCli([
      '--json',
      ...words(envelope.suggestions[0].name),
    ]);
    expect(skeleton.status).toBe(0);
  });
});

describe('doctor given paths outside the project', () => {
  it('answers at once and names no folder past the project', async () => {
    const cwd = app();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-outside-'));
    made.push(outside);
    const {status, stdout} = await runCli(
      ['--json', 'doctor', '--built', 'app/page.tsx', outside],
      cwd,
    );
    expect(status).toBe(1);
    const envelope = JSON.parse(stdout);
    expect(envelope.code).toBe('ERR_UNKNOWN_SUBCOMMAND');
    expect(
      (envelope.suggestions ?? []).some((/** @type {{name: string}} */ s) =>
        s.name.includes('--built'),
      ),
    ).toBe(false);
  });
});

describe('an unknown option before an unknown command', () => {
  it('reports the unknown command and names the run once', async () => {
    const {status, stdout} = await runCli([
      '--json',
      'describe',
      'Text',
      '--format',
      'json',
    ]);
    expect(status).toBe(1);
    const envelope = JSON.parse(stdout);
    expect(envelope.code).toBe('ERR_UNKNOWN_COMMAND');
    expect(words(envelope.suggestions[0].name)).toEqual([
      '--json',
      'component',
      'Text',
    ]);

    const named = await runCli(words(envelope.suggestions[0].name));
    expect(named.status).toBe(0);
  });
});

describe('an unknown option with a value before a command', () => {
  it('reports the unknown option and names the run as meant', async () => {
    const {status, stdout} = await runCli([
      '--json',
      '--format',
      'json',
      'component',
      'Text',
    ]);
    expect(status).toBe(1);
    const envelope = JSON.parse(stdout);
    expect(envelope.code).toBe('ERR_INVALID_OPTION');
    expect(envelope.error).toMatch(/^unknown option '--format'/);
    expect(words(envelope.suggestions[0].name)).toEqual([
      '--json',
      'component',
      'Text',
    ]);

    const named = await runCli(words(envelope.suggestions[0].name));
    expect(named.status).toBe(0);
  });
});

describe('an unknown option whose value names no option, before a command', () => {
  it('reports the unknown option, as before', async () => {
    const {status, stdout} = await runCli([
      '--json',
      '--format',
      'text',
      'component',
      'Text',
    ]);
    expect(status).toBe(1);
    const envelope = JSON.parse(stdout);
    expect(envelope.code).toBe('ERR_INVALID_OPTION');
    expect(envelope.error).toMatch(/^unknown option '--format'/);
  });
});
