// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: the nightly perf workflow (.github/workflows/perf-nightly.yml)
 * runs nightly and on dispatch, runs on a pull request only behind the CI
 * gate and a `ci:run-perf` label applied by someone with write access, keeps its
 * jobs on standard runners within the 15-minute budget with minimal token
 * permissions, and opens or updates one regression issue
 * (.github/scripts/perf-regression-issue.mjs). The gate's script is run as
 * actions/github-script runs it, against a stubbed GitHub API.
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {PR_CI_GATE} from './ci-pr-gate.mjs';
import {
  PERF_ISSUE_TITLE,
  upsertRegressionIssue,
} from './perf-regression-issue.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const workflow = yaml.parse(
  fs.readFileSync(
    path.join(root, '.github/workflows/perf-nightly.yml'),
    'utf8',
  ),
);
const on = workflow.on ?? workflow[true];
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

describe('triggers', () => {
  it('runs once a day on a fixed schedule, and on manual dispatch', () => {
    expect(on.schedule).toHaveLength(1);
    const fields = on.schedule[0].cron.split(' ');
    expect(fields).toHaveLength(5);
    // A fixed minute and hour, every day of every month.
    expect(fields[0]).toMatch(/^\d+$/);
    expect(fields[1]).toMatch(/^\d+$/);
    expect(fields.slice(2)).toEqual(['*', '*', '*']);
    expect(on).toHaveProperty('workflow_dispatch');
  });

  it('starts on pull request updates only, never on a label (spec:AST-030 FR17)', () => {
    expect(on.pull_request.types).toEqual([
      'opened',
      'synchronize',
      'reopened',
      'ready_for_review',
    ]);
  });

  it('lists the paths the scenes measure (spec:AST-030 FR14)', () => {
    expect(on.pull_request.paths).toEqual(
      expect.arrayContaining([
        'packages/core/**',
        'apps/sandbox/src/app/(raw)/pages/perf-scenes/**',
        'apps/sandbox/perf/**',
        'internal/a11y-spec/src/storybook.ts',
        'playwright.perf.config.ts',
        '.github/workflows/perf-nightly.yml',
      ]),
    );
    for (const glob of on.pull_request.paths) {
      expect(fs.globSync(glob, {cwd: root}).length, glob).toBeGreaterThan(0);
    }
  });
});

describe('the label gate', () => {
  const gate = workflow.jobs.gate;

  /** Evaluates the gate job's condition as Actions would, for one event. */
  function starts({
    event = 'pull_request',
    draft = false,
    fork = false,
    labels = [],
  } = {}) {
    const github = {
      event_name: event,
      repository: 'meta/astryx',
      event: {
        pull_request:
          event === 'pull_request'
            ? {
                draft,
                head: {
                  repo: {full_name: fork ? 'someone/astryx' : 'meta/astryx'},
                },
                labels: labels.map(name => ({name})),
              }
            : null,
      },
    };
    const js = gate.if
      .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
      .replace(/\.labels\.\*\.name/g, '.labels.map(l => l.name)');
    return Function(
      'github',
      'contains',
      `return Boolean(${js});`,
    )(github, (list, item) => list.includes(item));
  }

  it('begins with the pull request CI gate', () => {
    expect(gate.if.startsWith(`\${{ ${PR_CI_GATE} && (`)).toBe(true);
  });

  it('starts for a labelled pull request, nightly and on dispatch', () => {
    expect(starts({labels: ['ci:run-perf']})).toBe(true);
    expect(starts({fork: true, labels: ['ci:run-perf', 'ci:run']})).toBe(true);
    expect(starts({event: 'schedule'})).toBe(true);
    expect(starts({event: 'workflow_dispatch'})).toBe(true);
  });

  it('skips a pull request without the label, a draft, and an unvouched fork', () => {
    expect(starts()).toBe(false);
    expect(starts({labels: ['ci:heavy-lanes']})).toBe(false);
    expect(starts({draft: true, labels: ['ci:run-perf']})).toBe(false);
    expect(starts({fork: true, labels: ['ci:run-perf']})).toBe(false);
  });

  it('puts every other job behind the gate', () => {
    expect(workflow.jobs['build-scenes'].needs).toEqual(['gate']);
    expect(workflow.jobs['build-scenes'].if).toBe(
      "needs.gate.outputs.run == 'true'",
    );
    expect(workflow.jobs.measure.needs).toEqual(['build-scenes']);
    expect(workflow.jobs.report.needs).toEqual(['measure']);
    for (const id of ['measure', 'report']) {
      expect(workflow.jobs[id].if, id).toBeUndefined();
    }
  });
});

describe("the labeler's access check", () => {
  const script = workflow.jobs.gate.steps.find(step =>
    step.uses?.startsWith('actions/github-script@'),
  ).with.script;
  const realRequire = createRequire(import.meta.url);

  it("reads CI's own label rule from a sparse checkout", () => {
    const checkout = workflow.jobs.gate.steps.find(step =>
      step.uses?.startsWith('actions/checkout@'),
    );
    expect(checkout.with['sparse-checkout'].trim().split('\n')).toEqual([
      '.github/scripts/run-labels.cjs',
      '.github/scripts/review-signal-decision.cjs',
    ]);
    expect(script).toContain("label: 'ci:run-perf'");
  });

  /** Runs the gate script as github-script would; returns `run` and notices. */
  async function decide({
    eventName = 'pull_request',
    repo = 'astryx',
    labels = ['ci:run-perf'],
    events = [{actor: {login: 'maintainer'}, label: {name: 'ci:run-perf'}}],
    permissions = {maintainer: 'write'},
    failLookup = false,
  } = {}) {
    const outputs = {};
    const notices = [];
    const core = {
      setOutput: (name, value) => {
        outputs[name] = value;
      },
      notice: message => notices.push(message),
      warning: message => notices.push(message),
    };
    const github = {
      graphql: async (_query, variables) => {
        if (failLookup) throw new Error('rate limited');
        expect(variables).toEqual({owner: 'meta', repo, number: 7});
        return {
          repository: {pullRequest: {timelineItems: {nodes: events}}},
        };
      },
      rest: {
        repos: {
          getCollaboratorPermissionLevel: async ({username}) => ({
            data: {permission: permissions[username] ?? 'read'},
          }),
        },
      },
    };
    const context = {
      eventName,
      repo: {owner: 'meta', repo},
      payload: {
        pull_request:
          eventName === 'pull_request'
            ? {number: 7, labels: labels.map(name => ({name}))}
            : undefined,
      },
    };
    // The checkout puts the scripts under .run-labels; the tree has them at root.
    const require = file =>
      realRequire(file.replace(`${root}/.run-labels/`, `${root}/`));
    const saved = process.env.GITHUB_WORKSPACE;
    process.env.GITHUB_WORKSPACE = root;
    try {
      await new AsyncFunction('github', 'context', 'core', 'require', script)(
        github,
        context,
        core,
        require,
      );
    } finally {
      process.env.GITHUB_WORKSPACE = saved;
    }
    return {run: outputs.run, outputs, notices};
  }

  it('runs when the label was applied with write or admin access', async () => {
    for (const permission of ['write', 'admin']) {
      expect(
        (await decide({permissions: {maintainer: permission}})).run,
        permission,
      ).toBe('true');
    }
  });

  it('does not run when the labeler has read or no access, and says why', async () => {
    for (const permission of ['read', 'none']) {
      const {run, notices} = await decide({
        permissions: {maintainer: permission},
      });
      expect(run, permission).toBe('false');
      expect(notices.join('\n')).toContain('maintainer');
    }
  });

  it('judges the newest ci:run-perf label event, not an earlier one', async () => {
    const {run} = await decide({
      events: [
        {actor: {login: 'maintainer'}, label: {name: 'ci:run-perf'}},
        {actor: {login: 'maintainer'}, label: {name: 'bug'}},
        {actor: {login: 'reader'}, label: {name: 'ci:run-perf'}},
      ],
      permissions: {maintainer: 'write', reader: 'read'},
    });
    expect(run).toBe('false');
  });

  it('fails closed when the lookup fails or finds no label event', async () => {
    expect((await decide({failLookup: true})).run).toBe('false');
    expect((await decide({events: []})).run).toBe('false');
  });

  it('does not run a pull request without the label, nor for a CI suite label', async () => {
    expect((await decide({labels: ['ci:run']})).run).toBe('false');
    expect((await decide({labels: ['ci:run-visual']})).run).toBe('false');
  });

  it('sets only its own output', async () => {
    expect(Object.keys((await decide()).outputs)).toEqual(['run']);
  });

  it('runs nightly only on meta/astryx, and on every dispatch', async () => {
    expect((await decide({eventName: 'schedule'})).run).toBe('true');
    expect((await decide({eventName: 'schedule', repo: 'fork'})).run).toBe(
      'false',
    );
    expect((await decide({eventName: 'workflow_dispatch'})).run).toBe('true');
  });
});

describe('jobs', () => {
  const jobs = Object.entries(workflow.jobs);

  // A job named like a required context (`build`, `test`, `lint`, …) would
  // report a second, often skipped, check under that name (spec:AST-030 FR7).
  it('share no name with a required context', () => {
    for (const [id, job] of jobs) {
      for (const name of [id, job.name].filter(Boolean)) {
        expect(
          [
            'build',
            'test',
            'docsite-test',
            'lint',
            'spec-owner-approval',
            'review-required',
          ],
          `${id}`,
        ).not.toContain(name);
      }
    }
  });

  it('use standard runners within the 15-minute budget', () => {
    for (const [id, job] of jobs) {
      expect(['ubuntu-latest', 'ubuntu-slim'], id).toContain(job['runs-on']);
      expect(job['timeout-minutes'], id).toBeLessThanOrEqual(15);
    }
  });

  it('grant the token only what each job uses', () => {
    expect(workflow.permissions).toEqual({});
    expect(workflow.jobs.gate.permissions).toEqual({
      contents: 'read',
      'pull-requests': 'read',
    });
    expect(workflow.jobs['build-scenes'].permissions).toEqual({
      contents: 'read',
    });
    expect(workflow.jobs.measure.permissions).toEqual({contents: 'read'});
    expect(workflow.jobs.report.permissions).toEqual({
      actions: 'read',
      contents: 'read',
      issues: 'write',
    });
  });

  it('never persists checkout credentials', () => {
    for (const [id, job] of jobs) {
      for (const step of job.steps) {
        if (step.uses?.startsWith('actions/checkout@')) {
          expect(step.with?.['persist-credentials'], id).toBe(false);
        }
      }
    }
  });

  it('uploads the results and the history of every run', () => {
    const uploads = jobs.flatMap(([, job]) =>
      job.steps
        .filter(step => step.uses?.startsWith('actions/upload-artifact@'))
        .map(step => step.with.name),
    );
    expect(uploads).toEqual(['perf-sandbox', 'perf-results', 'perf-history']);
  });

  it('keeps recorded runs on main in one uncancelled group', () => {
    expect(workflow.concurrency.group).toContain("'main'");
    expect(workflow.concurrency['cancel-in-progress']).toBe(
      "${{ github.event_name == 'pull_request' }}",
    );
  });
});

describe('the regression issue', () => {
  const report = {
    sha: 'c'.repeat(40),
    runUrl: 'https://github.com/meta/astryx/actions/runs/1',
    recorded: true,
    range: {from: 'a'.repeat(40), to: 'c'.repeat(40)},
    regressions: [
      {
        scene: 'table',
        metric: 'mountLongTaskMs',
        value: 200,
        median: 100,
        change: 1,
      },
    ],
  };

  function stub(open = []) {
    const calls = [];
    const github = {
      paginate: async (method, params) => method(params),
      rest: {
        issues: {
          listForRepo: async params => {
            calls.push(['list', params]);
            return open;
          },
          create: async params => calls.push(['create', params]),
          createComment: async params => calls.push(['comment', params]),
        },
        repos: {
          compareCommits: async () => ({
            data: {
              total_commits: 2,
              commits: [
                {
                  sha: 'a1'.repeat(20),
                  commit: {message: 'feat: one (#1)\n\nbody'},
                },
                {sha: 'b2'.repeat(20), commit: {message: 'fix: two (#2)'}},
              ],
            },
          }),
        },
      },
    };
    const context = {repo: {owner: 'meta', repo: 'astryx'}};
    return {github, context, calls};
  }

  it('opens one issue with the regressions and the commit range', async () => {
    const {github, context, calls} = stub();
    expect(await upsertRegressionIssue({github, context, report})).toBe(
      'created',
    );
    const [, params] = calls.find(([kind]) => kind === 'create');
    expect(params.title).toBe(PERF_ISSUE_TITLE);
    expect(params.body).toContain(
      '| table | mountLongTaskMs | 200 | 100 | +100% |',
    );
    expect(params.body).toContain(
      `compare/${'a'.repeat(40)}...${'c'.repeat(40)}`,
    );
    expect(params.body).toContain('feat: one (#1)');
    expect(params.body).not.toContain('body');
  });

  it('comments on the open issue instead of opening another', async () => {
    const {github, context, calls} = stub([
      {number: 5, title: 'Something else'},
      {number: 6, title: PERF_ISSUE_TITLE, pull_request: {}},
      {number: 7, title: PERF_ISSUE_TITLE},
    ]);
    expect(await upsertRegressionIssue({github, context, report})).toBe(
      'commented',
    );
    expect(calls.find(([kind]) => kind === 'create')).toBeUndefined();
    expect(calls.find(([kind]) => kind === 'comment')[1].issue_number).toBe(7);
  });

  it('does nothing for a clean or unrecorded run', async () => {
    for (const quiet of [
      {...report, regressions: []},
      {...report, recorded: false},
    ]) {
      const {github, context, calls} = stub();
      expect(
        await upsertRegressionIssue({github, context, report: quiet}),
      ).toBe('none');
      expect(calls).toEqual([]);
    }
  });

  it('states a regression from a zero median as its absolute change', async () => {
    const {github, context, calls} = stub();
    await upsertRegressionIssue({
      github,
      context,
      report: {
        ...report,
        regressions: [
          {
            scene: 'tree-list',
            metric: 'listenerDelta',
            value: 12,
            median: 0,
            change: null,
          },
        ],
      },
    });
    expect(calls.find(([kind]) => kind === 'create')[1].body).toContain(
      '| tree-list | listenerDelta | 12 | 0 | +12 |',
    );
  });

  it('says no commit landed when the last good run is on the same commit', async () => {
    const {github, context, calls} = stub();
    await upsertRegressionIssue({
      github,
      context,
      report: {
        ...report,
        range: null,
        lastGood: {
          sha: 'c'.repeat(40),
          runId: 41,
          date: '2026-11-01T09:30:00Z',
        },
      },
    });
    const {body} = calls.find(([kind]) => kind === 'create')[1];
    expect(body).toContain(
      'No commit landed since the last good run on ccccccc',
    );
    expect(body).toContain('/actions/runs/41');
    expect(body).not.toContain('No earlier good nightly run');
  });

  it('says so when no good run is recorded yet', async () => {
    const {github, context, calls} = stub();
    await upsertRegressionIssue({
      github,
      context,
      report: {...report, range: null},
    });
    expect(calls.find(([kind]) => kind === 'create')[1].body).toContain(
      'no commit range yet',
    );
  });
});
