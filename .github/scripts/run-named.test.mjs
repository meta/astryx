// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file run-named.sh names the failing command of a CI step that runs several,
 * and the UI and Node test steps run each of their commands through it.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import YAML from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const script = path.join(root, '.github/scripts/run-named.sh');
const run = (...args) =>
  spawnSync('bash', [script, ...args], {encoding: 'utf8'});

describe('run-named.sh', () => {
  it('groups a passing command and adds no error', () => {
    const result = run('Tests the change reaches', '--', 'echo', 'all passed');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      '::group::Tests the change reaches\nall passed\n::endgroup::\n',
    );
  });

  it('names a failing command in an error annotation and keeps its exit status', () => {
    const result = run(
      'Tests that read source files',
      '--',
      'bash',
      '-c',
      'exit 3',
    );
    expect(result.status).toBe(3);
    expect(result.stdout).toContain(
      '::error title=Tests that read source files failed::Tests that read source files exited with status 3.',
    );
    // The error follows the group, so the log view shows it outside it.
    expect(result.stdout.indexOf('::endgroup::')).toBeLessThan(
      result.stdout.indexOf('::error'),
    );
  });

  it('sends standard output to a file with --stdout, and fails when the command fails', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-named-'));
    try {
      const file = path.join(dir, 'list.txt');
      const ok = run('List', '--stdout', file, '--', 'printf', 'a\\nb\\n');
      expect(ok.status).toBe(0);
      expect(fs.readFileSync(file, 'utf8')).toBe('a\nb\n');
      const failed = run(
        'List',
        '--stdout',
        file,
        '--',
        'bash',
        '-c',
        'echo boom >&2; exit 1',
      );
      expect(failed.status).toBe(1);
      expect(failed.stderr).toContain('boom');
      expect(failed.stdout).toContain('::error title=List failed::');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe('run-named.sh on a failing test run', () => {
  // Vitest's shape: a FAIL line, the assertion, and the stack line naming the
  // test file, with colour codes as a CI terminal gets them.
  const vitestFailure = [
    'printf "\\033[32m ✓\\033[39m |node| a.test.mjs (3 tests)\\n"',
    'printf "\\033[31m FAIL \\033[39m |node| .github/scripts/ci-test-routing.test.mjs > ci.yml test routing > splits each lane\\n"',
    'printf "AssertionError: expected 1 to be 2 // 100%% sure\\n"',
    'printf " ❯ .github/scripts/ci-test-routing.test.mjs:287:45\\n"',
    'printf " Test Files  1 failed | 1 passed (2)\\n"',
    'exit 1',
  ].join('; ');

  it('prints the failure lines after the group and names the first failing file and line', () => {
    const result = run(
      'Tests that read source files',
      '--',
      'bash',
      '-c',
      vitestFailure,
    );
    expect(result.status).toBe(1);
    const after = result.stdout.slice(result.stdout.indexOf('::endgroup::'));
    expect(after).toContain(
      'Tests that read source files failed. Its failure lines:',
    );
    expect(after).toContain(
      ' FAIL  |node| .github/scripts/ci-test-routing.test.mjs > ci.yml test routing > splits each lane',
    );
    expect(after).toContain('AssertionError: expected 1 to be 2');
    expect(after).not.toContain('\u001b[');
    expect(after).not.toContain('a.test.mjs (3 tests)');
    const error = after.split('\n').find(line => line.startsWith('::error '));
    expect(error).toMatch(
      /^::error file=\.github\/scripts\/ci-test-routing\.test\.mjs,line=287,title=Tests that read source files failed::Tests that read source files exited with status 1\. First failure: FAIL {2}\|node\| /,
    );
  });

  it('escapes a percent sign in the annotation and keeps it on one line', () => {
    const result = run(
      'T',
      '--',
      'bash',
      '-c',
      'echo "Error: 100% broken"; exit 2',
    );
    const error = result.stdout
      .split('\n')
      .find(line => line.startsWith('::error '));
    expect(error).toContain('First failure: Error: 100%25 broken');
    expect(error).not.toContain('file=');
  });

  it('caps the failure lines at 30', () => {
    const result = run(
      'T',
      '--',
      'bash',
      '-c',
      'for i in $(seq 1 50); do echo " FAIL  |ui| f$i.test.tsx"; done; exit 1',
    );
    const after = result.stdout.slice(result.stdout.indexOf('::endgroup::'));
    expect(
      after.split('\n').filter(line => line.startsWith(' FAIL ')).length,
    ).toBe(30);
  });

  it('reads the failure lines from standard error with --stdout', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-named-'));
    try {
      const file = path.join(dir, 'list.txt');
      const result = run(
        'List',
        '--stdout',
        file,
        '--',
        'bash',
        '-c',
        'echo listed; echo "Error: cannot read the list" >&2; exit 1',
      );
      expect(fs.readFileSync(file, 'utf8')).toBe('listed\n');
      expect(result.stderr).toContain('Error: cannot read the list');
      expect(result.stdout).toContain(
        'List failed. Its failure lines:\nError: cannot read the list',
      );
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('adds nothing but the old error when a failing command prints no failure line', () => {
    const result = run('T', '--', 'bash', '-c', 'echo quiet; exit 4');
    expect(result.stdout).toBe(
      '::group::T\nquiet\n::endgroup::\n::error title=T failed::T exited with status 4. Its output is in the "T" group of this step\'s log.\n',
    );
  });
});

describe('the UI and Node test steps', () => {
  const workflow = YAML.parse(
    fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
  );
  const steps = [
    ['test-ui', 'Run this shard of the UI tests'],
    ['test-node', 'Run this shard of the Node tests'],
  ].map(([job, name]) =>
    workflow.jobs[job].steps.find(step => step.name === name),
  );

  it('run every command of a multi-command branch through run-named.sh', () => {
    for (const step of steps) {
      const commands = step.run
        .split('\n')
        .map(line => line.trim())
        .filter(line => /(pnpm test:|fs-guard-tests\.mjs)/.test(line));
      // The full run is one command; every other command is named.
      const multi = commands.filter(
        line => !/^pnpm test:(ui|node) --shard=/.test(line),
      );
      expect(multi.length).toBeGreaterThan(0);
      for (const line of multi) {
        expect(line).toMatch(/^\.github\/scripts\/run-named\.sh "[^"]+" /);
      }
    }
  });
});
