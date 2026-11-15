// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: the pull-request visual checks read the visual baseline from
 *   the head that built the Storybook they compare, never from the tested
 *   merge commit.
 *
 * A branch behind a main baseline refresh holds the old baseline at its head,
 * and builds its Storybook there. Read from the merge commit, the baseline is
 * main's new one, so main's accepted pixel changes look like the branch's own.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterAll, describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const BASELINE = '.github/visual-baseline';
const HEAD_REF = /\$\{\{\s*github\.event\.pull_request\.head\.sha\b/;

/** Every `--baseline`/`--baseline-manifest` path a job passes on a pull request. */
function baselinePaths(job) {
  const out = [];
  for (const step of job.steps) {
    const condition = String(step.if ?? '');
    // Steps that never run on a pull request (a release check, a capture).
    if (/github\.event_name == 'workflow_dispatch'/.test(condition)) continue;
    for (const match of String(step.run ?? '').matchAll(
      /--baseline(?:-manifest)?\s+(\S+)/g,
    )) {
      if (match[1].includes('visual-baseline'))
        out.push({step: step.name, path: match[1]});
    }
  }
  return out;
}

/**
 * Which commit a job's file path reads from: a checkout into a `path:` at the
 * pull request head, or else the job's own checkout of the merge commit.
 */
function sourceOf(job, file) {
  for (const step of job.steps) {
    const dir = step.with?.path;
    if (!String(step.uses ?? '').startsWith('actions/checkout') || !dir)
      continue;
    if (file.startsWith(`${dir}/`)) {
      return {
        commit: HEAD_REF.test(String(step.with.ref ?? '')) ? 'head' : 'merge',
        file: file.slice(dir.length + 1),
      };
    }
  }
  return {commit: 'merge', file};
}

// A branch cut before main refreshed its baseline, and its tested merge.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-baseline-'));
afterAll(() => fs.rmSync(dir, {recursive: true, force: true}));
const git = (...args) =>
  execFileSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
    },
  }).trim();
const write = (file, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
  fs.writeFileSync(path.join(dir, file), text);
};
git('init', '-q', '-b', 'main');
write(`${BASELINE}/manifest.json`, '{"shots": "before the refresh"}\n');
write(`${BASELINE}/shots/core-button.png`, 'old pixels\n');
git('add', '-A');
git('commit', '-q', '-m', 'base');
git('checkout', '-q', '-b', 'topic');
write('packages/core/src/Card/Card.tsx', 'export const Card = 1;\n');
git('add', '-A');
git('commit', '-q', '-m', 'the change');
const head = git('rev-parse', 'HEAD');
git('checkout', '-q', 'main');
write(`${BASELINE}/manifest.json`, '{"shots": "after the refresh"}\n');
write(`${BASELINE}/shots/core-button.png`, 'new pixels\n');
git('commit', '-q', '-am', 'refresh the visual baseline');
git('merge', '-q', '--no-edit', head);
const merge = git('rev-parse', 'HEAD');
const read = (commit, file) =>
  git('show', `${commit === 'head' ? head : merge}:${file}`);

describe('the pull-request visual checks', () => {
  for (const name of ['visual-scout', 'pr-visual', 'pr-touched-components']) {
    const job = ci.jobs[name];
    const paths = baselinePaths(job);

    it(`${name} passes a visual baseline on a pull request`, () => {
      expect(paths.length).toBeGreaterThan(0);
    });

    it(`${name} reads the head's baseline on a branch behind a baseline refresh`, () => {
      for (const {step, path: file} of paths) {
        const source = sourceOf(job, file);
        const probe = source.file.endsWith('manifest.json')
          ? source.file
          : `${source.file}/manifest.json`;
        expect(read(source.commit, probe), `${step}: ${file}`).toBe(
          read('head', `${BASELINE}/manifest.json`),
        );
      }
    });
  }

  it('checks out only the baseline at the head, without credentials', () => {
    for (const name of ['visual-scout', 'pr-visual']) {
      const checkout = ci.jobs[name].steps.find(
        step => step.name === "Check out the head's visual baseline",
      );
      expect(checkout.with).toMatchObject({
        path: '.head-visual-baseline',
        'sparse-checkout': BASELINE,
        'persist-credentials': false,
      });
      expect(checkout.with.ref).toMatch(HEAD_REF);
    }
  });
});
