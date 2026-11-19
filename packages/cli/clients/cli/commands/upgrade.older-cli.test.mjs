// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx upgrade` with a CLI older than the installed Core: the human
 * output never says the code is up to date, warns once with the same upgrade
 * pinned to the CLI release that matches the Core, and keeps the exit status;
 * `--json` carries the same facts in `cliBehindCore`. Pasted anywhere, the
 * printed command runs that upgrade in the same project.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {CLI_ROOT} from '../../../foundation/fs/paths.mjs';
import {
  commandInFolder,
  getDlxPrefix,
  quoteCommandArgument,
} from '../../../foundation/env/package-manager.mjs';

const CLI_VERSION = JSON.parse(
  fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'),
).version;
const [MAJOR, MINOR] = CLI_VERSION.split('.').map(Number);
const NEWER_CORE = `${MAJOR}.${MINOR + 1}.0`;
const NON_ASCII = /[\u0080-\uFFFF]/;

let tmpDir;

/** @param {string} rel @param {string} body */
function write(rel, body) {
  const file = path.join(tmpDir, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, body);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-upgrade-older-cli-'));
  write('package.json', JSON.stringify({name: 'consumer', private: true}));
  write(
    'node_modules/@astryxdesign/core/package.json',
    JSON.stringify({name: '@astryxdesign/core', version: NEWER_CORE}),
  );
  write('src/index.ts', 'export const x = 1;\n');
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * The pinned command the CLI prints for this project. It names the folder the
 * CLI ran in and the source directory as the CLI resolved them.
 * @param {...string} rest the arguments after `--path <dir>`
 */
function pinned(...rest) {
  const project = fs.realpathSync(tmpDir);
  return commandInFolder(
    project,
    [
      getDlxPrefix(tmpDir),
      `@astryxdesign/cli@${NEWER_CORE}`,
      'upgrade',
      '--from',
      CLI_VERSION,
      '--path',
      quoteCommandArgument(path.join(project, 'src')),
      ...rest,
    ].join(' '),
  );
}

/**
 * Stand-ins for the package runners: each drops its own words and the pinned
 * package, then runs this CLI with the rest of the command.
 */
const RUNS_THIS_CLI = [
  ['npx', 1],
  ['bunx', 1],
  ['pnpm', 2],
  ['yarn', 2],
]
  .map(
    ([name, words]) =>
      `${name}() { shift ${words}; "$0" ${quoteCommandArgument(path.join(CLI_ROOT, 'clients', 'cli', 'bin', 'astryx.mjs'))} "$@"; }`,
  )
  .join('; ');

describe('astryx upgrade with a CLI older than the installed Core', () => {
  it('says it cannot finish and prints the upgrade pinned to the matching CLI', async () => {
    const r = await runCli(['upgrade', '--from', CLI_VERSION, '--apply'], {
      cwd: tmpDir,
    });
    const output = `${r.stdout}\n${r.stderr}`;

    expect(r.status).toBe(0);
    expect(output).not.toMatch(/up to date/i);
    expect(output).not.toContain('No codemods available');
    expect(r.stderr).toContain(
      `This CLI (${CLI_VERSION}) is older than the installed @astryxdesign/core (${NEWER_CORE})`,
    );
    // The command has a line of its own, so it copies exactly.
    expect(r.stderr).toContain(
      `the CLI that matches your Core:\n  ${pinned('--apply')}\n`,
    );
    expect(r.stdout.trim().split('\n').at(-1)).toBe('Upgrade incomplete');
    expect(output.split('\n').filter(line => NON_ASCII.test(line))).toEqual([]);
  });

  it('carries cliBehindCore in --json with the same exit status', async () => {
    const r = await runCli(['--json', 'upgrade', '--from', CLI_VERSION], {
      cwd: tmpDir,
    });
    const parsed = JSON.parse(r.stdout);

    expect(r.status).toBe(0);
    expect(parsed.type).toBe('upgrade.status');
    expect(parsed.data.status).toBe('no_codemods');
    expect(parsed.data.cliBehindCore).toEqual({
      cliVersion: CLI_VERSION,
      command: pinned(),
    });
  });

  // Where an upgrade runs decides what it finds: the installed Core is read
  // from that folder, and --path must stay inside it. Printed without its
  // folder, the command exited 1 when pasted in a subfolder
  // (ERR_PATH_TRAVERSAL) or in the folder above (ERR_VERSION_DETECT).
  it.skipIf(process.platform === 'win32')(
    'prints a command that upgrades the same project wherever it is pasted',
    async () => {
      write('src/deep/index.ts', 'export const y = 2;\n');
      const r = await runCli(['--json', 'upgrade', '--from', CLI_VERSION], {
        cwd: tmpDir,
      });
      const {command} = JSON.parse(r.stdout).data.cliBehindCore;

      for (const pastedIn of [
        path.join(tmpDir, 'src', 'deep'),
        path.dirname(tmpDir),
      ]) {
        const ran = spawnSync(
          '/bin/sh',
          ['-c', `${RUNS_THIS_CLI}; ${command}`, process.execPath],
          {cwd: pastedIn, encoding: 'utf8'},
        );

        expect(ran.status, ran.stderr).toBe(0);
        expect(ran.stdout).toContain(`Installed target: ${NEWER_CORE}`);
        expect(ran.stdout).toContain(
          `Scanning ${path.join(fs.realpathSync(tmpDir), 'src')} `,
        );
      }
    },
    30_000,
  );
});
