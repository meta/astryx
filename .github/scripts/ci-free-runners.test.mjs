// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: every workflow job runs on a free GitHub-hosted runner.
 * @input Every workflow under .github/workflows
 * @output Each job's runner labels against the free standard set
 * @position Node contract for the repository's Actions spend
 *
 * This repository is public, so GitHub's standard hosted runners cost nothing:
 * `ubuntu-latest` has the same four vCPUs and 16 GB as the paid
 * `4-core-ubuntu`, and `ubuntu-24.04-arm` has four vCPUs. Paid larger-runner
 * labels billed every minute and exhausted the yearly Actions budget, so a job
 * may use one only with a measured need recorded in PAID_ALLOWED below.
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const dir = path.resolve(import.meta.dirname, '../workflows');
const workflows = fs
  .readdirSync(dir)
  .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
  .map(name => [
    name,
    yaml.parse(fs.readFileSync(path.join(dir, name), 'utf8')),
  ]);

/** Standard hosted runners: free on a public repository. */
const FREE = new Set([
  'ubuntu-latest',
  'ubuntu-slim',
  'ubuntu-24.04',
  'ubuntu-22.04',
  'ubuntu-24.04-arm',
  'ubuntu-22.04-arm',
  'macos-latest',
  'macos-15',
  'macos-14',
  'windows-latest',
]);

/**
 * `workflow/job` → why that job may use a paid larger runner. Only the release
 * path does: a dedicated pool keeps pull request load from starving a release
 * (release-check run 40603917516 on Oct 27 never got a 4-core runner behind
 * our own pull request shards).
 */
const RELEASE_POOL =
  'release path: a dedicated paid pool so PR load never starves a release';
const PAID_ALLOWED = {
  'release.yml/publish': RELEASE_POOL,
  'ci.yml/release-merge-back': `${RELEASE_POOL}; byte parity with the publisher`,
  'ci.yml/release-bump': RELEASE_POOL,
};
/** Jobs that use the paid pool only for a release-check a person dispatches. */
const RELEASE_CHECK_JOBS = [
  'build-storybook',
  'typecheck',
  'pr-a11y-shard',
  'pr-a11y-audit',
  'pr-a11y-guards',
  'pr-a11y-specs',
  'a11y-contracts-shard',
  'visual-scout',
  'pr-visual',
  'pr-rtl-shard',
  'pr-rtl-merge',
];
const RELEASE_GATE =
  "github.event_name == 'workflow_dispatch' && inputs.operation == 'release-check' && github.triggering_actor != 'github-actions[bot]'";

/**
 * Every runner label a job can resolve to. Matrix values include `include`
 * entries; an expression yields its quoted runner literals. Anything that does
 * not resolve (`${{ vars.X }}`, `${{ inputs.X }}`, a computed matrix) is
 * returned raw, so it fails the free-runner check instead of passing unseen.
 */
function labelsOf(job) {
  const runsOn = job['runs-on'];
  if (runsOn == null) return [];
  const labels = [];
  for (const value of [runsOn].flat().map(String)) {
    const matrix = /^\$\{\{\s*matrix\.([a-zA-Z0-9_-]+)\s*\}\}$/.exec(value);
    if (matrix) {
      const key = matrix[1];
      const m = job.strategy?.matrix;
      const found =
        m && typeof m === 'object'
          ? [
              ...[m[key] ?? []].flat(),
              ...[m.include ?? []].flat().map(entry => entry?.[key]),
              // A computed include can add any runner: fail closed.
              ...(typeof m.include === 'string' ? [value] : []),
            ]
              .filter(item => item != null)
              .map(String)
          : [];
      labels.push(...(found.length > 0 ? found : [value]));
    } else if (value.includes('${{')) {
      // The one expression shape the workflows use, `cond && 'a' || 'b'`,
      // resolves to both labels; any other expression stays raw and fails.
      const pair =
        /^\$\{\{\s*([^|]+?)\s*&&\s*'([^']+)'\s*\|\|\s*'([^']+)'\s*\}\}$/.exec(
          value,
        );
      labels.push(...(pair ? [pair[2], pair[3]] : [value]));
    } else {
      labels.push(value);
    }
  }
  return labels;
}

describe('runner labels', () => {
  it('finds runner labels to check', () => {
    const all = workflows.flatMap(([, wf]) =>
      Object.values(wf.jobs ?? {}).flatMap(labelsOf),
    );
    expect(all.length).toBeGreaterThan(30);
  });

  it('fails closed on a runner it cannot resolve', () => {
    expect(labelsOf({'runs-on': '${{ vars.BIG_RUNNER }}'})).toEqual([
      '${{ vars.BIG_RUNNER }}',
    ]);
    expect(
      labelsOf({
        'runs-on':
          "${{ github.event_name == 'push' && 'linux-large' || 'ubuntu-latest' }}",
      }),
    ).toEqual(['linux-large', 'ubuntu-latest']);
    expect(
      labelsOf({'runs-on': "${{ vars.LARGE_RUNNER || 'ubuntu-latest' }}"}),
    ).toEqual(["${{ vars.LARGE_RUNNER || 'ubuntu-latest' }}"]);
    expect(
      labelsOf({
        'runs-on': '${{ matrix.os }}',
        strategy: {
          matrix: {
            os: ['ubuntu-latest'],
            include: '${{ fromJSON(needs.plan.outputs.extra) }}',
          },
        },
      }),
    ).toContain('${{ matrix.os }}');
    expect(
      labelsOf({
        'runs-on': '${{ matrix.os }}',
        strategy: {matrix: {include: [{os: '4-core-ubuntu'}]}},
      }),
    ).toEqual(['4-core-ubuntu']);
    expect(
      labelsOf({
        'runs-on': '${{ matrix.os }}',
        strategy: {matrix: '${{ fromJSON(needs.plan.outputs.matrix) }}'},
      }),
    ).toEqual(['${{ matrix.os }}']);
  });

  it.each(workflows)(
    '%s runs every job on a free standard runner',
    (name, wf) => {
      for (const [id, job] of Object.entries(wf.jobs ?? {})) {
        if (job.uses) continue; // a reusable workflow call names no runner
        const key = `${name}/${id}`;
        if (key in PAID_ALLOWED) continue;
        if (name === 'ci.yml' && RELEASE_CHECK_JOBS.includes(id)) continue;
        for (const label of labelsOf(job)) {
          expect(FREE.has(label), `${key} runs on ${label}`).toBe(true);
        }
      }
    },
  );

  it('puts a release-check job on the paid pool only for a dispatched release gate, keeping its architecture', () => {
    const ci = Object.fromEntries(workflows)['ci.yml'];
    for (const id of RELEASE_CHECK_JOBS) {
      const [paid, free] = labelsOf(ci.jobs[id]);
      expect(ci.jobs[id]['runs-on'], id).toBe(
        `\${{ (${RELEASE_GATE}) && '${paid}' || '${free}' }}`,
      );
      expect(FREE.has(free), id).toBe(true);
      expect(FREE.has(paid), id).toBe(false);
      expect(free.endsWith('-arm'), `${id} keeps its architecture`).toBe(
        paid.endsWith('-arm'),
      );
    }
  });

  it('keeps the release path on the paid pool', () => {
    const byName = Object.fromEntries(workflows);
    for (const key of Object.keys(PAID_ALLOWED)) {
      const [name, id] = key.split('/');
      expect(byName[name].jobs[id], key).toBeDefined();
      expect(FREE.has(labelsOf(byName[name].jobs[id])[0]), key).toBe(false);
    }
    // A merge-back branch runs on the stable publisher's runner (byte parity).
    expect(labelsOf(byName['ci.yml'].jobs['release-merge-back'])[0]).toBe(
      byName['release.yml'].jobs.publish['runs-on'],
    );
  });

  it('caps a pull request at two unit-test legs at a time', () => {
    const ci = Object.fromEntries(workflows)['ci.yml'];
    for (const id of ['test-ui', 'test-node']) {
      expect(ci.jobs[id].strategy['max-parallel'], id).toBe(2);
    }
  });
});
