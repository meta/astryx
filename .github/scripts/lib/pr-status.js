// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pr-status.js
 * @input The source CI run's job list (names, conclusions, steps), this
 *   head's Vercel preview state, the analysis, the size reports, the
 *   accessibility report, the visual verdict and, when present, the
 *   touched-components report
 * @output The PR report's top: one status table (preview first, then size,
 *   visual, accessibility, RTL, perf when it ran, and CI jobs), the touched
 *   components with their preview links and results, and the collapsed CI job
 *   table
 * @position Used by generate-pr-comment.js. Everything here reads data the CI
 *   run and the comment job already have; nothing starts a job.
 */

const {inline, num} = require('./report-text');

const runLabels = require('../run-labels.cjs');

/** The heavy suites a pull request runs only with its `ci:run-<suite>` label. */
const SUITES = [
  {id: 'visual', label: 'Visual', jobs: ['visual-scout', 'pr-visual']},
  {id: 'a11y', label: 'Accessibility', jobs: ['pr-a11y']},
  {id: 'rtl', label: 'RTL', jobs: ['pr-rtl', 'pr-rtl-shard', 'pr-rtl-merge']},
  {id: 'perf', label: 'Perf', jobs: ['perf']},
];

/** The sentence a heavy suite shows when it did not run (run-labels.cjs owns it). */
function notRunSentence(suite) {
  return runLabels.notRunSentence(suite.id);
}

const SCOPE_STEP = "Decide this job's scope";
const BOOKKEEPING_STEP = /^(Set up job|Complete job|Post )/;

/** A matrix leg's job name without its `(1/3)` suffix. */
function baseJobName(name) {
  return String(name ?? '').replace(/\s*\([^)]*\)\s*$/, '');
}

/**
 * What one job did: `ran` (with its conclusion), `scoped-out` (it started,
 * decided nothing in its scope changed, and skipped its work), or `not-run`
 * (its run condition was false).
 */
function classifyJob(job) {
  if (job.conclusion === 'skipped') return {state: 'not-run'};
  const steps = job.steps || [];
  const skipStep = steps.find(
    step => /^Skip /.test(step.name) && step.conclusion === 'success',
  );
  if (skipStep && job.conclusion === 'success')
    return {
      state: 'scoped-out',
      reason: 'specialized change (spec, docsite or tooling only)',
    };
  const scopeIndex = steps.findIndex(step => step.name === SCOPE_STEP);
  if (scopeIndex !== -1 && job.conclusion === 'success') {
    const work = steps
      .slice(scopeIndex + 1)
      .filter(step => !BOOKKEEPING_STEP.test(step.name));
    if (work.length > 0 && work.every(step => step.conclusion === 'skipped'))
      return {state: 'scoped-out', reason: 'nothing in its paths changed'};
  }
  return {state: 'ran', conclusion: job.conclusion || job.status || 'unknown'};
}

/** Jobs grouped by name (matrix legs together), each with one state. */
function summarizeJobs(jobs) {
  const groups = new Map();
  for (const job of jobs || []) {
    const name = baseJobName(job.name);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(classifyJob(job));
  }
  const summary = [];
  for (const [name, legs] of groups) {
    const ran = legs.filter(leg => leg.state === 'ran');
    if (ran.length > 0) {
      const failed = ran.find(leg => leg.conclusion !== 'success');
      summary.push({
        name,
        state: 'ran',
        conclusion: failed ? failed.conclusion : 'success',
      });
    } else if (legs.some(leg => leg.state === 'scoped-out')) {
      summary.push({
        name,
        state: 'scoped-out',
        reason: legs.find(leg => leg.reason).reason,
      });
    } else {
      summary.push({name, state: 'not-run'});
    }
  }
  return summary.sort((a, b) => a.name.localeCompare(b.name));
}

function suiteOf(jobName) {
  return SUITES.find(suite => suite.jobs.includes(jobName)) ?? null;
}

const CONCLUSION_TEXT = {
  success: '✅ passed',
  failure: '❌ failed',
  cancelled: '⏹ cancelled',
  timed_out: '❌ timed out',
};

function conclusionText(conclusion) {
  return CONCLUSION_TEXT[conclusion] ?? inline(conclusion);
}

/** One suite's state from its jobs: ran (and how), scoped out, or not run. */
function suiteJobState(suite, jobSummary) {
  const jobs = jobSummary.filter(job => suite.jobs.includes(job.name));
  if (jobs.length === 0) return null;
  const ran = jobs.filter(job => job.state === 'ran');
  if (ran.length > 0) {
    const failed = ran.find(job => job.conclusion !== 'success');
    return {state: 'ran', conclusion: failed ? failed.conclusion : 'success'};
  }
  if (jobs.some(job => job.state === 'scoped-out'))
    return {state: 'scoped-out'};
  return {state: 'not-run'};
}

function previewCell(preview) {
  if (!preview || preview.state === 'none') return null;
  if (preview.state === 'fork')
    return 'No preview for pull requests from forks.';
  if (preview.state === 'unknown')
    return "This branch's preview address cannot be known in advance; open it from Vercel's comment.";
  const links = origin =>
    `[Storybook](${origin}/storybook/) · [Sandbox](${origin}/sandbox/) · [Docs](${origin}/)`;
  if (preview.state === 'ready')
    return `${links(preview.url)} · built from \`${inline(String(preview.sha).slice(0, 7))}\``;
  if (preview.state === 'failed')
    return `❌ The preview for \`${inline(String(preview.sha).slice(0, 7))}\` failed to build; see Vercel's comment.`;
  // Building, or Vercel has not reported this head yet: the branch alias
  // serves the latest ready deployment, which can be an earlier push.
  return `⏳ Preview building for \`${inline(String(preview.sha).slice(0, 7))}\`… ${preview.aliasOrigin ? `Until it's ready, ${links(preview.aliasOrigin)} open the branch's previous preview.` : ''}`.trim();
}

function visualCell(verdict, jobState, suite) {
  if (verdict) {
    if (verdict.status === 'skipped')
      return `⏭ skipped: ${inline(verdict.reason)}`;
    if (verdict.status === 'failed')
      return `❌ ${num(verdict.counts?.failed)} shot(s) could not be captured`;
    const changed = verdict.changes?.length ?? 0;
    const added = verdict.added?.length ?? 0;
    const removed = verdict.removed?.length ?? 0;
    if (changed > 0)
      return `🔍 ${changed} of ${num(verdict.counts?.total)} shots changed: review below`;
    if (added > 0 || removed > 0)
      return `🔍 ${added} added · ${removed} removed`;
    return `✅ no change across ${num(verdict.counts?.total)} shots`;
  }
  return jobCell(jobState, suite);
}

function a11yCell(report, jobState, suite) {
  if (report) {
    const violations = Object.values(report.components || {}).reduce(
      (sum, component) => sum + (component.violations?.length || 0),
      0,
    );
    return violations === 0
      ? '✅ no violations'
      : `❌ ${violations} violation(s): details below`;
  }
  return jobCell(jobState, suite);
}

function jobCell(jobState, suite) {
  if (!jobState || jobState.state === 'not-run')
    return `⏭ ${notRunSentence(suite)}`;
  if (jobState.state === 'scoped-out')
    return '⏭ skipped: nothing it covers changed';
  return conclusionText(jobState.conclusion);
}

function sizeCell({analysis, budgetFlags, packageSize}) {
  const parts = [];
  const head = analysis.componentSizes || {};
  const base = analysis.baseComponentSizes || {};
  const deltas = Object.keys(head)
    .map(key => ({
      key,
      delta:
        typeof head[key]?.importGzipBytes === 'number' &&
        typeof base[key]?.importGzipBytes === 'number'
          ? head[key].importGzipBytes - base[key].importGzipBytes
          : null,
    }))
    .filter(entry => entry.delta !== null);
  if (Object.keys(head).length > 0) {
    const largest = deltas.sort((a, b) => b.delta - a.delta)[0];
    const largestText = largest
      ? `, largest ${largest.delta > 0 ? '+' : ''}${bytes(largest.delta)} (${inline(largest.key)})`
      : '';
    parts.push(
      budgetFlags.length > 0
        ? `⚠️ ${budgetFlags.length} component(s) over the touch-only budget${largestText}`
        : `✅ ${Object.keys(head).length} component(s) within budget${largestText}`,
    );
  }
  if (packageSize) {
    if (packageSize.verdict === 'over-budget')
      parts.push('⚠️ a published package grew past its budget');
    else if (packageSize.verdict === 'no-base')
      parts.push('packages measured (no base to compare)');
    else parts.push('packages within budget');
    const added = packageSize.addedDependencies || [];
    if (added.length > 0)
      parts.push(
        `new dependencies: ${added.map(dep => inline(dep.name)).join(', ')}`,
      );
  }
  return parts.length > 0 ? parts.join(' · ') : 'no published package changed';
}

function bytes(value) {
  const magnitude = Math.abs(value);
  if (magnitude < 1024) return `${value}B`;
  return `${(value / 1024).toFixed(1)}KB`;
}

function ciCell(jobSummary) {
  if (!jobSummary || jobSummary.length === 0) return null;
  const ran = jobSummary.filter(job => job.state === 'ran');
  const failed = ran.filter(job => job.conclusion !== 'success');
  const scoped = jobSummary.filter(job => job.state === 'scoped-out');
  const parts = [`${ran.length} ran`];
  if (failed.length > 0)
    parts.push(`❌ failed: ${failed.map(job => inline(job.name)).join(', ')}`);
  if (scoped.length > 0) parts.push(`${scoped.length} skipped by path`);
  return `${parts.join(' · ')} (table below)`;
}

/** The status table every report leads with. */
function buildStatusTable({
  preview,
  analysis,
  budgetFlags = [],
  packageSize = null,
  a11yReport = null,
  visualVerdict = null,
  jobs = null,
}) {
  const jobSummary = jobs ? summarizeJobs(jobs) : [];
  const rows = [];
  const previewText = previewCell(preview);
  if (previewText) rows.push(['Preview', previewText]);
  rows.push(['Size', sizeCell({analysis, budgetFlags, packageSize})]);
  const [visual, a11y, rtl, perf] = SUITES;
  rows.push([
    visual.label,
    visualCell(visualVerdict, suiteJobState(visual, jobSummary), visual),
  ]);
  rows.push([
    a11y.label,
    a11yCell(a11yReport, suiteJobState(a11y, jobSummary), a11y),
  ]);
  rows.push([rtl.label, jobCell(suiteJobState(rtl, jobSummary), rtl)]);
  const perfState = suiteJobState(perf, jobSummary);
  if (perfState?.state === 'ran')
    rows.push([perf.label, jobCell(perfState, perf)]);
  const ci = ciCell(jobSummary);
  if (ci) rows.push(['CI jobs', ci]);
  return `| Check | Result |\n|-------|--------|\n${rows
    .map(([check, result]) => `| ${check} | ${result} |`)
    .join('\n')}\n\n`;
}

/** Every job of the run that applies to a pull request, with what it did. */
function buildJobTable(jobs) {
  const summary = summarizeJobs(jobs || []);
  const shown = summary.filter(
    job => job.state !== 'not-run' || suiteOf(job.name) !== null,
  );
  if (shown.length === 0) return '';
  const hidden = summary.length - shown.length;
  const rows = shown.map(job => {
    if (job.state === 'ran')
      return `| ${inline(job.name)} | ${conclusionText(job.conclusion)} | |`;
    if (job.state === 'scoped-out')
      return `| ${inline(job.name)} | ⏭ skipped | ${inline(job.reason)} |`;
    return `| ${inline(job.name)} | ⏭ not run | ${notRunSentence(suiteOf(job.name))} |`;
  });
  return `<details>\n<summary>CI jobs: ${shown.filter(job => job.state === 'ran').length} ran, ${shown.filter(job => job.state === 'scoped-out').length} skipped by path</summary>\n\n| Job | Result | Why |\n|-----|--------|-----|\n${rows.join('\n')}\n${hidden > 0 ? `\n${hidden} release-only job(s) do not apply to pull requests.\n` : ''}\n</details>\n\n`;
}

/** A Storybook docs link from a story title (`Core/Button` → `core-button`). */
function storybookLink(origin, storyTitle) {
  const title = Array.isArray(storyTitle) ? storyTitle[0] : storyTitle;
  if (!origin || !title) return null;
  const id = String(title)
    .toLowerCase()
    .replace(/\//g, '-')
    .replace(/[^a-z0-9_-]/g, '');
  return `${origin}/storybook/?path=/docs/${id}--docs`;
}

const RESULT_TEXT = {
  pass: '✅',
  fail: '❌',
  changed: '🔍 changed',
  'not-run': '⏭',
};

function resultText(value) {
  if (value == null) return '—';
  return RESULT_TEXT[value] ?? inline(value);
}

/**
 * The components this pull request touches: a docs page and Storybook stories
 * in this head's preview, and each suite's result for it. Results come from
 * the touched-components report when the run wrote one; otherwise from the
 * accessibility report and visual verdict, and are blank for a suite with no
 * per-component result.
 */
function buildTouchedComponents({
  analysis,
  origin,
  touched = null,
  a11yReport = null,
  visualVerdict = null,
}) {
  const names = [
    ...(analysis.newComponents || []),
    ...(analysis.modifiedComponents || []),
  ];
  const fromReport = new Map(
    (touched?.components || []).map(component => [component.name, component]),
  );
  for (const name of fromReport.keys())
    if (!names.includes(name)) names.push(name);
  if (names.length === 0) return '';
  const visualChanges = visualVerdict?.changes || [];
  const rows = names.map(name => {
    const stats = analysis.componentStats?.[name] || {};
    const reported = fromReport.get(name)?.results || {};
    const docs = origin
      ? `[Docs](${origin}/components/${encodeURIComponent(name)})`
      : '—';
    const stories = storybookLink(origin, stats.storyTitle);
    const a11y =
      reported.a11y ??
      (a11yReport
        ? (a11yReport.components?.[name]?.violations?.length ?? 0) > 0
          ? 'fail'
          : 'pass'
        : null);
    const visual =
      reported.visual ??
      (visualVerdict && visualVerdict.status !== 'skipped'
        ? visualChanges.some(change => change.component === name)
          ? 'changed'
          : 'pass'
        : null);
    return `| ${inline(name)} | ${docs} | ${stories ? `[Stories](${stories})` : '—'} | ${resultText(visual)} | ${resultText(a11y)} | ${resultText(reported.rtl)} |`;
  });
  return `**Touched components**\n\n| Component | Docs | Storybook | Visual | A11y | RTL |\n|-----------|------|-----------|--------|------|-----|\n${rows.join('\n')}\n\n`;
}

module.exports = {
  SUITES,
  notRunSentence,
  classifyJob,
  summarizeJobs,
  buildStatusTable,
  buildJobTable,
  buildTouchedComponents,
  storybookLink,
};
