// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Aggregates run records into pass rates with intervals and a report.
 * @input run records written by the runner
 * @output summary.json, report.md, and report.html in the run directory
 * @position Last step of a run; also runs alone with --report-only
 */

import fs from 'node:fs';
import path from 'node:path';
import {differenceInterval, summarize, wilsonInterval} from './stats.mjs';

const percent = value => (value === null ? 'n/a' : `${(value * 100).toFixed(0)}%`);
const interval = ({low, high}) => (low === null ? 'n/a' : `${percent(low)}–${percent(high)}`);
const money = value => (value === null || value === undefined ? 'n/a' : `$${value.toFixed(2)}`);

export function summarizeRecords(records, armIds, taskIds, spentUsd) {
  const graded = records.filter(record => record.status === 'graded');
  const arms = {};
  for (const armId of armIds) {
    const mine = graded.filter(record => record.arm === armId);
    const passes = mine.filter(record => record.passed).length;
    const failures = {};
    for (const record of mine) {
      if (!record.passed) failures[record.failure] = (failures[record.failure] ?? 0) + 1;
    }
    arms[armId] = {
      runs: mine.length,
      passes,
      ...wilsonInterval(passes, mine.length),
      failures,
      costUsd: summarize(mine.map(record => record.agent?.costUsd)),
      turns: summarize(mine.map(record => record.agent?.turns)),
      agentSeconds: summarize(mine.map(record => (record.agent?.durationMs ?? NaN) / 1000)),
      outputTokens: summarize(mine.map(record => record.agent?.usage?.output_tokens)),
      axeSeriousOrCritical: summarize(
        mine.map(record => {
          const counts = record.grade?.axe?.counts;
          return counts ? counts.serious + counts.critical : NaN;
        }),
      ),
      docsCommands: summarize(mine.map(record => record.audit?.docsCommands?.length)),
    };
  }
  const tasks = {};
  for (const taskId of taskIds) {
    tasks[taskId] = {};
    for (const armId of armIds) {
      const mine = graded.filter(record => record.arm === armId && record.task === taskId);
      tasks[taskId][armId] = {passes: mine.filter(record => record.passed).length, runs: mine.length};
    }
  }
  const [a, b] = armIds;
  const difference =
    a && b
      ? {
          arms: [a, b],
          ...differenceInterval(arms[a].passes, arms[a].runs, arms[b].passes, arms[b].runs),
        }
      : null;
  const notGraded = {};
  for (const record of records) {
    if (record.status !== 'graded') notGraded[record.status] = (notGraded[record.status] ?? 0) + 1;
  }
  const recordCost = records.reduce((sum, record) => sum + (record.agent?.costUsd ?? 0), 0);
  const warned = graded
    .filter(record => (record.audit?.warnings?.length ?? 0) > 0)
    .map(record => `${record.task} ${record.arm} r${record.rep}`);
  return {arms, tasks, difference, notGraded, warned, totalCostUsd: spentUsd ?? recordCost};
}

export function renderMarkdown(meta, summary) {
  const armIds = Object.keys(summary.arms);
  const lines = [
    `# Vibe eval: ${meta.taskSet}`,
    '',
    `Model \`${meta.model}\` for every arm · ${meta.reps} runs per task per arm · cap ${money(meta.budgetUsd)} · spent ${money(summary.totalCostUsd)}`,
    '',
    '| Arm | Pass rate | 95% interval | Passes | Mean cost | Mean turns | Failures |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const armId of armIds) {
    const arm = summary.arms[armId];
    const failures = Object.entries(arm.failures).map(([reason, count]) => `${reason} ${count}`).join(', ') || 'none';
    lines.push(
      `| ${armId} | ${percent(arm.rate)} | ${interval(arm)} | ${arm.passes}/${arm.runs} | ${money(arm.costUsd.mean)} | ${arm.turns.mean?.toFixed(1) ?? 'n/a'} | ${failures} |`,
    );
  }
  if (summary.difference) {
    const [a, b] = summary.difference.arms;
    lines.push('', `Difference ${a} − ${b}: ${percent(summary.difference.difference)} (95% interval ${interval(summary.difference)}).`);
  }
  lines.push('', '| Task | ' + armIds.join(' | ') + ' |', '|---|' + armIds.map(() => '---|').join(''));
  for (const [taskId, byArm] of Object.entries(summary.tasks)) {
    lines.push(`| ${taskId} | ` + armIds.map(armId => `${byArm[armId].passes}/${byArm[armId].runs}`).join(' | ') + ' |');
  }
  const notGraded = Object.entries(summary.notGraded).map(([status, count]) => `${status} ${count}`);
  if (notGraded.length > 0) lines.push('', `Not graded and not in the pass rates: ${notGraded.join(', ')}. See records.`);
  // The audit cannot see every read, so a person reviews each run that named a path outside.
  if (summary.warned.length > 0) lines.push('', `Audit warnings to review (${summary.warned.length} runs): ${summary.warned.join(', ')}.`);
  return `${lines.join('\n')}\n`;
}

const escapeHtml = value =>
  String(value).replace(/[&<>"]/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[character]);

export function renderHtml(meta, summary, records, runDir) {
  const rel = file => (file ? path.relative(runDir, file) : null);
  const cards = records
    .map(record => {
      const shots = record.grade?.screenshots ?? {};
      const images = ['desktopInitial', 'desktopFinal', 'mobileInitial']
        .filter(key => shots[key])
        .map(key => `<figure><img loading="lazy" src="${escapeHtml(rel(shots[key]))}" alt="${key}"><figcaption>${key}</figcaption></figure>`)
        .join('');
      const steps = (record.grade?.probe?.steps ?? [])
        .map(step => `<li class="${step.passed ? 'ok' : 'bad'}">${escapeHtml(step.name)}${step.error ? `: ${escapeHtml(step.error)}` : ''}</li>`)
        .join('');
      const verdict = record.status !== 'graded' ? record.status : record.passed ? 'pass' : `fail: ${record.failure}`;
      return `<section class="run ${record.passed ? 'pass' : 'fail'}"><h3>${escapeHtml(record.task)} · ${escapeHtml(record.arm)} · run ${record.rep}</h3><p>${escapeHtml(verdict)} · ${money(record.agent?.costUsd)} · ${record.agent?.turns ?? 'n/a'} turns · audit warnings ${record.audit?.warnings?.length ?? 0}</p><ol>${steps}</ol><div class="shots">${images}</div></section>`;
    })
    .join('\n');
  const markdown = escapeHtml(renderMarkdown(meta, summary));
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vibe eval ${escapeHtml(meta.taskSet)}</title><style>
body{font:14px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1100px;padding:16px}
pre{white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:8px}
.run{border:1px solid #ddd;border-radius:8px;padding:8px 12px;margin:12px 0}
.run.pass h3::before{content:"✓ ";color:#1a7f37}.run.fail h3::before{content:"✗ ";color:#cf222e}
.ok{color:#1a7f37}.bad{color:#cf222e}
.shots{display:flex;gap:8px;flex-wrap:wrap}figure{margin:0;max-width:340px}img{max-width:100%;border:1px solid #eee}
</style></head><body><pre>${markdown}</pre>${cards}</body></html>`;
}

export function writeReport(runDir, meta, records) {
  const summary = summarizeRecords(records, meta.arms, meta.tasks, meta.spentUsd);
  fs.writeFileSync(path.join(runDir, 'summary.json'), `${JSON.stringify({meta, summary}, null, 2)}\n`);
  fs.writeFileSync(path.join(runDir, 'report.md'), renderMarkdown(meta, summary));
  fs.writeFileSync(path.join(runDir, 'report.html'), renderHtml(meta, summary, records, runDir));
  return summary;
}
