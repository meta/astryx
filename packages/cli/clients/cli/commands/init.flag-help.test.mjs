// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx init` documents how its flags interact and when it exits 1, and
 * behaves as documented. Option text is read from the generated manifest (the
 * same strings `--help` prints); exit codes from the CommandDoc.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {doc as initDoc} from './init.doc.mjs';

const MARKER_START = '<!-- ASTRYX:START -->';

/** @type {string} */
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-init-flags-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** @param {string} rel */
const exists = rel => fs.existsSync(path.join(tmpDir, rel));
/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(tmpDir, rel), 'utf8');

/**
 * init's option descriptions from the manifest, keyed by long flag.
 * @returns {Promise<Record<string, string>>}
 */
async function initOptions() {
  const {stdout} = await runCli(['--json', 'manifest'], tmpDir);
  const init = JSON.parse(stdout).data.commands.find(
    (/** @type {{name: string}} */ c) => c.name === 'init',
  );
  return Object.fromEntries(
    init.options.map((/** @type {{flag: string, description: string}} */ o) => [
      o.flag.match(/--[a-z-]+/)?.[0],
      o.description,
    ]),
  );
}

/** @param {string[]} args */
async function initJson(args) {
  const result = await runCli(['--json', 'init', ...args], tmpDir);
  return {status: result.status, envelope: JSON.parse(result.stdout)};
}

/** @param {number} code */
const exitWhen = code => initDoc.exitCodes?.find(e => e.code === code)?.when ?? '';

describe('astryx init flag interactions', () => {
  it('--remove-agents: help says it only removes the block, and it ignores every install flag', async () => {
    const help = (await initOptions())['--remove-agents'];
    for (const flag of ['--features', '--all', '--agent', '--agent-docs-path']) {
      expect(help).toContain(flag);
    }
    for (const file of ['AGENTS.md', '.claude/CLAUDE.md', '.cursorrules', '.hermes.md', 'HERMES.md']) {
      expect(help).toContain(file);
    }
    expect(help).toMatch(/--agent-docs-path are refused/);
    expect(help).toMatch(/at the project root \(where init writes them\) and in this folder/);

    await initJson(['--agent-docs-path', 'docs/AI.md']);
    await initJson([]);
    expect(exists('AGENTS.md')).toBe(true);

    const removed = await initJson([
      '--remove-agents',
      '--features',
      'bogus',
      '--all',
      '--agent',
      'bogus',
      '--agent-docs-path',
      'docs/AI.md',
    ]);
    expect(removed.status).toBe(1);
    expect(removed.envelope.code).toBe('ERR_INVALID_ARGUMENT');
  });

  it('--all: help says it overrides --features, and an unknown feature beside it is not checked', async () => {
    const options = await initOptions();
    expect(options['--all']).toMatch(/refused with --features/);
    expect(options['--features']).toMatch(/Refused with --all or --remove-agents/);
    expect(options['--features']).toContain('ERR_UNKNOWN_FEATURE');

    const {status, envelope} = await initJson(['--all', '--features', 'bogus']);
    expect(status).toBe(1);
    expect(envelope.code).toBe('ERR_INVALID_ARGUMENT');
  });

  it('--agent and --agent-docs-path: help states their scope and precedence, and the CLI follows it', async () => {
    const options = await initOptions();
    expect(options['--agent']).toMatch(/Used only when agent docs are installed/);
    expect(options['--agent']).toMatch(/--agent-docs-path takes precedence/);
    expect(options['--agent']).toContain('ERR_UNKNOWN_AGENT');
    expect(options['--agent-docs-path']).toMatch(/takes precedence over --agent/);
    expect(options['--agent-docs-path']).toMatch(/outside the project.*exits 1/);
    expect(options['--agent-docs-path']).toMatch(/Used only when agent docs are installed/);

    const unused = await initJson([
      '--features',
      'theme',
      '--agent',
      'bogus',
      '--agent-docs-path',
      '../outside.md',
    ]);
    expect(unused.status).toBe(0);
    expect(unused.envelope.data.docsWritten).toEqual([]);

    const explicit = await initJson(['--agent', 'claude', '--agent-docs-path', 'docs/AI.md']);
    expect(explicit.status).toBe(0);
    expect(explicit.envelope.data.docsWritten).toEqual(['docs/AI.md']);
    expect(exists('CLAUDE.md') || exists('.claude/CLAUDE.md')).toBe(false);
  });
});

describe('astryx init exit codes', () => {
  it('exit 1: the CommandDoc lists an --agent-docs-path escape, which exits 1 in both modes and writes nothing', async () => {
    expect(exitWhen(1)).toMatch(/--agent-docs-path outside the project/);
    // The CLI never scaffolds a page template, so no template case can exit 1.
    expect(exitWhen(1)).not.toMatch(/template/);

    const text = await runCli(['init', '--agent-docs-path', 'ok.md', '../outside.md'], tmpDir);
    const json = await initJson(['--agent-docs-path', 'ok.md', '../outside.md']);
    expect(text.status).toBe(1);
    expect(json.status).toBe(1);
    expect(json.envelope.data.docsError.kind).toBe('path-safety');
    expect(exists('ok.md')).toBe(false);
  });

  it('exit 0: the CommandDoc says a soft agent-docs failure still exits 0, and it does', async () => {
    expect(exitWhen(0)).toMatch(/docsError/);

    // A directory where AGENTS.md belongs makes the write fail without a path escape.
    fs.mkdirSync(path.join(tmpDir, 'AGENTS.md'));
    const {status, envelope} = await initJson([]);
    expect(status).toBe(0);
    expect(envelope.data.docsError).toEqual({kind: 'install-failed'});
  });
});
