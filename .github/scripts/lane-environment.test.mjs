// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file lane-environment.test.mjs
 * @description Keeps `.github/lane-environments.json` equal to each lane's
 *   environment in ci.yml, and proves that a head older than the environment
 *   stops early with a plain message.
 * @input ci.yml, the marker file and the check script.
 * @output Vitest assertions.
 * @position .github/scripts tests.
 */

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {
  LANES,
  environmentOf,
  staleHead,
  versionIn,
} from './lane-environment.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const markers = JSON.parse(
  fs.readFileSync(path.join(root, '.github/lane-environments.json'), 'utf8'),
);
const CHECK = "Require this lane's environment in the branch";
const step = (job, name) => job.steps.find(each => each.name === name);

describe('the lane environment markers', () => {
  it('record each lane’s current environment, one version per environment', () => {
    expect(Object.keys(markers).sort()).toEqual(Object.keys(LANES).sort());
    for (const [lane, jobs] of Object.entries(LANES)) {
      const {version, environments} = markers[lane];
      const current = environmentOf(jobs.map(id => ci.jobs[id]));
      // A change to a lane's runner, container or browser install appends its
      // new hash here, which raises the version, so an older head stops with
      // "update your branch" instead of failing in a spec. Other edits to the
      // lane leave the hash, and every open pull request, alone.
      expect(
        environments.at(-1),
        `${lane}: append ${current} to environments and set version to ${environments.length + 1}`,
      ).toBe(current);
      expect(version, lane).toBe(environments.length);
      // A rollback appends an earlier hash again; only a repeat in a row is
      // not a change.
      for (let i = 1; i < environments.length; i++)
        expect(environments[i], `${lane} entry ${i + 1}`).not.toBe(
          environments[i - 1],
        );
    }
  });

  it('hash only the runner, the container and the browser install', () => {
    const job = structuredClone(ci.jobs['pr-interaction-webkit']);
    const before = environmentOf([job]);
    const run = job.steps.find(each => /^Run /.test(each.name ?? ''));
    run.run += '\necho other';
    job['timeout-minutes'] = 14;
    expect(environmentOf([job])).toBe(before);
    for (const change of [
      each => (each['runs-on'] = 'ubuntu-24.04'),
      each =>
        (each.container.image = 'mcr.microsoft.com/playwright:v9.9.9-noble'),
      each => {
        each.steps.find(s => /^Install Playwright/.test(s.name)).run +=
          ' firefox';
      },
    ]) {
      const changed = structuredClone(job);
      change(changed);
      expect(environmentOf([changed])).not.toBe(before);
    }
  });
});

describe('the lanes that copy the marker', () => {
  it('run on a change to the marker or its check', () => {
    for (const id of ['pr-interaction', 'pr-interaction-webkit']) {
      const scope = ci.jobs[id].steps.find(each => each.id === 'scope');
      const pattern = new RegExp(scope.with.paths);
      for (const file of [
        '.github/scripts/lane-environment.mjs',
        '.github/lane-environments.json',
      ])
        expect(pattern.test(file), `${id} ${file}`).toBe(true);
    }
  });
});

describe('the check', () => {
  it('passes a head at or past the lane’s version, and a head with no marker at version 1', () => {
    expect(staleHead('interaction-webkit', 1, 1)).toBeNull();
    expect(staleHead('interaction-webkit', 2, 3)).toBeNull();
    expect(staleHead('interaction-webkit', 2, 1)).toBe(
      "The interaction-webkit lane's environment changed on main (version 2; this branch has 1). Update this branch onto main, then re-run.",
    );
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lane-env-'));
    try {
      expect(versionIn(path.join(dir, 'missing.json'), 'a11y-contracts')).toBe(
        1,
      );
      const file = path.join(dir, 'markers.json');
      fs.writeFileSync(file, JSON.stringify({'a11y-contracts': {version: 3}}));
      expect(versionIn(file, 'a11y-contracts')).toBe(3);
      expect(versionIn(file, 'interaction-webkit')).toBe(1);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  const lanes = [
    {
      lane: 'interaction-chromium',
      job: 'pr-interaction',
      keep: "Keep the leg planner from the workflow's commit",
      after: 'Verify evidence checkout',
      dir: '$RUNNER_TEMP/interaction-legs',
    },
    {
      lane: 'interaction-webkit',
      job: 'pr-interaction-webkit',
      keep: "Keep the leg planner from the workflow's commit",
      after: 'Verify evidence checkout',
      dir: '$RUNNER_TEMP/interaction-legs',
    },
    {
      lane: 'a11y-contracts',
      job: 'pr-component-a11y-contracts',
      keep: "Keep this lane's environment marker from the workflow's commit",
      after: 'Check out the head that built the Storybook',
      dir: '$RUNNER_TEMP/lane-environment',
    },
  ];

  for (const {lane, job: id, keep, after, dir} of lanes) {
    it(`stops ${id} right after its head checkout, before any setup, when the head is older`, () => {
      const job = ci.jobs[id];
      const check = step(job, CHECK);
      const headCheckout = job.steps.findIndex(
        each =>
          each.uses?.startsWith('actions/checkout@') &&
          String(each.with?.ref).includes('pull_request.head.sha'),
      );
      const at = job.steps.indexOf(check);
      // The marker and the script come from the workflow's commit, kept
      // outside the workspace before the head checkout replaces it.
      const kept = step(job, keep);
      expect(job.steps.indexOf(kept)).toBeLessThan(headCheckout);
      expect(kept.run).toContain(`"${dir}/.github/scripts/"`);
      expect(kept.run).toMatch(/lane-environment\.mjs/);
      expect(kept.run).toMatch(/lane-environments\.json/);
      expect(at).toBe(job.steps.indexOf(step(job, after)) + 1);
      expect(at).toBeGreaterThan(headCheckout);
      expect(at).toBeLessThan(
        job.steps.indexOf(step(job, 'Setup Node and pnpm')),
      );
      expect(check.if).toBe(job.steps[headCheckout].if);
      expect(check.run).toBe(
        `node "${dir}/.github/scripts/lane-environment.mjs" check --lane ${lane} --workflow "${dir}/.github/lane-environments.json" --head .github/lane-environments.json`,
      );
    });
  }

  // Runs a lane's check step against a workflow marker and a head marker.
  function runCheck(lane, workflowVersion, headMarker) {
    const {job: id, dir} = lanes.find(each => each.lane === lane);
    const temp = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'lane-check-')),
    );
    try {
      const kept = path.join(temp, dir.replace('$RUNNER_TEMP/', ''));
      fs.mkdirSync(path.join(kept, '.github/scripts'), {recursive: true});
      fs.copyFileSync(
        path.join(root, '.github/scripts/lane-environment.mjs'),
        path.join(kept, '.github/scripts/lane-environment.mjs'),
      );
      fs.writeFileSync(
        path.join(kept, '.github/lane-environments.json'),
        JSON.stringify({[lane]: {version: workflowVersion}}),
      );
      const head = path.join(temp, 'head');
      fs.mkdirSync(path.join(head, '.github'), {recursive: true});
      if (headMarker)
        fs.writeFileSync(
          path.join(head, '.github/lane-environments.json'),
          JSON.stringify(headMarker),
        );
      return spawnSync('bash', ['-e', '-c', step(ci.jobs[id], CHECK).run], {
        cwd: head,
        encoding: 'utf8',
        env: {...process.env, RUNNER_TEMP: temp},
      });
    } finally {
      fs.rmSync(temp, {recursive: true, force: true});
    }
  }

  it('fails with "Update your branch" for a head older than the lane', () => {
    const stale = runCheck('interaction-webkit', 2, null);
    expect(stale.status).toBe(1);
    expect(stale.stdout).toContain(
      "::error title=Update your branch::The interaction-webkit lane's environment changed on main (version 2; this branch has 1).",
    );
    const older = runCheck('a11y-contracts', 3, {
      'a11y-contracts': {version: 2},
    });
    expect(older.status).toBe(1);
  });

  it('passes a head that has the lane’s environment, and every head at version 1', () => {
    expect(runCheck('interaction-chromium', 1, null).status).toBe(0);
    expect(
      runCheck('interaction-chromium', 2, {
        'interaction-chromium': {version: 2},
      }).status,
    ).toBe(0);
  });

  it('runs from the command line with the usage on a bad lane', () => {
    const out = spawnSync(
      process.execPath,
      [
        path.join(root, '.github/scripts/lane-environment.mjs'),
        'check',
        '--lane',
        'nope',
      ],
      {encoding: 'utf8'},
    );
    expect(out.status).toBe(1);
    expect(out.stderr).toContain('usage: lane-environment.mjs check');
    expect(
      execFileSync(
        process.execPath,
        [
          path.join(root, '.github/scripts/lane-environment.mjs'),
          'check',
          '--lane',
          'a11y-contracts',
          '--workflow',
          path.join(root, '.github/lane-environments.json'),
          '--head',
          path.join(root, '.github/lane-environments.json'),
        ],
        {encoding: 'utf8'},
      ),
    ).toContain(
      "This branch has the a11y-contracts lane's current environment.",
    );
  });
});
