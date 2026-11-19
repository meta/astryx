// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: a Lab-only pull request that edits an interaction spec still
 *   runs each spec it edits, in both engines, and nothing else
 *   (spec:AST-030 FR26).
 *
 * A Lab-only change once skipped the interaction proofs whole, so a pull
 * request that changed only a Lab interaction spec ran none of it.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterAll, describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const SPECS = '\\.interaction\\.browser\\.spec\\.ts$';
const SPEC =
  'packages/lab/src/NavigationStack/__tests__/NavigationStack.interaction.browser.spec.ts';
const step = (job, predicate) => {
  const found = ci.jobs[job].steps.find(predicate);
  if (!found) throw new Error(`${job} has no such step`);
  return found;
};
const named = name => candidate => candidate.name === name;
const byId = id => candidate => candidate.id === id;

// The scope steps of the interaction lanes, and the steps that plan from them.
const SCOPES = [
  ['interaction-legs', 'scope-chromium'],
  ['interaction-legs', 'scope-webkit'],
  ['pr-interaction', 'scope'],
  ['pr-interaction-webkit', 'scope'],
];
const CHROMIUM = [
  ['interaction-legs', 'Count the Chromium legs', 'scope-chromium'],
  ['pr-interaction', "Count this run's legs", 'scope'],
  ['pr-interaction', "Plan this leg's interaction proofs", 'scope'],
];
const WEBKIT = [
  ['interaction-legs', 'Count the WebKit legs', 'scope-webkit'],
  ['pr-interaction-webkit', "Count this run's WebKit legs", 'scope'],
];

// Runs a step's script with `node` and `git` replaced by stubs that record
// their arguments, one call a line, each argument NUL-separated.
const dirs = [];
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, {recursive: true, force: true});
});
function runScript(script, env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-specs-'));
  dirs.push(dir);
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const calls = path.join(dir, 'calls');
  for (const tool of ['node', 'git']) {
    fs.writeFileSync(
      path.join(bin, tool),
      `#!/bin/bash\nprintf '%s\\0' ${tool} "$@" >> "${calls}"\necho >> "${calls}"\n`,
      {mode: 0o755},
    );
  }
  const temp = path.join(dir, 'temp');
  fs.mkdirSync(path.join(temp, 'interaction-legs'), {recursive: true});
  const result = spawnSync(
    'bash',
    ['-e', '-c', script.replaceAll(/\$\{\{[^}]*\}\}/g, '1')],
    {
      cwd: dir,
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        RUNNER_TEMP: temp,
        GITHUB_OUTPUT: path.join(dir, 'output'),
        WEBKIT_SPEC_PATHS: 'packages/core/src/gestures/',
        WEBKIT_SHARED_PATHS: '^packages/core/src/gestures/',
        ...env,
      },
    },
  );
  const recorded = fs.existsSync(calls)
    ? fs
        .readFileSync(calls, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(line => line.split('\0').filter(Boolean))
    : [];
  return {result, calls: recorded, temp};
}

function labSpecsFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-specs-list-'));
  dirs.push(dir);
  const file = path.join(dir, 'specs.txt');
  fs.writeFileSync(file, `${SPEC}\n`);
  return file;
}

describe('a Lab-only change that edits an interaction spec', () => {
  it('names interaction specs as Lab-only work in every interaction scope step', () => {
    for (const [job, id] of SCOPES) {
      expect(step(job, byId(id)).with['lab-only-specs'], `${job} ${id}`).toBe(
        SPECS,
      );
    }
  });

  it('plans only the edited specs in Chromium, in the count and in the plan', () => {
    for (const [job, name, scope] of CHROMIUM) {
      const counted = step(job, named(name));
      expect(counted.env.LAB_SPECS, `${job} ${name}`).toBe(
        `\${{ steps.${scope}.outputs.lab_specs_path }}`,
      );
      const {result, calls} = runScript(counted.run, {
        LAB_SPECS: labSpecsFile(),
      });
      expect(result.status, result.stderr).toBe(0);
      const planner = calls.find(call => call[0] === 'node');
      expect(planner.slice(-2), `${job} ${name}`).toEqual(['--', SPEC]);
      // Without the list, the step plans as before: no filter.
      const plain = runScript(counted.run, {LAB_SPECS: ''});
      expect(plain.result.status, plain.result.stderr).toBe(0);
      expect(plain.calls.find(call => call[0] === 'node')).not.toContain('--');
    }
  });

  it('runs only the edited specs in WebKit, never the folder or shared paths', () => {
    for (const [job, name, scope] of WEBKIT) {
      const counted = step(job, named(name));
      expect(counted.env.LAB_SPECS, `${job} ${name}`).toBe(
        `\${{ steps.${scope}.outputs.lab_specs_path }}`,
      );
      const {result, calls, temp} = runScript(counted.run, {
        LAB_SPECS: labSpecsFile(),
        CHANGED_FILES: '',
      });
      expect(result.status, result.stderr).toBe(0);
      const nodes = calls.filter(call => call[0] === 'node');
      expect(nodes.map(call => call[2])).toEqual(['legs']);
      expect(nodes[0].slice(-2)).toEqual(['--', SPEC]);
      expect(
        fs.readFileSync(
          path.join(temp, 'interaction-legs', 'selected.txt'),
          'utf8',
        ),
      ).toBe(`${SPEC}\n`);
      // Without the list, it selects as before.
      const plain = runScript(counted.run, {LAB_SPECS: '', CHANGED_FILES: ''});
      expect(
        plain.calls.filter(call => call[0] === 'node').map(call => call[2]),
      ).toEqual(['select']);
    }
  });
});
