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

const {inline, num} = require('./report-text');
const {baseJobName} = require('./pr-status');
const {
  STANDARD_RUNNERS,
  labelsOf,
  isUnresolved,
} = require('./runner-labels.cjs');

/** Paths whose change makes a pull request a CI change. */
const CI_PATH =
  /^(\.github\/workflows\/|\.github\/actions\/|\.github\/scripts\/|\.github\/ci-|scripts\/ci-)/;

const FLAG_POOL_PERCENT = 10;
const FLAG_WALL_MINUTES = 2;

function isCiChange(files) {
  return (files || []).some(file => CI_PATH.test(file));
}

/**
 * A runner class from the labels a job can resolve to (runner-labels.cjs):
 * `standard`, `non-standard`, `mixed` (an expression that picks either), or
 * `unknown` (a label no reading can resolve, such as `${{ vars.X }}`).
 */
function classifyLabels(all) {
  const labels = [...new Set(all.map(String))];
  const unresolved = labels.filter(isUnresolved);
  const resolved = labels.filter(label => !isUnresolved(label));
  const nonStandard = resolved.filter(label => !STANDARD_RUNNERS.has(label));
  if (labels.length === 0 || unresolved.length > 0)
    return {kind: 'unknown', labels, nonStandard};
  if (nonStandard.length === 0) return {kind: 'standard', labels};
  if (nonStandard.length === resolved.length)
    return {kind: 'non-standard', labels};
  return {kind: 'mixed', labels, nonStandard};
}

/** A job's runner class: from the job, or from a bare `runs-on` value. */
function runnerClass(jobOrRunsOn) {
  const job =
    jobOrRunsOn &&
    typeof jobOrRunsOn === 'object' &&
    !Array.isArray(jobOrRunsOn)
      ? jobOrRunsOn
      : {'runs-on': jobOrRunsOn};
  return classifyLabels(labelsOf(job));
}

/**
 * One class for jobs that share a name: every label any of them can pick. A
 * variant that always runs on a non-standard runner makes the job
 * non-standard, whatever the other variants use.
 */
function mergeClasses(a, b) {
  if (!a) return b;
  if (!b) return a;
  const merged = classifyLabels([...a.labels, ...b.labels]);
  if (a.kind === 'non-standard' || b.kind === 'non-standard')
    return {kind: 'non-standard', labels: merged.labels};
  return merged;
}

/** A job's name as the run shows it, without its matrix suffix. */
function displayName(id, job) {
  return baseJobName(job?.name ?? id);
}

/** The non-standard labels a runner class can pick. */
function nonStandardLabels(cls) {
  if (!cls) return [];
  if (cls.kind === 'non-standard') return cls.labels;
  return cls.nonStandard ?? [];
}

/** Whether a job's head runner adds a non-standard label its base did not have. */
function movesOntoNonStandard(before, after) {
  const was = nonStandardLabels(before);
  return nonStandardLabels(after).some(label => !was.includes(label));
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
      before: before ? runnerClass(before) : null,
      after: after ? runnerClass(after) : null,
    });
  }
  // Decided per job id, before variants share a name below.
  const movedOntoNonStandard = [
    ...new Set(
      changes
        .filter(change => movesOntoNonStandard(change.before, change.after))
        .map(change => change.name),
    ),
  ];
  // Variants of one job (`pr-a11y (browser specs)`, `pr-a11y (full audit)`)
  // share a name in the report: one entry per name and kind of change, with
  // the runner classes of all of them merged.
  const byKey = new Map();
  for (const change of changes) {
    const key = `${change.name}:${change.change}`;
    const seen = byKey.get(key);
    byKey.set(
      key,
      seen
        ? {
            ...seen,
            before: mergeClasses(seen.before, change.before),
            after: mergeClasses(seen.after, change.after),
          }
        : change,
    );
  }
  const unique = [...byKey.values()];
  return {
    changes: unique,
    movedOntoNonStandard,
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
  const flags = [
    ...(diff.movedOntoNonStandard || []).map(
      name => `${inline(name)} moves onto a non-standard runner`,
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
  if (typeof on === 'string') return inline(on);
  if (Array.isArray(on)) return on.map(inline).join(', ');
  return Object.entries(on)
    .map(([event, config]) =>
      event === 'schedule' && Array.isArray(config)
        ? `schedule (${config.map(entry => inline(entry.cron)).join(', ')})`
        : inline(event),
    )
    .join(', ');
}

/**
 * A changed workflow other than CI's own: whether it was added, removed or
 * changed, when it runs, and each job's runner class, compared job by job.
 * Its minutes are not measured here: this run's history covers CI's own
 * workflow.
 */
function describeWorkflow(file, base, head) {
  const doc = head ?? base;
  const jobs = Object.entries(doc?.jobs || {}).map(([id, job]) => ({
    name: displayName(id, job),
    runner: runnerClass(job),
  }));
  const baseJobs = base?.jobs || {};
  return {
    file,
    change: !base ? 'added' : !head ? 'removed' : 'changed',
    triggers: triggerText(doc?.on),
    jobs,
    nonStandard: Object.entries(head?.jobs || {}).some(([id, job]) =>
      movesOntoNonStandard(
        baseJobs[id] ? runnerClass(baseJobs[id]) : null,
        runnerClass(job),
      ),
    ),
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
  if (cls.kind === 'unknown')
    return 'unknown (an expression this report cannot resolve)';
  if (cls.kind === 'non-standard')
    return `non-standard (${cls.labels.map(inline).join(', ')})`;
  return `standard or non-standard by event (${cls.nonStandard.map(inline).join(', ')})`;
}

/** The runner classes of what changed, in a few words. */
function runnerSummary(classes) {
  if (classes.some(cls => cls.kind === 'non-standard'))
    return 'non-standard runners';
  if (classes.some(cls => cls.kind === 'mixed' || cls.kind === 'unknown'))
    return 'some runners chosen by event or unknown';
  return 'standard runners';
}

/** The report section: a visible summary line, the table collapsed under it. */
function renderCiImpact(impact) {
  if (!impact) return '';
  if (impact.unavailable)
    return '**CI impact:** not measured on this run; the run history or the workflow files could not be read.\n\n';
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
    runnerSummary([
      ...impact.changes.map(change => change.after).filter(Boolean),
      ...(impact.otherWorkflows || []).flatMap(workflow =>
        workflow.change === 'removed'
          ? []
          : workflow.jobs.map(job => job.runner),
      ),
    ]),
    (impact.otherWorkflows || []).length > 0
      ? `${(impact.otherWorkflows || []).length} other workflow${(impact.otherWorkflows || []).length === 1 ? '' : 's'} changed (not measured)`
      : null,
    (impact.unmeasuredFiles || []).length > 0
      ? `${impact.unmeasuredFiles.length} CI action or script file${impact.unmeasuredFiles.length === 1 ? '' : 's'} changed (not measured)`
      : null,
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
        `${inline(workflow.file)} ${workflow.change}: runs on ${workflow.triggers}; ${
          workflow.jobs.length === 0
            ? 'no jobs'
            : [
                ...new Set(workflow.jobs.map(job => runnerText(job.runner))),
              ].join(', ')
        } runners${workflow.change === 'removed' ? '' : '; its minutes are not measured here'}`,
    )
    .join(' · ');
  const files = impact.unmeasuredFiles || [];
  const unmeasured =
    files.length > 0
      ? `Not measured (the jobs that use these keep their recent minutes above): ${files
          .slice(0, 10)
          .map(inline)
          .join(
            ', ',
          )}${files.length > 10 ? `, and ${files.length - 10} more` : ''}.\n\n`
      : '';
  const jobs = impact.changes
    .map(
      change =>
        `${inline(change.name)} ${change.change}: ${change.change === 'removed' ? runnerText(change.before) : runnerText(change.after)}`,
    )
    .join(' · ');
  return `<details>\n<summary>CI impact: ${summary.join(' · ')}${impact.flags.length > 0 ? ' ⚠️' : ''}</summary>\n\n| | Before | After | Change |\n|---|---|---|---|\n${rows
    .map(row => `| ${row.join(' | ')} |`)
    .join(
      '\n',
    )}\n\n${jobs ? `Changed jobs: ${jobs}\n\n` : ''}${workflows ? `Other workflows: ${workflows}\n\n` : ''}${unmeasured}${impact.flags.length > 0 ? `**Flags:** ${impact.flags.join('; ')}.\n\n` : ''}Assumptions: before is each job's average over the last ${num(impact.sampled)} pull-request runs; after keeps that for unchanged jobs and uses this run's minutes for added or changed ones; runs a day averages the seven whole days before today; time to green compares this run with the median.\n\n</details>\n\n`;
}

module.exports = {
  inlineName: inline,
  describeWorkflow,
  CI_PATH,
  isCiChange,
  runnerClass,
  diffWorkflow,
  summarizeHistory,
  estimateImpact,
  renderCiImpact,
};
