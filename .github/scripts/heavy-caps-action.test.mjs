// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Per-author caps on heavy suites (.github/actions/heavy-caps,
 * spec:AST-030 FR16). These cases run the action's real script, as
 * actions/github-script runs it, against a stubbed GitHub API.
 */

import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';
import {withoutCheckoutRetries} from './lib/checkout-retries.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const action = yaml.parse(
  fs.readFileSync(
    path.join(root, '.github/actions/heavy-caps/action.yml'),
    'utf8',
  ),
);
const script = action.runs.steps.find(step =>
  step.uses?.startsWith('actions/github-script@'),
).with.script;
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
// The release-critical label check, run for real against the stub GitHub.
const RUN_LABELS_MODULE = path.join(root, '.github/scripts/run-labels.cjs');
const runLabels = await import(RUN_LABELS_MODULE);
const nodeUrl = await import('node:url');

const isCaps = step =>
  step.uses?.startsWith('./') &&
  step.uses.endsWith('/.github/actions/heavy-caps');
const QUEUED =
  'Queued behind your 15 oldest PRs: runs at a review-pass run once it is among them, or at the pre-merge re-run.';
const BACKSTOP =
  "Queued behind the shared login's 5 oldest PRs: runs at a review-pass run once it is among them, or at the pre-merge re-run.";
const CAPPED =
  'Daily heavy-run cap reached: runs at a review-pass run after the cap resets, or at the pre-merge re-run.';
const ENGOWNERS =
  '# Engineering owners\n# @commented-out\n\n@owner-one @Owner-Two # was @trailing-comment\n';

function pullRequestContext(pr = {}) {
  return {
    eventName: 'pull_request',
    repo: {owner: 'o', repo: 'r'},
    runId: 1,
    payload: {
      pull_request: {
        number: 20,
        head: {ref: 'fix/a', repo: {full_name: 'author/r'}},
        base: {sha: 'base-sha'},
        user: {login: 'author'},
        ...pr,
      },
    },
  };
}

/** Runs the action script; returns the failure and warning messages. */
async function check({
  context = pullRequestContext(),
  open = [],
  runs = [],
  attempt = '1',
  triggeringActor = 'author',
  engowners = ENGOWNERS,
  labelers = {},
  permissions = {},
} = {}) {
  const messages = {failed: [], warning: [], notice: []};
  const core = {
    setFailed: message => messages.failed.push(message),
    warning: message => messages.warning.push(message),
    notice: message => messages.notice.push(message),
  };
  const github = {
    graphql: async query => {
      // Who applied each label, newest last (run-labels.cjs).
      if (query.includes('timelineItems'))
        return {
          repository: {
            pullRequest: {
              timelineItems: {
                nodes: Object.entries(labelers).map(([name, login]) => ({
                  actor: {login},
                  label: {name},
                })),
              },
            },
          },
        };
      // The author's open non-draft PRs, oldest first.
      if (open instanceof Error) throw open;
      return {search: {nodes: open}};
    },
    rest: {
      repos: {
        getCollaboratorPermissionLevel: async ({username}) => {
          const permission = permissions[username];
          if (permission instanceof Error) throw permission;
          return {data: {permission: permission ?? 'none'}};
        },
        // The roster is read from the base commit only.
        getContent: async ({path: file, ref}) => {
          if (file !== '.github/ENGOWNERS' || ref !== 'base-sha')
            throw new Error(`unexpected read ${file}@${ref}`);
          if (engowners instanceof Error) throw engowners;
          return {data: {content: Buffer.from(engowners).toString('base64')}};
        },
      },
      actions: {
        // Today's ci.yml runs on a branch name, from any repository.
        listWorkflowRuns: async ({branch}) => ({
          data: {workflow_runs: runs.filter(run => run.head_branch === branch)},
        }),
        // A CI run has more jobs than the API's default page of 30; a run whose
        // heavy job ran its suite has a successful marker step.
        listJobsForWorkflowRun: async ({run_id, per_page = 30}) => {
          if (per_page < 100) throw new Error('read one default page of jobs');
          const heavy = runs.find(run => run.id === run_id).heavy !== false;
          return {
            data: {
              jobs: [
                {
                  steps: heavy
                    ? [{name: 'Heavy suite runs', conclusion: 'success'}]
                    : [],
                },
              ],
            },
          };
        },
      },
    },
  };
  const saved = process.env.GITHUB_RUN_ATTEMPT;
  const savedActor = process.env.GITHUB_TRIGGERING_ACTOR;
  process.env.GITHUB_RUN_ATTEMPT = attempt;
  process.env.GITHUB_TRIGGERING_ACTOR = triggeringActor;
  process.env.RUN_LABELS_MODULE = RUN_LABELS_MODULE;
  try {
    // The script loads modules with `import()`, which a function built here
    // cannot call; the test passes them in.
    await new AsyncFunction(
      'github',
      'context',
      'core',
      'importModule',
      script.replaceAll('await import(', 'await importModule('),
    )(github, context, core, async specifier =>
      specifier === 'node:url' ? nodeUrl : runLabels,
    );
  } finally {
    if (saved === undefined) delete process.env.GITHUB_RUN_ATTEMPT;
    else process.env.GITHUB_RUN_ATTEMPT = saved;
    if (savedActor === undefined) delete process.env.GITHUB_TRIGGERING_ACTOR;
    else process.env.GITHUB_TRIGGERING_ACTOR = savedActor;
  }
  return messages;
}

const fork = {nameWithOwner: 'author/r'};
const here = {nameWithOwner: 'o/r'};
const pulls = (...refs) =>
  refs.map((headRefName, i) => ({
    number: i + 1,
    headRefName,
    headRepository: headRefName.startsWith('fix/') ? fork : here,
  }));
const me = {number: 20, headRefName: 'fix/a', headRepository: fork};
// The author's fifteen older pull requests.
const older15 = () =>
  pulls(...Array.from({length: 15}, (_, i) => `fix/older-${i}`));
let nextRun = 100;
const runsOn = (count, head_branch = 'fix/a', run = {}) =>
  Array.from({length: count}, () => ({
    id: nextRun++,
    head_branch,
    head_repository: {
      full_name: head_branch.startsWith('fix/') ? 'author/r' : 'o/r',
    },
    ...run,
  }));

describe('per-author caps on heavy suites (spec:AST-030 FR16)', () => {
  it("fails a heavy job behind the author's 15 oldest PRs", async () => {
    const open = [...older15(), me];
    expect((await check({open})).failed).toEqual([QUEUED]);
    expect((await check({open: open.slice(1)})).failed).toEqual([]);
    // The search holds at most the author's 100 oldest; a newer pull request
    // missing from it is still behind them.
    const many = pulls(...Array.from({length: 100}, (_, i) => `fix/${i}`));
    expect(
      (await check({context: pullRequestContext({number: 300}), open: many}))
        .failed,
    ).toEqual([QUEUED]);
  });

  it("fails a heavy job past the author's 100 heavy runs today", async () => {
    expect((await check({open: [me], runs: runsOn(100)})).failed).toEqual([
      CAPPED,
    ]);
    // The cap counts the author's heavy runs across all of their oldest pull
    // requests, not only the one deciding.
    const spread = await check({
      open: [...pulls('fix/b', 'fix/c'), me],
      runs: [...runsOn(50, 'fix/b'), ...runsOn(25, 'fix/c'), ...runsOn(25)],
    });
    expect(spread.failed).toEqual([CAPPED]);
    // When the deciding pull request is the author's oldest, the count still
    // reaches their fifteenth-oldest.
    const first = await check({
      context: pullRequestContext({number: 1}),
      open: [{...me, number: 1}, ...older15().slice(1)],
      runs: [...runsOn(50), ...runsOn(50, 'fix/older-14')],
    });
    expect(first.failed).toEqual([CAPPED]);
    // Cancelled runs, runs whose heavy suites never ran (a queued PR) and runs
    // on other branches are not heavy runs.
    const light = await check({
      open: [me],
      runs: [
        ...runsOn(99),
        ...runsOn(5, 'fix/a', {conclusion: 'cancelled'}),
        ...runsOn(5, 'fix/a', {heavy: false}),
        ...runsOn(5, 'fix/old-merged'),
      ],
    });
    expect(light.failed).toEqual([]);
    // A run is the pull request's by its branch and that branch's repository:
    // another fork's same-named branch is not, whoever pushed.
    const elsewhere = await check({
      open: [me],
      runs: [
        ...runsOn(99),
        ...runsOn(5, 'fix/a', {head_repository: {full_name: 'other/r'}}),
      ],
    });
    expect(elsewhere.failed).toEqual([]);
  });

  it('counts each agent lane of the shared login as an author, with backstops', async () => {
    const context = pullRequestContext({
      user: {login: 'cixzhang'},
      head: {ref: 'lane4/x', repo: {full_name: 'o/r'}},
    });
    const mine = {number: 20, headRefName: 'lane4/x', headRepository: here};
    const others = await check({
      context,
      open: [...pulls('lane1/a', 'lane2/b', 'lane3/c', 'lane0/d'), mine],
      runs: [...runsOn(30, 'lane1/a'), ...runsOn(2, 'lane4/x')],
    });
    expect(others.failed).toEqual([]);
    const backstop = await check({
      context,
      open: [
        ...pulls('lane1/a', 'lane2/b', 'lane3/c', 'lane0/d', 'ci/e'),
        mine,
      ],
    });
    // The backstop names itself, so a lane with room knows why it waits.
    expect(backstop.failed).toEqual([BACKSTOP]);
    // The login's forty-run count reaches its fifth-oldest pull request.
    const fifth = await check({
      context: pullRequestContext({
        number: 1,
        user: {login: 'cixzhang'},
        head: {ref: 'lane4/x', repo: {full_name: 'o/r'}},
      }),
      open: [
        {...mine, number: 1},
        ...pulls('x', 'lane1/a', 'lane2/b', 'lane3/c', 'lane0/d').slice(1),
      ],
      runs: ['lane4/x', 'lane1/a', 'lane2/b', 'lane3/c', 'lane0/d'].flatMap(
        branch => runsOn(8, branch),
      ),
    });
    expect(fifth.failed).toEqual([CAPPED]);
    // The login as a whole stops at forty heavy runs a day.
    const lanes = [...pulls('lane1/a', 'lane2/b'), mine];
    expect(
      (
        await check({
          context,
          open: lanes,
          runs: [...runsOn(38, 'lane1/a'), ...runsOn(2, 'lane4/x')],
        })
      ).failed,
    ).toEqual([CAPPED]);
    expect(
      (
        await check({
          context,
          open: lanes,
          runs: [...runsOn(37, 'lane1/a'), ...runsOn(2, 'lane4/x')],
        })
      ).failed,
    ).toEqual([]);
  });

  it('exempts engineering owners, read from the base commit', async () => {
    const crowded = {
      open: [...older15(), me],
      runs: runsOn(20),
    };
    for (const login of ['owner-one', 'owner-two', 'OWNER-ONE']) {
      expect(
        (
          await check({
            context: pullRequestContext({user: {login}}),
            ...crowded,
          })
        ).failed,
      ).toEqual([]);
    }
    // A commented-out handle, or anyone else, is not an owner.
    for (const login of ['commented-out', 'trailing-comment', 'author']) {
      expect(
        (
          await check({
            context: pullRequestContext({user: {login}}),
            ...crowded,
          })
        ).failed,
      ).toEqual([QUEUED]);
    }
    // The shared agent login is exempt when it is listed.
    const lane = await check({
      context: pullRequestContext({
        user: {login: 'cixzhang'},
        head: {ref: 'lane4/x', repo: {full_name: 'o/r'}},
      }),
      engowners: '@cixzhang\n',
      open: [
        ...pulls('lane4/a', 'lane4/b', 'lane4/c', 'lane1/d', 'ci/e'),
        {number: 7, headRefName: 'lane4/x', headRepository: here},
      ],
      runs: runsOn(45, 'lane4/a'),
    });
    expect(lane.failed).toEqual([]);
    // When the roster cannot be read, the suite runs.
    const unread = await check({
      ...crowded,
      engowners: new Error('not found'),
    });
    expect(unread.failed).toEqual([]);
    expect(unread.warning[0]).toContain('running the heavy suite');
  });

  it('exempts bots and does not count the run deciding', async () => {
    const bot = await check({
      context: pullRequestContext({user: {login: 'dependabot[bot]'}}),
      open: [...older15(), me],
    });
    expect(bot.failed).toEqual([]);
    const self = await check({
      context: {...pullRequestContext(), runId: 900},
      open: [me],
      runs: [
        ...runsOn(99),
        {
          id: 900,
          head_branch: 'fix/a',
          head_repository: {full_name: 'author/r'},
        },
      ],
    });
    expect(self.failed).toEqual([]);
  });

  it('exempts the pre-merge re-run and events other than a pull request, and runs when the lookup fails', async () => {
    expect(
      (await check({open: [me], runs: runsOn(20), attempt: '2'})).failed,
    ).toEqual([]);
    expect(
      (
        await check({
          context: {
            eventName: 'merge_group',
            repo: {owner: 'o', repo: 'r'},
            payload: {},
          },
          open: new Error('unused'),
        })
      ).failed,
    ).toEqual([]);
    const failed = await check({open: new Error('rate limited')});
    expect(failed.failed).toEqual([]);
    expect(failed.warning[0]).toContain('running the heavy suite');
  });

  it('holds the review-pass run like a first run, and never the pre-merge re-run of the same head (spec:AST-030 FR16, FR20)', async () => {
    const over = {open: [...older15(), me], attempt: '2'};
    // ci-review-pass.yml re-runs the deferred run with the workflow token.
    expect(
      (await check({...over, triggeringActor: 'github-actions[bot]'})).failed,
    ).toEqual([QUEUED]);
    expect(
      (
        await check({
          open: [me],
          runs: runsOn(100),
          attempt: '2',
          triggeringActor: 'github-actions[bot]',
        })
      ).failed,
    ).toEqual([CAPPED]);
    // merge-guard's pre-merge re-run, started by a person's token, is exempt.
    expect(
      (await check({...over, triggeringActor: 'cixzhang'})).failed,
    ).toEqual([]);
    // A release-critical pull request's review-pass run is never held.
    expect(
      (
        await check({
          ...over,
          triggeringActor: 'github-actions[bot]',
          context: pullRequestContext({labels: [{name: 'release-critical'}]}),
          labelers: {'release-critical': 'maintainer'},
          permissions: {maintainer: 'write'},
        })
      ).failed,
    ).toEqual([]);
  });

  it('never holds a pull request labelled release-critical by someone with write access (spec:AST-030 DEC-30)', async () => {
    const labelled = pullRequestContext({labels: [{name: 'release-critical'}]});
    const over = {open: [...older15(), me], runs: runsOn(100)};
    const trusted = await check({
      ...over,
      context: labelled,
      labelers: {'release-critical': 'maintainer'},
      permissions: {maintainer: 'write'},
    });
    expect(trusted.failed).toEqual([]);
    // A label someone without write access applied last, no readable label
    // event, or a failed lookup holds it as an unlabelled one.
    for (const trust of [
      {labelers: {'release-critical': 'reader'}, permissions: {reader: 'read'}},
      {labelers: {}, permissions: {}},
      {
        labelers: {'release-critical': 'maintainer'},
        permissions: {maintainer: new Error('lookup failed')},
      },
    ]) {
      expect(
        (await check({...over, context: labelled, ...trust})).failed,
      ).toEqual([QUEUED]);
    }
    // Another label changes nothing.
    expect(
      (
        await check({
          ...over,
          context: pullRequestContext({labels: [{name: 'ci:run-visual'}]}),
          labelers: {'ci:run-visual': 'maintainer'},
          permissions: {maintainer: 'write'},
        })
      ).failed,
    ).toEqual([QUEUED]);
  });

  it('loads every local action from the merge commit, never from a checkout of the pull request head', () => {
    // A head that predates a local action does not have it. Only the setup
    // action, the pull request's own toolchain, may come from its head.
    const dir = path.join(root, '.github/workflows');
    for (const name of fs
      .readdirSync(dir)
      .filter(file => file.endsWith('.yml'))) {
      const workflow = yaml.parse(
        fs.readFileSync(path.join(dir, name), 'utf8'),
      );
      for (const [id, job] of Object.entries(workflow.jobs ?? {})) {
        const checkouts = new Map();
        for (const step of job.steps ?? []) {
          if (step.uses?.startsWith('actions/checkout@')) {
            checkouts.set(
              path.normalize(step.with?.path ?? '.'),
              String(step.with?.ref ?? ''),
            );
            continue;
          }
          if (
            !step.uses?.startsWith('./') ||
            step.uses === './.github/actions/setup'
          )
            continue;
          const action = path.normalize(step.uses);
          const owner = [...checkouts.keys()]
            .filter(
              dir =>
                dir === '.' || action === dir || action.startsWith(`${dir}/`),
            )
            .sort((a, b) => b.length - a.length)[0];
          expect(owner, `${name}/${id} ${step.uses}`).toBeDefined();
          expect(
            checkouts.get(owner),
            `${name}/${id} ${step.uses}`,
          ).not.toContain('pull_request.head');
        }
      }
    }
  });

  it('runs in each heavy job right after its checkout, followed by the step the daily cap counts', () => {
    const ci = yaml.parse(
      fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
    );
    const heavyJobs = Object.entries(ci.jobs).filter(([, job]) =>
      job.steps?.some(isCaps),
    );
    expect(heavyJobs.map(([id]) => id).sort()).toEqual([
      'pr-interaction',
      'pr-interaction-webkit',
      'test-build',
    ]);
    for (const [id, job] of heavyJobs) {
      const steps = withoutCheckoutRetries(job.steps);
      const caps = steps.findIndex(isCaps);
      expect(steps[caps - 1].uses, id).toMatch(/^actions\/checkout@/);
      // A sparse checkout brings the release-critical label check's scripts.
      const sparse = steps[caps - 1].with?.['sparse-checkout'];
      if (sparse)
        expect(String(sparse).split('\n'), id).toEqual(
          expect.arrayContaining(['.github/scripts/lib']),
        );
      // The engineering-owner roster is read with contents: read.
      expect(job.permissions, id).toMatchObject({
        actions: 'read',
        contents: 'read',
        'pull-requests': 'read',
      });
      expect(steps[caps + 1], id).toMatchObject({
        name: 'Heavy suite runs',
        run: 'true',
      });
      expect(steps[caps + 1].if, id).toBe(steps[caps].if);
      expect(steps[caps].if, id).toBe(steps[caps - 1].if);
    }
  });
});
