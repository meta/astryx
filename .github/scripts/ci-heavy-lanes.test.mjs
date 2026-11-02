// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Full visual, accessibility and RTL suites run on main; pull request
 *   updates check only touched components.
 * @input CI, Main and Main heavy lanes workflows, and a mocked GitHub API
 * @output Routing for the heavy owners, the required joins, and Main's
 *   release-check dispatch
 * @position Node contracts for AST-030 FR12 and DEC-7
 */

import fs from 'node:fs';
import {describe, expect, it, vi} from 'vitest';
import yaml from 'yaml';
import {ungated} from './ci-pr-gate.mjs';

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
const main = read('deploy.yml');

const SUITE = {
  'pr-a11y-guards': 'a11y',
  'pr-a11y-specs': 'a11y',
  'pr-a11y': 'a11y',
  'visual-scout': 'visual',
  'pr-rtl-shard': 'rtl',
  'pr-rtl-merge': 'rtl',
  'pr-rtl': 'rtl',
};
const HEAVY = Object.keys(SUITE);
const prClause = suite =>
  `(github.event_name == 'pull_request' && needs.run-labels.outputs.${suite} == 'true')`;

describe('visual, accessibility and RTL owners', () => {
  // release-check-workflow.test.mjs evaluates them for release-check and
  // visual-maintenance-workflow.test.mjs for opted-in and other pull
  // requests; this pins the shape on every owner.
  it.each(HEAVY)(
    '%s runs on a pull request only when run-labels opts in its own suite',
    name => {
      const condition = ungated(ci.jobs[name].if);
      expect(condition).toContain(prClause(SUITE[name]));
      expect(condition.replaceAll(prClause(SUITE[name]), '')).not.toContain(
        "'pull_request'",
      );
      // No other suite's decision, and no label read directly.
      for (const other of ['visual', 'a11y', 'rtl']) {
        if (other !== SUITE[name])
          expect(condition).not.toContain(`outputs.${other}`);
      }
      expect(condition).not.toMatch(/labels\.\*\.name, 'ci:(heavy|run-)/);
      expect([ci.jobs[name].needs].flat()).toContain('run-labels');
    },
  );

  it('runs pr-visual on every pull request: its full check only with ci:run-visual, otherwise the default touched check', () => {
    const visual = ci.jobs['pr-visual'];
    const condition = ungated(visual.if);
    expect(condition).toContain(
      "(github.event_name == 'pull_request' &&\n  needs.build-storybook.result == 'success')",
    );
    expect(visual.needs).toContain('run-labels');
    const step = name =>
      visual.steps.find(candidate => candidate.name === name);
    expect(step('Run the visual gate for the touched components').if).toContain(
      "needs.run-labels.outputs.visual == 'true'",
    );
    expect(step('Decide the default touched visual check').if).toContain(
      "needs.run-labels.outputs.visual != 'true'",
    );
    const touched = step('Visual check for the default touched components');
    expect(touched.if).toBe(
      "steps.touched.outputs.has_components == 'true' && steps.touched.outputs.visual_components != ''",
    );
    expect(touched.run).toContain('gate.mjs check');
    expect(touched.run).toContain('--tiers component');
    expect(touched.run).toContain('--no-scout');
    expect(touched.run).not.toContain('--dependents');
    expect(touched.run).not.toContain('gate.mjs release');
  });

  it('decides the suites in one gate job from the trusted decision script', () => {
    const gate = ci.jobs['run-labels'];
    expect(gate['runs-on']).toBe('ubuntu-slim');
    expect(gate.permissions).toEqual({
      contents: 'read',
      'pull-requests': 'read',
    });
    expect(gate.outputs).toEqual({
      visual: '${{ steps.decide.outputs.visual }}',
      a11y: '${{ steps.decide.outputs.a11y }}',
      rtl: '${{ steps.decide.outputs.rtl }}',
    });
    expect(gate.steps[0].with).toMatchObject({
      'sparse-checkout':
        '.github/scripts/run-labels.cjs\n.github/scripts/review-signal-decision.cjs\n',
      path: '.run-labels',
      'persist-credentials': false,
    });
    expect(gate.steps[0].with.ref).toBeUndefined();
    expect(gate.steps[1].with.script).toContain(
      '.run-labels/.github/scripts/run-labels.cjs',
    );
    // It runs for the release check too, so its owners' needs succeed there.
    expect(ungated(gate.if)).toBe(
      "github.event_name != 'workflow_dispatch' || inputs.operation == 'release-check'",
    );
  });

  it('names no catch-all heavy label anywhere in the workflows', () => {
    for (const name of fs.readdirSync(
      new URL('../workflows/', import.meta.url),
    ))
      expect(
        fs.readFileSync(
          new URL(`../workflows/${name}`, import.meta.url),
          'utf8',
        ),
        name,
      ).not.toContain('ci:heavy-lanes');
  });

  it('leaves the required joins without a heavy owner, so they still report on every pull request', () => {
    for (const join of ['test', 'build', 'docsite-test']) {
      const needs = [ci.jobs[join].needs].flat();
      for (const owner of HEAVY)
        expect(needs, `${join} needs ${owner}`).not.toContain(owner);
    }
  });

  it('adds no trigger: a label takes effect on the next push or reopen', () => {
    expect(ci.on.pull_request.types).not.toContain('labeled');
  });
});

describe("main's release-check and full unit run, about once an hour (DEC-11, FR21)", () => {
  const job = heavy.jobs.dispatch;
  const script = job.steps[0].with.script;

  it('runs on a push to main and on a quarter-hourly schedule, and may dispatch workflows', () => {
    expect(heavy.on).toEqual({
      push: {branches: ['main']},
      schedule: [{cron: '7,22,37,52 * * * *'}],
    });
    expect(job.permissions).toEqual({
      actions: 'write',
      contents: 'read',
      issues: 'write',
    });
    expect(job.steps[0].env.SHA).toBe('${{ github.sha }}');
  });

  it('decides one push or tick at a time, and ci.yml cancels a running check only for a release re-check', () => {
    // Two pushes deciding at once could both see no recent check.
    expect(heavy.concurrency).toEqual({
      group: 'main-heavy-lanes-dispatch',
      'cancel-in-progress': false,
    });
    // GitHub keeps one running and one pending run per group, and a newer
    // dispatch replaces the pending one.
    expect(ci.concurrency.group).toContain(
      "(github.event_name == 'workflow_dispatch' && github.triggering_actor == 'github-actions[bot]' && 'main-heavy-lanes')",
    );
    expect(ci.concurrency['cancel-in-progress']).toBe(
      "${{ github.event_name != 'workflow_dispatch' || (inputs.recheck && github.triggering_actor == 'github-actions[bot]') }}",
    );
  });

  it("leaves Main's fast checks running for every push", () => {
    expect(Object.keys(main.jobs)).not.toContain('release-check');
    expect(JSON.stringify(main)).not.toContain('createWorkflowDispatch');
  });

  const sha = 'a'.repeat(40);
  // A Saturday, so no pre-cut check is due.
  const NOW = Date.parse('2026-10-31T12:00:00Z');
  const minutesAgo = (minutes, now = NOW) =>
    new Date(now - minutes * 60000).toISOString();
  // A unit run that names main's tip, as the scheduler dispatches it (FR21).
  const unitAt = (minutes, overrides = {}) =>
    check(minutes, {
      head_sha: sha,
      display_title: `Main validation of ${sha}`,
      ...overrides,
    });
  const check = (minutes, overrides = {}) => ({
    head_sha: 'c'.repeat(40),
    created_at: minutesAgo(minutes),
    conclusion: 'success',
    actor: {login: 'github-actions[bot]'},
    status: 'completed',
    html_url: `https://github.com/meta/astryx/actions/runs/${minutes}`,
    ...overrides,
  });

  /**
   * Runs the step's script against a fake GitHub API with main at `tip`,
   * `runs` as ci.yml's dispatched runs on main and `units` as deploy.yml's,
   * newest first. `issue` is an open guardian issue, if any, or
   * 'unavailable' when the issue search fails. `into` receives the calls even
   * when the script throws.
   */
  async function run({
    tip = sha,
    runs = [],
    units = [],
    issue,
    eventName = 'push',
    into = {},
    now = NOW,
  } = {}) {
    const calls = Object.assign(into, {
      dispatch: [],
      notices: [],
      warnings: [],
      listed: [],
      issues: [],
      comments: [],
    });
    const github = {
      rest: {
        repos: {
          getBranch: async () => ({data: {commit: {sha: tip}}}),
          getContent: async ({path}) => ({
            data: {
              content: fs
                .readFileSync(new URL(`../../${path}`, import.meta.url))
                .toString('base64'),
            },
          }),
        },
        actions: {
          listJobsForWorkflowRun: async ({run_id}) => ({
            data: {jobs: runs.find(item => item.id === run_id)?.jobs ?? []},
          }),
          listWorkflowRuns: async args => {
            calls.listed.push(args);
            return {
              data: {
                workflow_runs: args.workflow_id === 'deploy.yml' ? units : runs,
              },
            };
          },
          createWorkflowDispatch: async args => calls.dispatch.push(args),
        },
        search: {
          issuesAndPullRequests: async () => {
            if (issue === 'unavailable') throw new Error('search failed');
            return {data: {items: issue ? [issue] : []}};
          },
        },
        issues: {
          create: async args => calls.issues.push(args),
          createComment: async args => calls.comments.push(args),
        },
      },
    };
    const body = new Function(
      'github',
      'context',
      'core',
      'process',
      'Date',
      `return (async () => {${script}})();`,
    );
    class FakeDate extends Date {
      static now() {
        return now;
      }
    }
    await body(
      github,
      {repo: {owner: 'meta', repo: 'astryx'}, eventName},
      {
        notice: m => calls.notices.push(m),
        warning: m => calls.warnings.push(m),
      },
      {env: {SHA: sha}},
      FakeDate,
    );
    return calls;
  }

  const releaseCheck = tip => ({
    owner: 'meta',
    repo: 'astryx',
    workflow_id: 'ci.yml',
    ref: 'main',
    inputs: {
      operation: 'release-check',
      'release-branch': 'main',
      'expected-head': tip,
    },
  });
  // A unit run names the commit it tests (FR21, FR22).
  const unitRunOf = tip => ({
    owner: 'meta',
    repo: 'astryx',
    workflow_id: 'deploy.yml',
    ref: 'main',
    inputs: {sha: tip},
  });
  const unitRun = unitRunOf(sha);

  it("dispatches a release-check and a full unit run for main's tip when their windows have passed", async () => {
    const calls = await run({
      runs: [check(176), check(400)],
      units: [check(56)],
    });
    expect(calls.dispatch).toEqual([releaseCheck(sha), unitRun]);
    expect(calls.listed.map(args => args.workflow_id)).toEqual([
      'ci.yml',
      'deploy.yml',
    ]);
    expect(calls.listed[0]).toEqual({
      owner: 'meta',
      repo: 'astryx',
      workflow_id: 'ci.yml',
      event: 'workflow_dispatch',
      branch: 'main',
      per_page: 30,
    });
  });

  it('dispatches both for the first checks there are', async () => {
    expect((await run()).dispatch).toEqual([releaseCheck(sha), unitRun]);
  });

  it('leaves a push inside a window to the next check', async () => {
    const calls = await run({runs: [check(170)], units: [check(20)]});
    expect(calls.dispatch).toEqual([]);
    expect(calls.notices).toEqual([
      'A release-check started 170 minutes ago; the next one, at most 20 minutes from now, covers aaaaaaa.',
      'A full unit run started 20 minutes ago; the next one, at most 50 minutes from now, covers aaaaaaa.',
    ]);
  });

  it('runs the unit lane hourly on its own while the release-check waits out its three hours', async () => {
    const calls = await run({runs: [check(120)], units: [check(60)]});
    expect(calls.dispatch).toEqual([unitRun]);
  });

  describe('the pre-cut release-check (FR24)', () => {
    // Monday 2026-11-02 06:37 PST (UTC-8) and Friday 2026-10-30 06:37 PDT.
    const MONDAY_0637 = Date.parse('2026-11-02T14:37:00Z');
    const FRIDAY_0637 = Date.parse('2026-10-30T13:37:00Z');
    const at = (now, minutes, overrides = {}) =>
      check(minutes, {created_at: minutesAgo(minutes, now), ...overrides});

    it.each([
      ['standard time', MONDAY_0637],
      ['daylight time', FRIDAY_0637],
    ])(
      'starts at about 06:30 Pacific on a weekday, inside the window (%s)',
      async (_, now) => {
        const calls = await run({
          now,
          runs: [at(now, 90)],
          units: [at(now, 20)],
        });
        expect(calls.dispatch).toEqual([releaseCheck(sha), unitRun]);
        expect(calls.notices).toContain(
          'The pre-cut release-check runs now for aaaaaaa.',
        );
      },
    );

    it('starts once a day', async () => {
      // One started at 06:32 today.
      const calls = await run({
        now: MONDAY_0637,
        runs: [at(MONDAY_0637, 5)],
        units: [at(MONDAY_0637, 5)],
      });
      expect(calls.dispatch).toEqual([]);
    });

    it('is not needed when the tip already has a check', async () => {
      const calls = await run({
        now: MONDAY_0637,
        runs: [at(MONDAY_0637, 90, {head_sha: sha})],
        units: [
          at(MONDAY_0637, 20, {
            head_sha: sha,
            display_title: `Main validation of ${sha}`,
          }),
        ],
      });
      expect(calls.dispatch).toEqual([]);
    });

    it.each([
      ['on a weekend morning', Date.parse('2026-11-01T14:37:00Z')],
      ['before 06:30', Date.parse('2026-11-02T14:15:00Z')],
      ['after 07:30', Date.parse('2026-11-02T15:45:00Z')],
    ])('does not start %s', async (_, now) => {
      const calls = await run({now, runs: [at(now, 90)], units: [at(now, 20)]});
      expect(calls.dispatch).toEqual([]);
    });
  });

  it('always brings a unit run of the commit a release-check checks', async () => {
    // The unit lane is inside its window, but the tip has no unit run.
    const calls = await run({runs: [check(180)], units: [check(30)]});
    expect(calls.dispatch).toEqual([releaseCheck(sha), unitRun]);
    // A unit run already at the tip is enough.
    const covered = await run({
      runs: [check(180)],
      units: [unitAt(30)],
    });
    expect(covered.dispatch).toEqual([releaseCheck(sha)]);
  });

  it('counts a waiting or running check, but not one replaced while waiting or started by a person', async () => {
    const running = check(10, {status: 'in_progress', conclusion: null});
    expect((await run({runs: [running], units: [running]})).dispatch).toEqual(
      [],
    );
    expect(
      (
        await run({
          runs: [
            check(5, {conclusion: 'cancelled'}),
            check(10, {actor: {login: 'someone'}}),
          ],
          units: [check(10)],
        })
      ).dispatch,
    ).toEqual([releaseCheck(sha), unitRun]);
  });

  it("brings a unit run for a person's own release-check of the tip, such as the release owner's", async () => {
    const own = jobs =>
      check(10, {id: 77, head_sha: sha, actor: {login: 'someone'}, jobs});
    const releaseCheck = own([
      {name: 'release-authority', conclusion: 'success'},
    ]);
    const calls = await run({
      runs: [releaseCheck, check(40)],
      units: [check(30)],
    });
    // The scheduler's own release-check is inside its window.
    expect(calls.dispatch).toEqual([unitRun]);
    // A run that names the tip, whoever started it, is enough.
    const covered = await run({
      runs: [releaseCheck, check(40)],
      units: [
        check(5, {
          head_sha: sha,
          actor: {login: 'someone'},
          display_title: `Main validation of ${sha}`,
        }),
        check(30),
      ],
    });
    expect(covered.dispatch).toEqual([]);
    // An unnamed run at the tip tests whatever was the tip when it started,
    // so it is no receipt, and the named run still goes out (FR21).
    const unnamed = await run({
      runs: [releaseCheck, check(40)],
      units: [check(5, {head_sha: sha, actor: {login: 'someone'}}), check(30)],
    });
    expect(unnamed.dispatch).toEqual([unitRun]);
    // A maintenance capture runs no release-authority job and brings none.
    const capture = await run({
      runs: [
        own([
          {name: 'release-authority', conclusion: 'skipped'},
          {name: 'maintenance-request', conclusion: 'success'},
        ]),
        check(40),
      ],
      units: [check(30)],
    });
    expect(capture.dispatch).toEqual([]);
  });

  it('reads the commit a unit run names exactly as the release receipt does', () => {
    const NAME = '/^Main validation of ([0-9a-f]{40})$/';
    expect(JSON.stringify(heavy)).toContain(JSON.stringify(NAME).slice(1, -1));
    expect(
      fs.readFileSync(
        new URL(
          '../../scripts/release/release-check-receipt.mjs',
          import.meta.url,
        ),
        'utf8',
      ),
    ).toContain(NAME);
  });

  it('keeps counting a check a person re-runs', async () => {
    const calls = await run({
      runs: [check(90, {head_sha: sha, triggering_actor: {login: 'someone'}})],
      units: [unitAt(90)],
    });
    expect(calls.dispatch).toEqual([]);
  });

  it('counts a failed check of the tip, so a red quiet main is not checked again', async () => {
    const calls = await run({
      runs: [
        check(70, {
          id: 3,
          head_sha: sha,
          conclusion: 'failure',
          jobs: [
            {name: 'release-authority', conclusion: 'success'},
            {name: 'pr-rtl', conclusion: 'failure'},
          ],
        }),
      ],
      units: [unitAt(70, {conclusion: 'failure'})],
    });
    expect(calls.dispatch).toEqual([]);
  });

  it('checks a tip again when its run was asked to check an older commit', async () => {
    // A merge landed between the tip read and the dispatch: the run checked
    // out the tip, and its release-authority job refused the older commit.
    const mismatched = minutes =>
      check(minutes, {
        id: 4,
        head_sha: sha,
        conclusion: 'failure',
        jobs: [{name: 'release-authority', conclusion: 'failure'}],
      });
    expect(
      (await run({runs: [mismatched(180)], units: [unitAt(70)]})).dispatch,
    ).toEqual([releaseCheck(sha)]);
    // ...but it still holds the window.
    expect(
      (await run({runs: [mismatched(20)], units: [unitAt(20)]})).dispatch,
    ).toEqual([]);
  });

  it('leaves every run name as it was', () => {
    expect(ci['run-name']).toBeUndefined();
  });

  it('does not check a tip twice', async () => {
    const calls = await run({
      runs: [check(90, {head_sha: sha})],
      units: [unitAt(90)],
    });
    expect(calls.dispatch).toEqual([]);
    expect(calls.notices[0]).toMatch(/already has a release-check/);
  });

  it("picks up the tip a burst left unchecked on the schedule's tick", async () => {
    const tip = 'b'.repeat(40);
    const calls = await run({
      tip,
      eventName: 'schedule',
      runs: [check(180)],
      units: [check(60)],
    });
    expect(calls.dispatch).toEqual([releaseCheck(tip), unitRunOf(tip)]);
  });

  it('leaves a commit main has moved past to the newer push', async () => {
    const calls = await run({tip: 'b'.repeat(40)});
    expect(calls.dispatch).toEqual([]);
    expect(calls.notices[0]).toMatch(/newer push/);
  });

  describe('a full unit run that did not complete (FR21)', () => {
    const title = 'Main unit tests: an hourly run did not complete';

    it.each(['cancelled', 'skipped', 'timed_out', 'startup_failure'])(
      'runs the next one at once after a %s run and opens the guardian issue',
      async conclusion => {
        const calls = await run({
          runs: [check(20, {head_sha: sha})],
          units: [check(20, {conclusion})],
        });
        // Inside the window, but dispatched at once.
        expect(calls.dispatch).toEqual([unitRun]);
        expect(calls.issues).toEqual([
          expect.objectContaining({owner: 'meta', repo: 'astryx', title}),
        ]);
        expect(calls.issues[0].body).toContain(`ended ${conclusion}`);
        expect(calls.issues[0].body).toContain('spec:AST-030 FR21');
      },
    );

    it('comments on the open guardian issue instead of opening another', async () => {
      const calls = await run({
        runs: [check(20, {head_sha: sha})],
        units: [check(20, {conclusion: 'cancelled'})],
        issue: {number: 42, title},
      });
      expect(calls.issues).toEqual([]);
      expect(calls.comments).toEqual([
        expect.objectContaining({issue_number: 42}),
      ]);
    });

    it.each(['skipped', 'timed_out', 'startup_failure'])(
      "runs the tip again and reports it when the scheduler's own run of the tip ended %s",
      async conclusion => {
        // No merge landed: the run names the tip itself.
        const calls = await run({
          runs: [check(20, {head_sha: sha})],
          units: [unitAt(20, {conclusion})],
        });
        expect(calls.dispatch).toEqual([unitRun]);
        expect(calls.issues).toEqual([
          expect.objectContaining({owner: 'meta', repo: 'astryx', title}),
        ]);
      },
    );

    it('counts a failed run of the tip as its unit run, without a report', async () => {
      const calls = await run({
        runs: [check(20, {head_sha: sha})],
        units: [unitAt(20, {conclusion: 'failure'})],
      });
      expect(calls.dispatch).toEqual([]);
      expect(calls.issues).toEqual([]);
    });

    it('dispatches the next run before reporting, so a failed report loses no run', async () => {
      const calls = {};
      const error = await run({
        runs: [check(20, {head_sha: sha})],
        units: [check(20, {conclusion: 'cancelled'})],
        issue: 'unavailable',
        into: calls,
      }).catch(caught => caught);
      expect(error.message).toBe('search failed');
      expect(calls.dispatch).toEqual([unitRun]);
    });

    it('leaves a run a newer one replaced, such as a recheck', async () => {
      const calls = await run({
        runs: [check(20, {head_sha: sha})],
        units: [
          check(5, {status: 'in_progress', conclusion: null}),
          check(20, {conclusion: 'cancelled'}),
        ],
      });
      expect(calls.dispatch).toEqual([]);
      expect(calls.issues).toEqual([]);
    });

    it("leaves a run that a person's newer run of main's tip replaced", async () => {
      // Reported as nothing: a newer run took the group. An unnamed run is no
      // receipt, so the named run of the tip still goes out (FR21).
      const calls = await run({
        runs: [check(20, {head_sha: sha})],
        units: [
          check(5, {head_sha: sha, actor: {login: 'someone'}}),
          check(20, {conclusion: 'cancelled'}),
        ],
      });
      expect(calls.issues).toEqual([]);
      expect(calls.dispatch).toEqual([unitRun]);
      // A person's run that names the tip is the receipt itself.
      const named = await run({
        runs: [check(20, {head_sha: sha})],
        units: [
          unitAt(5, {actor: {login: 'someone'}}),
          check(20, {conclusion: 'cancelled'}),
        ],
      });
      expect(named.issues).toEqual([]);
      expect(named.dispatch).toEqual([]);
    });

    it('still runs the next one when the newer run only validated an older commit', async () => {
      const older = 'd'.repeat(40);
      const calls = await run({
        runs: [check(20, {head_sha: sha})],
        units: [
          check(5, {
            head_sha: sha,
            actor: {login: 'someone'},
            display_title: `Main validation of ${older}`,
          }),
          check(20, {conclusion: 'cancelled'}),
        ],
      });
      expect(calls.dispatch).toEqual([unitRun]);
    });

    it("takes the scheduler's own run that raced a merge as the newest", async () => {
      // main moved between the tip read and the dispatch: the newer run names
      // the older tip under a later event commit, in the same group.
      const older = 'd'.repeat(40);
      const calls = await run({
        runs: [check(20, {head_sha: sha})],
        units: [
          check(5, {
            head_sha: sha,
            display_title: `Main validation of ${older}`,
            status: 'in_progress',
            conclusion: null,
          }),
          check(20, {conclusion: 'cancelled'}),
        ],
      });
      expect(calls.issues).toEqual([]);
    });

    it('does not count a failed run as incomplete', async () => {
      const calls = await run({
        runs: [check(20, {head_sha: sha})],
        units: [check(20, {conclusion: 'failure'})],
      });
      expect(calls.dispatch).toEqual([]);
      expect(calls.issues).toEqual([]);
    });
  });
});
