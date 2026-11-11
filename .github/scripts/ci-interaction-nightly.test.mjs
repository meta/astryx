// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Main's nightly full Chromium interaction run: the main heavy lanes
 *   dispatch it once a day, ci.yml runs every Chromium interaction spec on
 *   main's tip for it and nothing else, and it never takes a release-check's
 *   place.
 * @input CI and Main heavy lanes workflows, and a mocked GitHub API
 * @output The dispatch, the jobs the run starts, and its scope
 * @position Node contracts for AST-030 FR31 and DEC-28
 */

import fs from 'node:fs';
import {describe, expect, it, vi} from 'vitest';
import yaml from 'yaml';

// The raw file host is offline here, so the dispatcher reads its rate-limit
// helper through the API.
vi.stubGlobal('fetch', async () => {
  throw new Error('offline');
});

const read = name =>
  yaml.parse(
    fs.readFileSync(new URL(`../workflows/${name}`, import.meta.url), 'utf8'),
  );
const ci = read('ci.yml');
const heavy = read('main-heavy-lanes.yml');

/** Evaluates a job's `if` for one event, with every needed job succeeded. */
function runs(job, {event, operation, ref = 'refs/heads/main'}) {
  const expression = String(ci.jobs[job].if)
    .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
    .replace(/\.labels\.\*\.name/g, '.labels.map(l => l.name)')
    .replace(/needs\.([a-z][a-z0-9-]*)/g, 'needs["$1"]');
  const needs = new Proxy({}, {get: () => ({result: 'success', outputs: {}})});
  return Boolean(
    Function(
      'github',
      'needs',
      'inputs',
      'always',
      'cancelled',
      'startsWith',
      'contains',
      `return (${expression});`,
    )(
      {event_name: event, ref, event: {}},
      needs,
      operation ? {operation} : {},
      () => true,
      () => false,
      (value, prefix) => String(value ?? '').startsWith(prefix),
      (list, item) => list.includes(item),
    ),
  );
}

/** Evaluates a `${{ … }}` value with `inputs.operation` set. */
function value(text, operation) {
  const expression = String(text).replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  return Function(
    'inputs',
    `return (${expression});`,
  )(operation ? {operation} : {});
}

const nightly = {event: 'workflow_dispatch', operation: 'interaction-full'};
const scopeOf = (job, id) =>
  ci.jobs[job].steps.find(step => step.id === id).with;

describe("main's nightly full interaction run in ci.yml", () => {
  it('is a dispatch operation with a name the main heavy lanes read', () => {
    expect(ci.on.workflow_dispatch.inputs.operation.options).toContain(
      'interaction-full',
    );
    expect(ci['run-name']).toBe(
      "${{ github.event_name == 'workflow_dispatch' && inputs.operation == 'interaction-full' && format('Interaction proofs of {0}', github.sha) || github.event_name == 'workflow_dispatch' && inputs.operation == 'webkit-weekly' && format('WebKit weekly of {0}', github.sha) || github.event_name == 'workflow_dispatch' && inputs.operation == 'release-check' && inputs.evidence && format('Release evidence of {0}', github.sha) || '' }}",
    );
  });

  it("has a concurrency group of its own, ahead of the release-checks' group", () => {
    const group = ci.concurrency.group;
    const own =
      "(github.event_name == 'workflow_dispatch' && inputs.operation == 'interaction-full' && 'interaction-full')";
    expect(group).toContain(own);
    expect(group.indexOf(own)).toBeLessThan(
      group.indexOf("'main-heavy-lanes'"),
    );
  });

  it('builds Storybook and runs the Chromium leg count and proofs on main', () => {
    for (const job of ['build-storybook', 'interaction-legs', 'pr-interaction'])
      expect(runs(job, nightly), job).toBe(true);
  });

  it('runs nothing else', () => {
    for (const job of [
      'pr-interaction-webkit',
      'test',
      'typecheck',
      'pr-a11y',
      'pr-visual',
      'pr-rtl',
      'release-authority',
      'release-check',
    ])
      expect(runs(job, nightly), job).toBe(false);
  });

  it('runs on main only', () => {
    for (const job of ['build-storybook', 'interaction-legs', 'pr-interaction'])
      expect(
        runs(job, {...nightly, ref: 'refs/heads/release/v1.2.3'}),
        job,
      ).toBe(false);
  });

  it('starts no interaction proofs for a capture or a release-check', () => {
    for (const operation of ['capture', 'release-check']) {
      for (const job of ['interaction-legs', 'pr-interaction'])
        expect(runs(job, {event: 'workflow_dispatch', operation}), job).toBe(
          false,
        );
    }
  });

  it('plans every Chromium spec for it, and none for a merge-group entry', () => {
    for (const scope of [
      scopeOf('interaction-legs', 'scope-chromium'),
      scopeOf('pr-interaction', 'scope'),
    ]) {
      expect(value(scope['outside-pull-request'], 'interaction-full')).toBe(
        'run',
      );
      expect(value(scope['outside-pull-request'])).toBe('skip');
    }
    // The WebKit lane keeps its own scope: it plans outside a pull request
    // only for the weekly full WebKit run.
    const webkit = scopeOf('interaction-legs', 'scope-webkit')[
      'outside-pull-request'
    ];
    expect(value(webkit, 'interaction-full')).toBe('skip');
    expect(value(webkit)).toBe('skip');
    expect(value(webkit, 'webkit-weekly')).toBe('run');
  });

  it('uploads the Storybook build the proofs download', () => {
    const steps = ci.jobs['build-storybook'].steps;
    const upload = steps.find(
      each => each.name === 'Upload Storybook artifact',
    );
    const scope = {
      docsite_only: 'false',
      spec_only: 'false',
      tooling_only: 'false',
    };
    const uploads = (event, operation) =>
      Function(
        'github',
        'inputs',
        'steps',
        `return (${upload.if});`,
      )({event_name: event}, operation ? {operation} : {}, {
        scope: {outputs: scope},
      });
    expect(uploads('workflow_dispatch', 'interaction-full')).toBe(true);
    expect(uploads('workflow_dispatch', 'capture')).toBe(false);
    // The short hash the proofs download by is set for every dispatch.
    const release = steps.find(each => each.id === 'release');
    expect(release.if).toBe(
      "github.event_name == 'workflow_dispatch' && steps.scope.outputs.tooling_only != 'true'",
    );
    expect(upload.with.name).toBe(
      'storybook-${{ steps.release.outputs.short_hash || steps.urls.outputs.short_hash }}',
    );
    const download = ci.jobs['pr-interaction'].steps.find(
      each => each.name === 'Download Storybook artifact',
    );
    expect(download.with.name).toBe(
      'storybook-${{ needs.build-storybook.outputs.short_hash }}',
    );
  });

  it("checks out and verifies the run's main commit when there is no pull request", () => {
    const steps = ci.jobs['pr-interaction'].steps;
    const step = name => steps.find(candidate => candidate.name === name);
    expect(step('Checkout').with.ref).toBe(
      '${{ github.event.pull_request.head.sha || github.sha }}',
    );
    expect(step('Verify evidence checkout').env.EXPECTED_HEAD_SHA).toBe(
      '${{ github.event.pull_request.head.sha || github.sha }}',
    );
  });
});

describe('the main heavy lanes dispatch it', () => {
  const script = heavy.jobs.dispatch.steps.find(step =>
    step.uses?.startsWith('actions/github-script'),
  ).with.script;
  const sha = 'a'.repeat(40);
  const run = (minutes, now, overrides = {}) => ({
    id: minutes,
    head_sha: sha,
    created_at: new Date(now - minutes * 60000).toISOString(),
    conclusion: 'success',
    status: 'completed',
    actor: {login: 'github-actions[bot]'},
    html_url: `https://github.com/meta/astryx/actions/runs/${minutes}`,
    ...overrides,
  });
  const interaction = (minutes, now, overrides = {}) =>
    run(minutes, now, {
      display_title: `Interaction proofs of ${sha}`,
      ...overrides,
    });

  /** Runs the step's script with ci.yml's dispatched runs and a clock. */
  async function dispatches({checks = [], now, all = false}) {
    const dispatched = [];
    const github = {
      rest: {
        repos: {
          getBranch: async () => ({data: {commit: {sha}}}),
          getContent: async ({path}) => ({
            data: {
              content: fs
                .readFileSync(new URL(`../../${path}`, import.meta.url))
                .toString('base64'),
            },
          }),
        },
        actions: {
          listJobsForWorkflowRun: async () => ({data: {jobs: []}}),
          listWorkflowRuns: async ({workflow_id}) => ({
            data: {
              workflow_runs:
                workflow_id === 'ci.yml'
                  ? checks
                  : [
                      run(10, now, {
                        display_title: `Main validation of ${sha}`,
                      }),
                    ],
            },
          }),
          createWorkflowDispatch: async args => dispatched.push(args),
        },
        search: {issuesAndPullRequests: async () => ({data: {items: []}})},
        issues: {
          create: async () => {},
          createComment: async () => {},
          update: async () => {},
        },
      },
    };
    class FakeDate extends Date {
      static now() {
        return now;
      }
    }
    await new Function(
      'github',
      'context',
      'core',
      'process',
      'Date',
      `return (async () => {${script}})();`,
    )(
      github,
      {repo: {owner: 'meta', repo: 'astryx'}, eventName: 'schedule'},
      {notice: () => {}, warning: () => {}},
      {env: {SHA: sha}},
      FakeDate,
    );
    return all
      ? dispatched
      : dispatched.filter(args => args.inputs.operation === 'interaction-full');
  }

  // A Saturday, so no pre-cut release-check is due.
  const NINE = Date.parse('2026-10-31T09:07:00Z');
  const NOON = Date.parse('2026-10-31T12:07:00Z');
  const recentCheck = now => run(30, now);

  it('dispatches it once in the 09:00 UTC hour for main', async () => {
    expect(await dispatches({checks: [recentCheck(NINE)], now: NINE})).toEqual([
      {
        owner: 'meta',
        repo: 'astryx',
        workflow_id: 'ci.yml',
        ref: 'main',
        inputs: {operation: 'interaction-full'},
      },
    ]);
  });

  it('does not dispatch it again the same UTC day, or outside that hour', async () => {
    const later = NINE + 15 * 60000;
    expect(
      await dispatches({
        checks: [interaction(15, later), recentCheck(later)],
        now: later,
      }),
    ).toEqual([]);
    expect(await dispatches({checks: [recentCheck(NOON)], now: NOON})).toEqual(
      [],
    );
  });

  it('dispatches it again when the day’s run was cancelled', async () => {
    const later = NINE + 15 * 60000;
    expect(
      await dispatches({
        checks: [
          interaction(15, later, {conclusion: 'cancelled'}),
          recentCheck(later),
        ],
        now: later,
      }),
    ).toHaveLength(1);
  });

  it('never counts it as a release-check of the tip', async () => {
    // The only recent ci.yml run is the nightly one, at the tip: a
    // release-check is still due.
    const dispatched = await dispatches({
      checks: [interaction(30, NOON)],
      now: NOON,
      all: true,
    });
    expect(dispatched.map(args => args.inputs.operation)).toContain(
      'release-check',
    );
  });
});
