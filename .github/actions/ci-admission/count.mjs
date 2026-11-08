// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How many jobs CI holds at one look, read the way the admission action
 *   reads it (spec:AST-030 FR16, DEC-16).
 * @input Two run listings (in progress, queued) and each active CI or Main
 *   run's jobs, through functions the caller passes in.
 * @output The other runs' jobs, whether a `main` check waits, the waiting and
 *   recently started pull-request runs, and a log of what each run counted.
 * @position The admission action (action.yml) imports it on every look, and
 *   a tool that grants CI capacity can run it as a command (`node count.mjs
 *   --repo <owner/name> --pr <number> [--reserved <jobs>]`), so both count CI
 *   the same way. Node built-ins only: the action's checkout holds this
 *   folder alone.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

export const CI_CEILING = 90;
// Below this many API calls left this hour, a run starts rather than spend
// the budget every job shares.
export const BUDGET_FLOOR = 1500;
// A step that uses the admission action is named this; a waiting run is found
// by it.
export const STEP = 'Wait for room under the CI ceiling';
// A pull-request run yields to a waiting `main` run for the first fifteen
// minutes of that wait. After that the `main` run still counts its whole
// peak, so a pull-request run starts only when it fits beside it
// (spec:AST-030 DEC-16).
export const MAIN_YIELD_MS = 15 * 60_000;
// A pull-request run that reaches its longest wait without room starts only
// if no other pull-request run started at its longest wait in the last ten
// minutes, about the time one run takes, and no run that has waited longer
// still waits.
export const AT_LIMIT_SPACING_MS = 10 * 60_000;
// A wait this close to the longest wait counts as one that ran out.
export const AT_LIMIT_SLACK_MS = 30_000;
// The most jobs a run holds at once, by workflow: ci.yml's release-check and
// Main's runs (a push's fast checks or a unit run) from their `peak`
// (ci-admission.test.mjs), a pull-request ci.yml run from its measured most,
// every other workflow's run one or two slim jobs.
// One line per workflow: ci-admission.test.mjs reads each estimate from it.
// prettier-ignore
const ESTIMATE = {
  '.github/workflows/ci.yml': run => (run.event === 'workflow_dispatch' ? 39 : 17),
  '.github/workflows/deploy.yml': run => (run.event === 'push' ? 4 : 14),
  '.github/workflows/review-signal.yml': () => 2,
  '.github/workflows/audits-at-head.yml': () => 10,
};
export const estimate = run => (ESTIMATE[run.path] ?? (() => 1))(run);
// Jobs always counted for small, unadmitted workflows: they peaked at twenty
// at once in a day's runs and rose by fourteen within two minutes in
// ninety-nine looks of a hundred (spec:AST-030 DEC-16).
export const SMALL_MOST = 18;
const ADMITTED = [
  '.github/workflows/ci.yml',
  '.github/workflows/deploy.yml',
  '.github/workflows/audits-at-head.yml',
];
const admitted = run => ADMITTED.includes(run.path);
const LIVE = ['in_progress', 'queued', 'waiting', 'pending'];
// A run's jobs appear within seconds of its admission; until then it counts at
// its planned most.
const JUST_ADMITTED_MS = 45_000;
// GitHub keeps listing some long-finished runs as queued; a run not updated in
// this long holds no runner.
const STALE_MS = 2 * 60 * 60_000;
export const short = run =>
  (run.path ?? '').replace(/^.*\//, '').replace(/\.ya?ml$/, '');
export const isPullRun = run =>
  run.event === 'pull_request' && run.path === '.github/workflows/ci.yml';
export const isMain = run =>
  ['push', 'schedule', 'workflow_dispatch'].includes(run.event) &&
  ['.github/workflows/ci.yml', '.github/workflows/deploy.yml'].includes(
    run.path,
  );

/**
 * When a run's wait began and, once admitted, ended: its first wait step's
 * start and its last wait step's end.
 */
export const waitSpan = waits => {
  const times = key =>
    waits.map(step => Date.parse(step[key] ?? '')).filter(Number.isFinite);
  const began = times('started_at');
  const ended = times('completed_at');
  return {
    began: began.length ? Math.min(...began) : NaN,
    ended: ended.length ? Math.max(...ended) : NaN,
  };
};

/**
 * One look at CI.
 * @param {object} options
 * @param {(status: string) => Promise<{runs: object[], remaining?: number}>} options.listRuns
 * @param {(runId: number) => Promise<object[]>} options.listJobs
 * @param {number | null} options.selfId this run's id, left out of the count
 * @param {boolean} options.main whether the looking run is a `main` check
 * @param {number} options.maxWaitMs a pull-request run's longest wait
 * @param {() => Promise<number>} [options.ownWaitStart] when the looking `main`
 *   run began waiting, on GitHub's clock
 * @returns {Promise<{lowBudget?: number, others: number, large: number, small: number, smallBy: Record<string, number>, mainWaiting: boolean, pullWaiters: {id: number, began: number}[], startedAtLimit: {id: number, ago: number}[], counted: string[], stale: number, calls: number}>}
 */
export async function countLook({
  listRuns,
  listJobs,
  selfId,
  main,
  maxWaitMs,
  ownWaitStart = async () => NaN,
}) {
  const seen = new Set();
  let large = 0;
  let small = 0;
  let mainWaiting = false;
  let calls = 0;
  // Pull-request runs that started at their longest wait lately, and those
  // still waiting, by when their wait began.
  const startedAtLimit = [];
  const pullWaiters = [];
  // What each run counted, logged on every look.
  const counted = [];
  const smallBy = {};
  let stale = 0;
  for (const status of ['in_progress', 'queued']) {
    calls += 1;
    const {runs, remaining} = await listRuns(status);
    if (Number.isFinite(remaining) && remaining < BUDGET_FLOOR) {
      return {lowBudget: remaining, calls};
    }
    for (const run of runs) {
      if (seen.has(run.id) || run.id === selfId) continue;
      seen.add(run.id);
      if (Date.now() - Date.parse(run.updated_at ?? '') > STALE_MS) {
        stale += 1;
        continue;
      }
      if (!admitted(run)) {
        small += estimate(run);
        smallBy[short(run)] = (smallBy[short(run)] ?? 0) + estimate(run);
        continue;
      }
      calls += 1;
      const jobs = await listJobs(run.id);
      // A CI run waits in `room`, then in `admission`.
      const waits = jobs
        .flatMap(job => job.steps ?? [])
        .filter(step => step.name === STEP);
      const span = waitSpan(waits);
      if (waits.some(step => step.status === 'in_progress')) {
        if (isPullRun(run)) pullWaiters.push({id: run.id, began: span.began});
        // Still waiting for room. A `main` run holds its whole peak, ahead of
        // this one. A pull-request run holds what it runs: the job that waits
        // and its Storybook build, which starts beside it. `main` runs queue
        // by when they began waiting, both read on GitHub's clock, a tie going
        // to the lower run id: a `main` run that began after this one holds
        // only what it runs, so of two waiting `main` runs exactly one counts
        // the other's peak.
        const mine = main && isMain(run) ? await ownWaitStart() : NaN;
        const ahead =
          !main ||
          !(span.began > mine || (span.began === mine && run.id > selfId));
        const holds =
          isMain(run) && ahead
            ? estimate(run)
            : Math.max(1, jobs.filter(job => LIVE.includes(job.status)).length);
        if (isMain(run) && !main && !(Date.now() - span.began >= MAIN_YIELD_MS))
          mainWaiting = true;
        large += holds;
        counted.push(`${short(run)} ${run.id} ${run.event}: ${holds} waiting`);
        continue;
      }
      if (
        isPullRun(run) &&
        span.ended - span.began >= maxWaitMs - AT_LIMIT_SLACK_MS
      ) {
        // Out of time: it started only once its admission job succeeded.
        // Until admission decides, it ranks as a waiter; a run CI was full
        // for never started.
        const decided = jobs.find(
          job => job.name === 'admission' && job.status === 'completed',
        );
        if (decided == null) pullWaiters.push({id: run.id, began: span.began});
        else if (
          decided.conclusion === 'success' &&
          Date.now() - span.ended < AT_LIMIT_SPACING_MS
        ) {
          startedAtLimit.push({id: run.id, ago: Date.now() - span.ended});
        }
      }
      const live = jobs.filter(job => LIVE.includes(job.status)).length;
      const ended = waits
        .map(step => Date.parse(step.completed_at ?? ''))
        .filter(Number.isFinite);
      const admittedAt = ended.length > 0 ? Math.max(...ended) : NaN;
      const fresh = Date.now() - admittedAt < JUST_ADMITTED_MS;
      const holds = fresh ? Math.max(live, estimate(run)) : live;
      large += holds;
      counted.push(
        `${short(run)} ${run.id} ${run.event}: ${holds}${fresh && holds > live ? ` (admitted just now, ${live} live)` : ' live'}`,
      );
    }
  }
  return {
    others: large + Math.max(small, SMALL_MOST),
    large,
    small,
    smallBy,
    mainWaiting,
    pullWaiters,
    startedAtLimit,
    counted,
    stale,
    calls,
  };
}

function ghJson(path) {
  return JSON.parse(
    execFileSync('gh', ['api', path], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
}

/**
 * A pull-request run's peak as ci.yml's admission step declares it: its
 * pull-request `peak` plus the jobs each of the pull request's labels adds
 * (`label-legs`). Read from the workflow itself, so the sizes live in one
 * place.
 * @param {string} workflow ci.yml's text
 * @param {string[]} labels
 */
export function pullRequestPeak(workflow, labels) {
  const peak =
    /peak: \$\{\{ github\.event_name == 'workflow_dispatch' && \d+ \|\| (\d+) \}\}/.exec(
      workflow,
    );
  const legs = /label-legs: '([^']*)'/.exec(workflow);
  if (!peak || !legs)
    throw new Error("ci.yml's admission step has no peak or label-legs.");
  const extra = JSON.parse(legs[1]);
  return labels.reduce(
    (total, label) => total + (extra[label] ?? 0),
    Number(peak[1]),
  );
}

/**
 * The command a capacity tool runs: one look, read through `gh api`, as a
 * pull-request run sees CI. `--pr` takes the run's peak from that pull
 * request's labels and ci.yml; `--peak` sets it instead; `--main` looks as a
 * `main` check. `--reserved` adds jobs the tool has granted that do not show
 * yet, and `--run` leaves out the pull request's own run if it already waits. It prints one JSON line and exits 0, or 2 when a lookup fails, which
 * the tool reads as no room.
 */
async function main() {
  const argv = process.argv.slice(2);
  const value = name => {
    const at = argv.indexOf(name);
    return at === -1 ? undefined : argv[at + 1];
  };
  const repo = value('--repo');
  const pr = value('--pr');
  const reserved = Number(value('--reserved') ?? 0);
  // The pull request's own CI run, if it already waits: left out, as
  // admission leaves itself out, so its jobs are not counted twice.
  const runId = value('--run') == null ? null : Number(value('--run'));
  const usage = () => {
    console.error(
      'usage: count.mjs --repo <owner/name> (--pr <number> | --peak <jobs>) [--reserved <jobs>] [--run <id>] [--main]',
    );
    process.exit(2);
  };
  if (!repo || !Number.isInteger(reserved) || reserved < 0) usage();
  const isMainCheck = argv.includes('--main');
  try {
    let peak = Number(value('--peak'));
    // Every API call this command makes, the labels read included.
    let labelCalls = 0;
    if (value('--peak') == null && pr != null) {
      labelCalls = 1;
      const workflow = fs.readFileSync(
        fileURLToPath(new URL('../../workflows/ci.yml', import.meta.url)),
        'utf8',
      );
      const labels = ghJson(`repos/${repo}/pulls/${pr}`).labels.map(
        label => label.name,
      );
      peak = pullRequestPeak(workflow, labels);
    }
    if (!Number.isInteger(peak) || peak < 1) usage();
    const look = await countLook({
      listRuns: async status => ({
        runs: ghJson(`repos/${repo}/actions/runs?status=${status}&per_page=100`)
          .workflow_runs,
      }),
      listJobs: async id =>
        ghJson(
          `repos/${repo}/actions/runs/${id}/jobs?filter=latest&per_page=100`,
        ).jobs,
      selfId: runId,
      main: isMainCheck,
      maxWaitMs: (isMainCheck ? 120 : 12) * 60_000,
    });
    const others = look.others + reserved;
    console.log(
      JSON.stringify({
        others,
        reserved,
        peak,
        ceiling: CI_CEILING,
        fits: others + peak <= CI_CEILING && (isMainCheck || !look.mainWaiting),
        mainWaiting: look.mainWaiting,
        calls: look.calls + labelCalls,
        counted: look.counted,
      }),
    );
  } catch (error) {
    console.error(`CI could not be counted: ${error.message}`);
    process.exit(2);
  }
}

// Real paths on both sides: Node keeps a symlinked path as typed in argv but
// resolves the module's own URL.
if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
