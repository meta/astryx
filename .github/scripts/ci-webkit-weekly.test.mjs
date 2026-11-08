// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Contract tests for the weekly full WebKit run and the release check's
 * WebKit scope (spec:AST-030 DEC-24).
 */

import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {
  FAILED,
  GREEN,
  MAX_AGE_MS,
  releaseScope,
  releaseVersion,
} from './webkit-release-scope.mjs';

const read = name =>
  yaml.parse(
    fs.readFileSync(path.resolve(import.meta.dirname, '../workflows', name), 'utf8'),
  );
const ci = read('ci.yml');
const step = (job, name) => job.steps.find(each => each.name === name);

/**
 * Evaluates a job condition as Actions would, for a workflow_dispatch: every
 * needed job succeeded, and no status function means success() too.
 */
function starts(id, {github, inputs}) {
  const job = ci.jobs[id];
  if (job.if == null) return true;
  const expression = String(job.if)
    .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
    .replace(/\.labels\.\*\.name/g, '.labels.map(l => l.name)')
    .replace(/needs\.([a-z][a-z0-9-]*)/g, 'needs["$1"]')
    .replace(/inputs\[('[^']+')\]/g, 'inputs[$1]');
  const hasStatus = /\b(always|cancelled|failure|success)\(\)/.test(expression);
  const needs = new Proxy({}, {get: () => ({result: 'success', outputs: {}})});
  return Boolean(
    Function(
      'github', 'needs', 'inputs', 'always', 'cancelled', 'success', 'failure',
      'startsWith', 'contains', 'fromJSON',
      `return ${hasStatus ? '' : 'success() && '}(${expression});`,
    )(
      github, needs, inputs, () => true, () => false, () => true, () => false,
      (value, prefix) => String(value ?? '').startsWith(prefix),
      (list, item) => (list ?? []).includes(item),
      JSON.parse,
    ),
  );
}

const weeklyDispatch = {
  github: {
    event_name: 'workflow_dispatch',
    ref: 'refs/heads/main',
    ref_name: 'main',
    repository: 'meta/astryx',
    triggering_actor: 'github-actions[bot]',
    event: {},
  },
  inputs: {operation: 'webkit-weekly', recheck: false},
};

describe('the weekly full WebKit run', () => {
  const weekly = read('webkit-weekly.yml');

  it('dispatches the WebKit-only operation of ci.yml on main every Sunday at 10:00 UTC', () => {
    expect(weekly.on.schedule).toEqual([{cron: '0 10 * * 0'}]);
    expect(Object.keys(weekly.on)).toEqual(['schedule', 'workflow_dispatch']);
    const job = Object.values(weekly.jobs)[0];
    expect(job.permissions).toEqual({actions: 'write'});
    const dispatch = job.steps.at(-1).run;
    expect(dispatch).toContain('gh workflow run ci.yml');
    expect(dispatch).toContain('--ref main');
    expect(dispatch).toContain('-f operation=webkit-weekly');
    expect(ci.on.workflow_dispatch.inputs.operation.options).toContain('webkit-weekly');
  });

  it('starts only the jobs the WebKit proofs need, and its verdict', () => {
    const started = Object.keys(ci.jobs).filter(id => starts(id, weeklyDispatch));
    expect(started.sort()).toEqual(
      [
        'admission',
        'build-storybook',
        'interaction-legs',
        'pr-interaction-webkit',
        'room',
        'webkit-weekly-request',
        'webkit-weekly-verdict',
      ].sort(),
    );
  });

  it('waits in a group of its own, so a release-check never replaces it', () => {
    const group = ci.concurrency.group;
    const weekly = "(github.event_name == 'workflow_dispatch' && inputs.operation == 'webkit-weekly' && 'webkit-weekly')";
    expect(group).toContain(weekly);
    expect(group.indexOf(weekly)).toBeLessThan(group.indexOf("'main-heavy-lanes'"));
  });

  it('runs only from main, like the other operations', () => {
    const request = ci.jobs['webkit-weekly-request'];
    expect(request.if).toBe(
      "github.event_name == 'workflow_dispatch' && inputs.operation == 'webkit-weekly'",
    );
    expect(step(request, 'Require main').run).toContain("[ \"$GITHUB_REF\" != 'refs/heads/main' ]");
    for (const id of ['interaction-legs', 'pr-interaction-webkit'])
      expect(ci.jobs[id].needs, id).toContain('webkit-weekly-request');
  });

  it('runs every WebKit spec at the dispatched main commit', () => {
    const webkit = ci.jobs['pr-interaction-webkit'];
    expect(webkit.env.WEBKIT_WEEKLY).toBe(
      "${{ github.event_name == 'workflow_dispatch' && inputs.operation == 'webkit-weekly' }}",
    );
    expect(step(webkit, "Decide this job's scope").with['outside-pull-request']).toBe(
      "${{ github.event_name == 'workflow_dispatch' && 'run' || 'skip' }}",
    );
    expect(step(webkit, 'Checkout').with.ref).toBe(
      '${{ github.event.pull_request.head.sha || github.sha }}',
    );
    expect(step(webkit, 'Verify evidence checkout').env.EXPECTED_HEAD_SHA).toBe(
      '${{ github.event.pull_request.head.sha || github.sha }}',
    );
    expect(step(webkit, "Decide the WebKit scope").run).toContain(
      'if [ "${WEBKIT_WEEKLY:-}" = true ]; then',
    );
  });

  it('records a green or failed verdict for the release check to read', () => {
    const verdict = ci.jobs['webkit-weekly-verdict'];
    expect(verdict.needs).toEqual(['webkit-weekly-request', 'pr-interaction-webkit']);
    expect(verdict.if).toBe(
      "${{ always() && github.event_name == 'workflow_dispatch' && inputs.operation == 'webkit-weekly' && needs.webkit-weekly-request.result == 'success' }}",
    );
    const upload = step(verdict, 'Record the verdict');
    expect(upload.with.name).toBe(
      `\${{ needs.pr-interaction-webkit.result == 'success' && '${GREEN}' || '${FAILED}' }}`,
    );
    expect(upload.with['retention-days']).toBe(90);
  });
});

describe('the release check WebKit scope', () => {
  const now = Date.parse('2026-11-16T15:00:00Z');
  const green = (createdAt, sha = 'a'.repeat(40)) => ({name: GREEN, createdAt, sha});
  const failed = (createdAt, sha = 'b'.repeat(40)) => ({name: FAILED, createdAt, sha});

  it('reads the release version from the release tooling title', () => {
    expect(releaseVersion('[do not merge] v0.7.12 interaction check at c99ad4aa20')).toBe('0.7.12');
    expect(releaseVersion('[do not merge] interaction check at c99ad4aa20')).toBeNull();
  });

  it('runs the subset while the last full weekly run is green and at most 7 days old', () => {
    expect(releaseScope({version: '0.7.13', verdicts: [green('2026-11-15T11:00:00Z')], now}).full).toBe(false);
  });

  it('runs the full suite when the last green full weekly run is more than 7 days old', () => {
    const old = new Date(now - MAX_AGE_MS - 60_000).toISOString();
    const scope = releaseScope({version: '0.7.13', verdicts: [green(old)], now});
    expect(scope.full).toBe(true);
    expect(scope.reason).toContain('more than 7');
  });

  it('runs the full suite when the last full weekly run failed, so a reproducing failure blocks the release', () => {
    const scope = releaseScope({
      version: '0.7.13',
      verdicts: [green('2026-11-08T11:00:00Z'), failed('2026-11-15T11:00:00Z')],
      now,
    });
    expect(scope.full).toBe(true);
    expect(scope.reason).toContain('failed');
  });

  it('runs the full suite when no full weekly run is recorded', () => {
    expect(releaseScope({version: '0.7.13', verdicts: [], now}).full).toBe(true);
  });

  it('runs the full suite at every minor release, and when the version is unknown', () => {
    expect(releaseScope({version: '0.8.0', verdicts: [green('2026-11-15T11:00:00Z')], now}).full).toBe(true);
    expect(releaseScope({version: null, verdicts: [green('2026-11-15T11:00:00Z')], now}).full).toBe(true);
  });

  it('decides in both the leg count job and every WebKit leg, the same way', () => {
    const lane = step(ci.jobs['pr-interaction-webkit'], 'Decide the WebKit scope');
    const counter = step(ci.jobs['interaction-legs'], 'Decide the WebKit scope');
    // The same decision; only the scope step it waits on is named apart.
    expect(counter.run).toBe(lane.run);
    expect(counter.env).toEqual(lane.env);
    expect(lane.if).toBe("steps.scope.outputs.applies == 'true'");
    expect(counter.if).toBe("steps.scope-webkit.outputs.applies == 'true'");
    expect(lane.env.RELEASE_TITLE).toBe('${{ github.event.pull_request.title }}');
    expect(lane.run).toContain('node .test-scope/.github/scripts/webkit-release-scope.mjs >> "$GITHUB_ENV"');
    for (const id of ['pr-interaction-webkit', 'interaction-legs'])
      expect(ci.jobs[id].permissions.actions, id).toBe('read');
  });
});
