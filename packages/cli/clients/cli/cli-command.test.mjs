// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Every printed command starts with the project's CLI command: the door a host
 * sets, or the `cliCommand` a loaded integration declares. JSON keeps commands
 * bare.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  hasRecordedProject,
  runWithCliDoor,
} from '../../foundation/env/cli-command.mjs';
import {getCliInvocation} from '../../foundation/env/package-manager.mjs';
import {loadProjectForHelp} from './index.mjs';

const BIN = path.resolve(import.meta.dirname, 'bin', 'astryx.mjs');

/** @type {string} */
let tmpDir;

beforeEach(() => {
  // Repo-local, so Vite permits importing the integration manifest.
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-cli-command-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * An app that installs one integration declaring `cliCommand`, with no
 * astryx.config: the integration is autolinked.
 * @param {string} cliCommand
 */
function appWithIntegration(cliCommand) {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'app', dependencies: {'@acme/x': '1.0.0'}}),
  );
  fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '<!-- ASTRYX:START -->\n');
  const pkg = path.join(tmpDir, 'node_modules', '@acme', 'x');
  fs.mkdirSync(pkg, {recursive: true});
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify({name: '@acme/x', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkg, 'astryx.integration.mjs'),
    `export default ${JSON.stringify({cliCommand})};\n`,
  );
}

describe("an integration's cliCommand", () => {
  it('starts the hints of a command that never loads the project itself', async () => {
    appWithIntegration('acme astryx');
    const {status, stderr} = await runCli(['theme', 'remove', 'nope'], tmpDir);
    expect(status).toBe(1);
    expect(stderr).toContain('`acme astryx theme add nope`');
  });
});

describe('the setup nudge in a project with no CLI of its own', () => {
  it('names the declared cliCommand for the step after installing the CLI (spec AST-081 FR5)', async () => {
    // Outside this repository: the nudge stays quiet in the CLI's own checkout.
    const app = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-cli-command-nudge-'),
    );
    try {
      // Only Core, of another release than the CLI that answers, an
      // integration declaring cliCommand, and no agent docs yet.
      fs.writeFileSync(
        path.join(app, 'package.json'),
        JSON.stringify({
          name: 'app',
          dependencies: {'@acme/x': '1.0.0', '@astryxdesign/core': '0.0.1'},
        }),
      );
      fs.writeFileSync(path.join(app, 'package-lock.json'), '{}');
      for (const [name, version, extra] of [
        ['@acme/x', '1.0.0', 'acme astryx'],
        ['@astryxdesign/core', '0.0.1', null],
      ]) {
        const dir = path.join(app, 'node_modules', ...name.split('/'));
        fs.mkdirSync(dir, {recursive: true});
        fs.writeFileSync(
          path.join(dir, 'package.json'),
          JSON.stringify({name, version}),
        );
        if (extra) {
          fs.writeFileSync(
            path.join(dir, 'astryx.integration.mjs'),
            `export default ${JSON.stringify({cliCommand: extra})};\n`,
          );
        }
      }

      const {stderr} = await runCli(['docs', 'tokens'], app);
      expect(stderr).toContain(
        'Next step: run `npm install @astryxdesign/cli@0.0.1`, then `acme astryx init`',
      );
    } finally {
      fs.rmSync(app, {recursive: true, force: true});
    }
  });
});

describe('help', () => {
  it('loads the project for a help run, and only for one', async () => {
    appWithIntegration('acme astryx');
    const cwd = process.cwd();
    process.chdir(tmpDir);
    try {
      await loadProjectForHelp(['docs', 'theme']);
      expect(hasRecordedProject(tmpDir)).toBe(false);
      await loadProjectForHelp(['component', '--help']);
      expect(getCliInvocation(tmpDir)).toBe('acme astryx');
    } finally {
      process.chdir(cwd);
    }
  });

  it("prints the integration's command in `--help`", () => {
    appWithIntegration('acme astryx');
    const result = spawnSync(process.execPath, [BIN, '--help'], {
      cwd: tmpDir,
      encoding: 'utf-8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('acme astryx search button');
  });
});

describe("a host's door", () => {
  it('prefixes doc commands in text and leaves them bare in JSON', async () => {
    const text = await runWithCliDoor('acme astryx', () =>
      runCli(['docs', 'getting-started', '--full']),
    );
    expect(text.stdout).toContain('acme astryx init');

    const json = await runWithCliDoor('acme astryx', () =>
      runCli(['docs', 'getting-started', '--json']),
    );
    expect(json.stdout).toContain('astryx init');
    expect(json.stdout).not.toContain('acme astryx');
  });

  it('prefixes suggested commands in text and leaves them bare in JSON', async () => {
    const text = await runWithCliDoor('acme astryx', () =>
      runCli(['search', '']),
    );
    expect(text.stderr).toContain('acme astryx search button');

    const json = await runWithCliDoor('acme astryx', () =>
      runCli(['search', '', '--json']),
    );
    expect(JSON.parse(json.stdout).suggestions[0].name).toBe(
      'astryx search button',
    );
  });
});
