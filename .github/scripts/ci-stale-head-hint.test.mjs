// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ci-stale-head-hint.test.mjs
 * @description Proves that a failed interaction leg on a head older than main
 *   names each newer main commit that changed a spec the leg ran, or the
 *   harness, and asks for an updated branch.
 * @input ci.yml's "Explain a failure on an older head" steps, run against a
 *   small local repository.
 * @output Vitest assertions.
 * @position .github/scripts tests.
 */

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const NAME = 'Explain a failure on an older head';
const step = (job, name) => job.steps.find(each => each.name === name);
const LANES = {
  'pr-interaction': {
    gate: "steps.scope.outputs.applies == 'true' && steps.legs.outputs.runs == 'true'",
    run: 'Run interaction proofs',
  },
  'pr-interaction-webkit': {
    gate: "steps.scope.outputs.applies == 'true' && steps.legs.outputs.runs == 'true'",
    run: 'Run WebKit interaction proofs',
  },
};

describe('the stale-head hint in the interaction legs', () => {
  for (const [id, {gate, run}] of Object.entries(LANES)) {
    it(`${id} explains a failure after its proofs, without failing the leg further`, () => {
      const job = ci.jobs[id];
      const hint = step(job, NAME);
      // Only after a plan that succeeded: a failed plan leaves no list.
      expect(hint.if).toBe(
        `failure() && ${gate} && steps.plan.outcome == 'success' && steps.plan.outputs.files != '0'`,
      );
      expect(hint['continue-on-error']).toBe(true);
      // The base branch's tip at step time, not the run's merge commit, so a
      // re-run also sees a fix that landed after the run started.
      expect(hint.env).toEqual({
        BASE_REF: '${{ github.event.pull_request.base.ref }}',
      });
      // One script for both lanes, copied from the workflow's own commit
      // with the merge-base helper it calls, and given this leg's own plan.
      expect(hint.run).toBe(
        'bash "$RUNNER_TEMP/interaction-legs/.github/scripts/stale-head-hint.sh" "$BASE_REF" "$RUNNER_TEMP/interaction-leg.txt"',
      );
      const keep = step(job, "Keep the leg planner from the workflow's commit");
      for (const script of ['stale-head-hint.sh', 'merge-base.sh'])
        expect(keep.run).toContain(
          `cp .test-scope/.github/scripts/${script} "$RUNNER_TEMP/interaction-legs/.github/scripts/"`,
        );
      const scope = new RegExp(
        job.steps.find(each => each.id === 'scope').with.paths,
      );
      expect(scope.test('.github/scripts/stale-head-hint.sh')).toBe(true);
      expect(scope.test('.github/scripts/merge-base.sh')).toBe(true);
      const at = job.steps.indexOf(hint);
      expect(at).toBe(job.steps.indexOf(step(job, run)) + 1);
      expect(job.steps[at + 1].uses).toMatch(/^actions\/upload-artifact@/);
    });
  }

  describe('run against a repository', () => {
    let dir;
    const spec =
      'packages/core/src/Row/__tests__/Row.interaction.browser.spec.ts';
    const other =
      'packages/core/src/Other/__tests__/Other.interaction.browser.spec.ts';
    let fixed;
    let current;
    let harnessSpecFix;
    const harnessSpec =
      'internal/interaction-harness/src/harness.interaction.browser.spec.ts';
    let later;

    function git(cwd, ...args) {
      return execFileSync('git', ['-C', cwd, ...args], {
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 't',
          GIT_AUTHOR_EMAIL: 't@example.com',
          GIT_COMMITTER_NAME: 't',
          GIT_COMMITTER_EMAIL: 't@example.com',
        },
      }).trim();
    }
    function commit(cwd, files, message) {
      for (const [file, text] of Object.entries(files)) {
        fs.mkdirSync(path.join(cwd, path.dirname(file)), {recursive: true});
        fs.writeFileSync(path.join(cwd, file), text);
      }
      git(cwd, 'add', '-A');
      git(cwd, 'commit', '-qm', message, '--no-verify');
      return git(cwd, 'rev-parse', 'HEAD');
    }

    beforeAll(() => {
      dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'stale-')));
      const work = path.join(dir, 'work');
      fs.mkdirSync(work);
      git(work, 'init', '-q', '-b', 'main');
      const start = commit(
        work,
        {
          [spec]: 'v1',
          [other]: 'v1',
          'internal/interaction-harness/src/busy.ts': 'v1',
          'README.md': 'v1',
        },
        'start',
      );
      // The head branches here and changes nothing main changes later.
      git(work, 'checkout', '-q', '-b', 'topic');
      const head = commit(work, {'packages/core/src/Row/Row.tsx': 'x'}, 'head');
      git(work, 'checkout', '-q', 'main');
      // One commit changes two specs the leg ran; its subject holds a "%".
      fixed = commit(
        work,
        {[spec]: 'v2', [other]: 'v2'},
        'test(Row): the release reads 100%',
      );
      commit(work, {'README.md': 'v2'}, 'docs: readme');
      commit(
        work,
        {'internal/interaction-harness/src/busy.test.ts': 'v2'},
        'test: a harness unit test',
      );
      commit(
        work,
        {'internal/interaction-harness/src/busy.lateblock.fixture.ts': 'v2'},
        'test: a harness unit-test fixture',
      );
      harnessSpecFix = commit(
        work,
        {[harnessSpec]: 'v2'},
        "test(interaction-harness): the harness's own spec",
      );
      // The run's merge commit; main then moves on past it.
      git(work, 'merge', '-q', '--no-ff', '--no-edit', 'topic');
      later = commit(
        work,
        {'internal/interaction-harness/src/busy.ts': 'v3'},
        'fix(harness): a later fix',
      );
      // A head already on the newest main has nothing to explain.
      git(work, 'checkout', '-q', '-b', 'current');
      current = commit(work, {'packages/core/src/Row/Row.tsx': 'y'}, 'current');
      git(work, 'config', 'uploadpack.allowFilter', 'true');
      git(work, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
      fs.writeFileSync(path.join(dir, 'start.txt'), start);
      fs.writeFileSync(path.join(dir, 'head.txt'), head);
    });

    afterAll(() => fs.rmSync(dir, {recursive: true, force: true}));

    function explain(headSha, plan) {
      const checkout = fs.mkdtempSync(path.join(dir, 'checkout-'));
      git(checkout, 'init', '-q');
      git(
        checkout,
        'remote',
        'add',
        'origin',
        `file://${path.join(dir, 'work')}`,
      );
      git(checkout, 'fetch', '-q', '--depth=1', 'origin', headSha);
      git(checkout, 'checkout', '-q', 'FETCH_HEAD');
      const temp = fs.mkdtempSync(path.join(dir, 'temp-'));
      const list = path.join(temp, 'interaction-leg.txt');
      fs.writeFileSync(list, plan.map(file => `${file}\n`).join(''));
      return spawnSync(
        'bash',
        [path.join(root, '.github/scripts/stale-head-hint.sh'), 'main', list],
        {cwd: checkout, encoding: 'utf8'},
      );
    }

    it('names the main commit that changed a spec the leg ran, and nothing else', () => {
      const head = fs.readFileSync(path.join(dir, 'head.txt'), 'utf8');
      const out = explain(head, [spec, other]);
      expect(out.status).toBe(0);
      const warnings = out.stdout
        .split('\n')
        .filter(line => line.startsWith('::warning'));
      // Newest first, as git log lists them; the first landed after the run's
      // merge commit, so the hint reads main's tip. The subject's "%" is
      // escaped once on each line of a commit that changed two specs.
      expect(warnings).toEqual([
        `::warning title=Update your branch before debugging::internal/interaction-harness/src/busy.ts changed on main in ${later.slice(0, 7)} (fix(harness): a later fix), which this head does not have. Update the branch onto main and re-run: a test whose file changed on main gets an update, not a retry.`,
        `::warning title=Update your branch before debugging::${other} changed on main in ${fixed.slice(0, 7)} (test(Row): the release reads 100%25), which this head does not have. Update the branch onto main and re-run: a test whose file changed on main gets an update, not a retry.`,
        `::warning title=Update your branch before debugging::${spec} changed on main in ${fixed.slice(0, 7)} (test(Row): the release reads 100%25), which this head does not have. Update the branch onto main and re-run: a test whose file changed on main gets an update, not a retry.`,
      ]);
    });

    it('names a harness spec only for a leg whose plan lists it', () => {
      const head = fs.readFileSync(path.join(dir, 'head.txt'), 'utf8');
      const out = explain(head, [harnessSpec]);
      const warnings = out.stdout
        .split('\n')
        .filter(line => line.startsWith('::warning'));
      expect(
        warnings.map(line => line.split('::')[2].split(' changed')[0]),
      ).toEqual(['internal/interaction-harness/src/busy.ts', harnessSpec]);
      expect(warnings[1]).toContain(harnessSpecFix.slice(0, 7));
    });

    it('says nothing is newer for a head that already has main’s tip', () => {
      const out = explain(current, [spec, other]);
      expect(out.status).toBe(0);
      expect(out.stdout).not.toContain('::warning');
      expect(out.stdout).toContain(
        "main has no newer change to this leg's specs or the harness.",
      );
    });
  });
});
