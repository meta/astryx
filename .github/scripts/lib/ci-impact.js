// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ci-impact.js
 * @input A pull request's changed files, CI's workflow file at the merge base
 *   and at the head, the source run's jobs, and a sample of recent pull-request
 *   CI runs (their jobs and wall-clock times, plus how many ran in 7 days)
 * @output For a pull request that changes CI: each changed job's runner class
 *   (standard GitHub-hosted, or non-standard), job-minutes per pull-request
 *   update before and after, the change in runner-pool usage (runner-minutes
 *   a day and average concurrent jobs), time to green, runs a day, the flags
 *   that need a reviewer's eye, and that as one collapsed report section
 * @position Used by the PR comment job (pr-preview.mjs gathers the data,
 *   generate-pr-comment.js renders it). It reads only run history the job can
 *   already see; nothing here starts a job. It reports runner usage, never
 *   prices.
 */

const {num} = require('./report-text');

/** Paths whose change makes a pull request a CI change. */
const CI_PATH =
  /^(\.github\/workflows\/|\.github\/actions\/|\.github\/scripts\/|\.github\/ci-|scripts\/ci-)/;

/** GitHub's standard hosted runner labels; anything else is non-standard. */
const STANDARD_RUNNER =
  /^(ubuntu-slim|(ubuntu|windows|macos)-(latest|\d+(\.\d+)?)(-arm)?)$/;

const FLAG_POOL_PERCENT = 10;
const FLAG_WALL_MINUTES = 2;

function isCiChange(files) {
  return (files || []).some(file => CI_PATH.test(file));
}

/**
 * The runner labels a `runs-on` value can pick: a literal, or in an
 * expression the strings it can yield (those after `&&` or `||`).
 */
function runnerLabels(runsOn) {
  if (Array.isArray(runsOn)) return runsOn.map(String);
  const text = String(runsOn ?? '');
  if (!text.includes('${{')) return [text.trim()].filter(Boolean);
  return [...text.matchAll(/(?:&&|\|\|)\s*'([^']+)'/g)].map(match => match[1]);
}

/** `standard`, `non-standard`, or `mixed` (an expression that can pick either). */
function runnerClass(runsOn) {
  const labels = runnerLabels(runsOn);
  const standard = labels.filter(label => STANDARD_RUNNER.test(label));
  if (standard.length === labels.length) return {kind: 'standard', labels};
  if (standard.length === 0) return {kind: 'non-standard', labels};
  return {
    kind: 'mixed',
    labels,
    nonStandard: labels.filter(label => !STANDARD_RUNNER.test(label)),
  };
}

/** A job's name as the run shows it, without its matrix suffix. */
function displayName(id, job) {
  return String(job?.name ?? id).replace(/\s*\(.*\)\s*$/, '');
}

/**
 * Job by job, what changed between two parsed workflow files: added, removed,
 * or changed (any part of its definition), with its runner class on each side.
 */
function diffWorkflow(base, head) {
  const baseJobs = base?.jobs || {};
  const headJobs = head?.jobs || {};
  const ids = [
    ...new Set([...Object.keys(baseJobs), ...Object.keys(headJobs)]),
  ].sort();
  const changes = [];
  for (const id of ids) {
    const before = baseJobs[id];
    const after = headJobs[id];
    if (before && after && JSON.stringify(before) === JSON.stringify(after))
      continue;
    changes.push({
      id,
      name: displayName(id, after ?? before),
      change: !before ? 'added' : !after ? 'removed' : 'changed',
      before: before ? runnerClass(before['runs-on']) : null,
      after: after ? runnerClass(after['runs-on']) : null,
    });
  }
  // Variants of one job (`pr-a11y (browser specs)`, `pr-a11y (full audit)`)
  // share a name in the report: one entry per name and kind of change.
  const seen = new Set();
  const unique = changes.filter(change => {
    const key = `${change.name}:${change.change}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    changes: unique,
    triggersChanged: JSON.stringify(base?.on) !== JSON.stringify(head?.on),
    names: {
      before: Object.entries(baseJobs).map(([id, job]) => displayName(id, job)),
      after: Object.entries(headJobs).map(([id, job]) => displayName(id, job)),
    },
  };
}

function minutes(job) {
  const start = Date.parse(job.started_at ?? job.startedAt ?? '');
  const end = Date.parse(job.completed_at ?? job.completedAt ?? '');
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    ? (end - start) / 60000
    : 0;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * From a sample of recent pull-request runs: each job's average runner
 * minutes per run (its legs summed, 0 when it did not run), the median
 * wall-clock time to a finished run, and runs a day.
 */
function summarizeHistory({runs, runsLast7Days}) {
  const perJob = new Map();
  const wall = [];
  for (const run of runs || []) {
    const totals = new Map();
    for (const job of run.jobs || []) {
      if (job.conclusion === 'skipped') continue;
      const name = displayName(job.name, job);
      totals.set(name, (totals.get(name) ?? 0) + minutes(job));
    }
    for (const [name, value] of totals) {
      if (!perJob.has(name)) perJob.set(name, 0);
      perJob.set(name, perJob.get(name) + value);
    }
    const started = Date.parse(run.run_started_at ?? run.created_at ?? '');
    const finished = Date.parse(run.updated_at ?? '');
    if (
      Number.isFinite(started) &&
      Number.isFinite(finished) &&
      finished > started
    )
      wall.push((finished - started) / 60000);
  }
  const count = Math.max(1, (runs || []).length);
  return {
    sampled: (runs || []).length,
    jobMinutes: Object.fromEntries(
      [...perJob].map(([name, total]) => [name, total / count]),
    ),
    wallMinutes: median(wall),
    runsPerDay: num(runsLast7Days) / 7,
  };
}

/** Each job's runner minutes in this run (legs summed), by display name. */
function runMinutes(jobs) {
  const totals = {};
  for (const job of jobs || []) {
    if (job.conclusion === 'skipped') continue;
    const name = displayName(job.name, job);
    totals[name] = (totals[name] ?? 0) + minutes(job);
  }
  return totals;
}

/**
 * Before and after for one pull-request update. Before is each base job's
 * recent average; after keeps that average for an unchanged job and uses this
 * run's own minutes for an added or changed one (a removed job counts zero).
 */
function estimateImpact({diff, history, currentJobs, currentWallMinutes}) {
  const current = runMinutes(currentJobs);
  const changed = new Set(
    diff.changes.filter(c => c.change !== 'removed').map(c => c.name),
  );
  const sum = (names, pick) =>
    [...new Set(names)].reduce((total, name) => total + pick(name), 0);
  const before = sum(diff.names.before, name => history.jobMinutes[name] ?? 0);
  const after = sum(diff.names.after, name =>
    changed.has(name)
      ? (current[name] ?? history.jobMinutes[name] ?? 0)
      : (history.jobMinutes[name] ?? 0),
  );
  const perDay = value => value * history.runsPerDay;
  const poolBefore = perDay(before);
  const poolAfter = perDay(after);
  const poolPercent =
    poolBefore > 0 ? ((poolAfter - poolBefore) / poolBefore) * 100 : 0;
  const wallDelta =
    history.wallMinutes !== null && Number.isFinite(currentWallMinutes)
      ? currentWallMinutes - history.wallMinutes
      : null;
  const addedNonStandard = diff.changes.filter(change => {
    const afterLabels = change.after
      ? (change.after.nonStandard ??
        (change.after.kind === 'non-standard' ? change.after.labels : []))
      : [];
    const beforeLabels = change.before
      ? (change.before.nonStandard ??
        (change.before.kind === 'non-standard' ? change.before.labels : []))
      : [];
    return afterLabels.some(label => !beforeLabels.includes(label));
  });
  const flags = [
    ...addedNonStandard.map(
      change => `\`${change.name}\` moves onto a non-standard runner`,
    ),
    ...(poolPercent > FLAG_POOL_PERCENT
      ? [`runner-pool usage +${poolPercent.toFixed(0)}%`]
      : []),
    ...(wallDelta !== null && wallDelta > FLAG_WALL_MINUTES
      ? [`time to green +${wallDelta.toFixed(1)} min`]
      : []),
    ...(diff.triggersChanged
      ? ['the workflow triggers changed, so runs a day may change too']
      : []),
  ];
  return {
    jobMinutes: {before, after},
    pool: {before: poolBefore, after: poolAfter, percent: poolPercent},
    concurrent: {before: poolBefore / 1440, after: poolAfter / 1440},
    wall: {
      before: history.wallMinutes,
      after: currentWallMinutes ?? null,
      delta: wallDelta,
    },
    runsPerDay: history.runsPerDay,
    sampled: history.sampled,
    changes: diff.changes,
    flags,
  };
}

/** When a workflow runs, in words: its events, and a schedule's cron times. */
function triggerText(on) {
  if (!on) return 'no trigger';
  if (typeof on === 'string') return on;
  if (Array.isArray(on)) return on.join(', ');
  return Object.entries(on)
    .map(([event, config]) =>
      event === 'schedule' && Array.isArray(config)
        ? `schedule (${config.map(entry => `\`${entry.cron}\``).join(', ')})`
        : event,
    )
    .join(', ');
}

/**
 * A changed workflow other than CI's own: whether it was added, removed or
 * changed, when it runs, and each job's runner class. Its minutes are not
 * estimated: the pull request's run does not run it.
 */
function describeWorkflow(file, base, head) {
  const doc = head ?? base;
  const jobs = Object.entries(doc?.jobs || {}).map(([id, job]) => ({
    name: displayName(id, job),
    runner: runnerClass(job['runs-on']),
  }));
  return {
    file,
    change: !base ? 'added' : !head ? 'removed' : 'changed',
    triggers: triggerText(doc?.on),
    jobs,
    nonStandard:
      !!head &&
      jobs.some(job => job.runner.kind !== 'standard') &&
      (!base ||
        Object.values(base.jobs || {}).every(
          job => runnerClass(job['runs-on']).kind === 'standard',
        )),
  };
}

function signed(value, digits = 0, unit = '') {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return `0${unit}`;
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toLocaleString('en-US', {maximumFractionDigits: digits})}${unit}`;
}

function amount(value, digits = 0) {
  return Number(value.toFixed(digits)).toLocaleString('en-US', {
    maximumFractionDigits: digits,
  });
}

function runnerText(cls) {
  if (!cls) return '—';
  if (cls.kind === 'standard') return 'standard';
  if (cls.kind === 'non-standard')
    return `non-standard (${cls.labels.join(', ')})`;
  return `standard on pull requests; non-standard (${cls.nonStandard.join(', ')}) on some other events`;
}

/** The report section: a visible summary line, the table collapsed under it. */
function renderCiImpact(impact) {
  if (!impact) return '';
  const {jobMinutes, pool, concurrent, wall} = impact;
  // A pool change under 10% keeps one decimal, so +0.5% does not read as 0%.
  const percent = value =>
    value === 0 ? '0%' : `${signed(value, Math.abs(value) < 10 ? 1 : 0)}%`;
  const summary = [
    `${signed(jobMinutes.after - jobMinutes.before, 1)} job-min per update`,
    `pool ${percent(pool.percent)}`,
    wall.delta === null
      ? null
      : `time to green ${signed(wall.delta, 1, ' min')}`,
    impact.changes.some(change => change.after?.kind === 'non-standard')
      ? 'non-standard runners on pull requests'
      : 'standard runners on pull requests',
    ...['added', 'removed'].map(kind => {
      const count = (impact.otherWorkflows || []).filter(
        workflow => workflow.change === kind,
      ).length;
      return count > 0
        ? `${count} workflow${count === 1 ? '' : 's'} ${kind}`
        : null;
    }),
  ].filter(Boolean);
  const rows = [
    [
      'Job-minutes per PR update',
      amount(jobMinutes.before, 1),
      amount(jobMinutes.after, 1),
      signed(jobMinutes.after - jobMinutes.before, 1),
    ],
    [
      'Runner pool, runner-minutes a day',
      amount(pool.before),
      amount(pool.after),
      `${signed(pool.after - pool.before)} (${percent(pool.percent)})`,
    ],
    [
      'Average concurrent jobs',
      amount(concurrent.before, 1),
      amount(concurrent.after, 1),
      signed(concurrent.after - concurrent.before, 1),
    ],
    [
      'Time to green (median → this run)',
      wall.before === null ? '—' : `${amount(wall.before, 1)} min`,
      wall.after === null ? '—' : `${amount(wall.after, 1)} min`,
      wall.delta === null ? '—' : signed(wall.delta, 1, ' min'),
    ],
    ['Runs a day', amount(impact.runsPerDay), amount(impact.runsPerDay), '0'],
  ];
  const workflows = (impact.otherWorkflows || [])
    .map(
      workflow =>
        `\`${workflow.file}\` ${workflow.change}: runs on ${workflow.triggers}; ${
          workflow.jobs.length === 0
            ? 'no jobs'
            : [
                ...new Set(workflow.jobs.map(job => runnerText(job.runner))),
              ].join(', ')
        } runners${workflow.change === 'removed' ? '' : '; its minutes appear once it has run'}`,
    )
    .join(' · ');
  const jobs = impact.changes
    .map(
      change =>
        `\`${change.name}\` ${change.change}: ${change.change === 'removed' ? runnerText(change.before) : runnerText(change.after)}`,
    )
    .join(' · ');
  return `<details>\n<summary>CI impact: ${summary.join(' · ')}${impact.flags.length > 0 ? ' ⚠️' : ''}</summary>\n\n| | Before | After | Change |\n|---|---|---|---|\n${rows
    .map(row => `| ${row.join(' | ')} |`)
    .join(
      '\n',
    )}\n\n${jobs ? `Changed jobs: ${jobs}\n\n` : ''}${workflows ? `Other workflows: ${workflows}\n\n` : ''}${impact.flags.length > 0 ? `**Flags:** ${impact.flags.join('; ')}.\n\n` : ''}Assumptions: before is each job's average over the last ${num(impact.sampled)} pull-request runs; after keeps that for unchanged jobs and uses this run's minutes for added or changed ones; runs a day is the last 7 days' average; time to green compares this run with the median.\n\n</details>\n\n`;
}

module.exports = {
  describeWorkflow,
  CI_PATH,
  isCiChange,
  runnerClass,
  diffWorkflow,
  summarizeHistory,
  estimateImpact,
  renderCiImpact,
};
