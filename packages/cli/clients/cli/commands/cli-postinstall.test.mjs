// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Guardrail tests for the @astryxdesign/cli postinstall nudge (layer 2).
 *
 * Tests the pure decision matrix (shouldNudge) — nudges for a real dependency
 * install when not set up; stays quiet in the monorepo/source, during npx's
 * transient fetch (path _npx or npm_command=exec), and once set up.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {shouldNudge} from '../../../scripts/postinstall.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const DEP = '/proj/node_modules/@astryxdesign/cli/scripts/postinstall.mjs'; // real dep install
const NPX = '/Users/x/.npm/_npx/a1b2/node_modules/@astryxdesign/cli/scripts/postinstall.mjs';
const REPO = '/repo/packages/cli/scripts/postinstall.mjs'; // monorepo/source

describe('cli postinstall — shouldNudge', () => {
  it('nudges for a real dependency install when not set up', () => {
    expect(shouldNudge({scriptPath: DEP, npmCommand: 'install', isSetUp: false})).toBe(true);
  });

  it('quiet in the monorepo/source (not under node_modules)', () => {
    expect(shouldNudge({scriptPath: REPO, npmCommand: 'install', isSetUp: false})).toBe(false);
  });

  it('quiet during npx transient install (path contains _npx)', () => {
    expect(shouldNudge({scriptPath: NPX, npmCommand: 'install', isSetUp: false})).toBe(false);
  });

  it('quiet during npx (npm_command=exec) — avoids double-nudge before init', () => {
    expect(shouldNudge({scriptPath: DEP, npmCommand: 'exec', isSetUp: false})).toBe(false);
  });

  it('quiet once the project is already set up', () => {
    expect(shouldNudge({scriptPath: DEP, npmCommand: 'install', isSetUp: true})).toBe(false);
  });

  it('quiet with no script path (defensive)', () => {
    expect(shouldNudge({})).toBe(false);
  });
});

// Install time, end to end: the real script and the leaf it loads, installed
// under a monorepo's node_modules, run the way npm runs them for a package.
describe('cli postinstall — inside a monorepo package', () => {
  let repo;
  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-cli-postinstall-'));
    fs.mkdirSync(path.join(repo, '.git'));
    fs.mkdirSync(path.join(repo, 'packages/app'), {recursive: true});
    fs.writeFileSync(path.join(repo, 'packages/app/package.json'), '{"name":"app"}');
    const installed = path.join(repo, 'node_modules/@astryxdesign/cli');
    for (const rel of ['scripts/postinstall.mjs', 'foundation/agent-docs/agent-doc-state.mjs']) {
      fs.mkdirSync(path.dirname(path.join(installed, rel)), {recursive: true});
      fs.copyFileSync(path.join(CLI, rel), path.join(installed, rel));
    }
  });
  afterEach(() => fs.rmSync(repo, {recursive: true, force: true}));

  const install = () =>
    spawnSync(
      process.execPath,
      [path.join(repo, 'node_modules/@astryxdesign/cli/scripts/postinstall.mjs')],
      {
        env: {...process.env, INIT_CWD: path.join(repo, 'packages/app'), npm_command: 'install'},
        encoding: 'utf8',
      },
    );

  it('stays quiet when init ran at the repository root', () => {
    fs.writeFileSync(path.join(repo, 'AGENTS.md'), '<!-- ASTRYX:START -->\n');
    const r = install();
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });

  it('still nudges when no folder up to the repository root ran init', () => {
    const r = install();
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/finish setup and install the Astryx agent prompt/);
  });
});
