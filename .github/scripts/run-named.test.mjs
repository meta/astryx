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
